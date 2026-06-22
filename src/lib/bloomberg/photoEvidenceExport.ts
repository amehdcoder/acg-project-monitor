// Bundles ALL Bloomberg School Enrolment Validation photo evidence into a single
// ZIP for download by admins (Systems Admin / Super Admin / Owner / Co-owner).
//
// Each submitted validation stores its photos in the `bloomberg-evidence`
// storage bucket as { signboard, classroom, register, additional } paths in the
// `evidence` jsonb column. This builder downloads every photo via a signed URL
// and writes it into the ZIP under a human-readable folder named after the
// school, state/LGA and validator, alongside a manifest CSV mapping each photo
// back to its school details so admins can cross-reference evidence with data.

import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "bloomberg-evidence";

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

// Make a string safe to use as a file/folder name.
const safe = (s: string | null | undefined, fallback = "unknown") =>
  (s || fallback)
    .toString()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || fallback;

const csvCell = (v: any) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface PhotoExportProgress {
  done: number;
  total: number;
}

/**
 * Build and download a ZIP of all submitted validation photo evidence.
 * Returns the number of photos successfully added.
 */
export async function exportPhotoEvidence(
  onProgress?: (p: PhotoExportProgress) => void,
): Promise<{ photos: number; schools: number }> {
  const [validations, profiles, schools] = await Promise.all([
    fetchAll<any>(
      "bloomberg_validations",
      "id,validator_id,school_key,school_name,school_code,state,lga,ward,evidence,status,submitted_at,created_at",
    ),
    fetchAll<any>("profiles", "user_id,first_name,last_name,email"),
    fetchAll<any>("bloomberg_schools", "school_key,state_label,lga_label"),
  ]);

  const nameByUser = new Map<string, string>();
  profiles.forEach((p) => {
    const nm = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown";
    nameByUser.set(p.user_id, nm);
  });
  const labelByKey = new Map<string, { state: string; lga: string }>();
  schools.forEach((s) =>
    labelByKey.set(s.school_key, { state: s.state_label || "", lga: s.lga_label || "" }),
  );

  // Only submitted records carry authoritative evidence.
  const rows = validations.filter(
    (v) => v.status === "sent" && v.evidence && typeof v.evidence === "object",
  );

  // Collect every photo path with its context.
  type Item = {
    path: string;
    slot: string;
    school: string;
    code: string;
    state: string;
    lga: string;
    validator: string;
    date: string;
    folder: string;
    filename: string;
  };
  const items: Item[] = [];
  rows.forEach((v) => {
    const meta = v.school_key ? labelByKey.get(v.school_key) : undefined;
    const state = meta?.state || v.state || "Unspecified";
    const lga = meta?.lga || v.lga || "Unspecified";
    const validator = nameByUser.get(v.validator_id) || "Unknown validator";
    const school = v.school_name || v.school_code || v.school_key || "Unknown school";
    const date = v.submitted_at || v.created_at || "";
    const folder = `${safe(state)}/${safe(lga)}/${safe(school)} - ${safe(validator)}`;
    Object.entries(v.evidence as Record<string, string>).forEach(([slot, path]) => {
      if (!path || typeof path !== "string") return;
      const ext = path.split(".").pop()?.split("?")[0] || "jpg";
      items.push({
        path,
        slot,
        school,
        code: v.school_code || "",
        state,
        lga,
        validator,
        date,
        folder,
        filename: `${safe(slot)}.${ext}`,
      });
    });
  });

  if (items.length === 0) {
    throw new Error("No photo evidence found in submitted validations.");
  }

  const zip = new JSZip();
  const manifest: string[] = [
    ["State", "LGA", "School", "School Code", "Validator", "Photo Type", "Date Submitted", "File"]
      .map(csvCell)
      .join(","),
  ];

  let done = 0;
  let added = 0;
  const schoolsWithPhotos = new Set<string>();
  const usedNames = new Set<string>();

  // Download with a small concurrency limit to avoid overwhelming the network.
  const CONCURRENCY = 6;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const it = items[i];
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(it.path, 300);
        if (signed?.signedUrl) {
          const res = await fetch(signed.signedUrl);
          if (res.ok) {
            const blob = await res.blob();
            let zipPath = `${it.folder}/${it.filename}`;
            // Guarantee uniqueness if two photos collide on name.
            let n = 1;
            while (usedNames.has(zipPath)) {
              zipPath = `${it.folder}/${it.filename.replace(/(\.[^.]+)$/, `_${n++}$1`)}`;
            }
            usedNames.add(zipPath);
            zip.file(zipPath, blob);
            manifest.push(
              [it.state, it.lga, it.school, it.code, it.validator, it.slot, it.date, zipPath]
                .map(csvCell)
                .join(","),
            );
            added++;
            schoolsWithPhotos.add(it.school + it.code);
          }
        }
      } catch {
        /* skip unreadable photo, keep going */
      } finally {
        done++;
        onProgress?.({ done, total: items.length });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (added === 0) {
    throw new Error("Photo evidence could not be downloaded (no readable files).");
  }

  zip.file("_manifest.csv", manifest.join("\n"));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  saveAs(blob, `bloomberg-photo-evidence-${stamp}.zip`);

  return { photos: added, schools: schoolsWithPhotos.size };
}
