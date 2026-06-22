// Device-side snapshot capture for the Bloomberg School Enrolment Validation
// form. On sync, each user's device renders a compact "screenshot" of its own
// local Drafts and Ready-to-Send lists and uploads them to a private storage
// bucket (bloomberg-device-audit). The validation dashboard then shows these
// images next to every user in the Device Form Audit table, so supervisors can
// visually verify the on-device form state of all users.
//
// The snapshot is rendered deterministically from the device's saved entries
// (school name + answered fields + last-touched time), so it does not depend on
// the user navigating to a particular screen and is reliable on every sync.

import { supabase } from "@/integrations/supabase/client";
import { listSavedEntries, type SavedFormEntry } from "@/lib/savedForms";
import { BLOOMBERG_FORM_ID } from "@/lib/specialFormBridge";
import { getAuditDeviceId } from "@/lib/offlineAuditLog";

const BUCKET = "bloomberg-device-audit";

const isBloomberg = (e: SavedFormEntry) =>
  e.formId === BLOOMBERG_FORM_ID ||
  e.submissionType === BLOOMBERG_FORM_ID ||
  (e.settings as any)?.specialForm === "bloomberg-school-enrolment-validation";

const answeredCount = (e: SavedFormEntry) =>
  Object.entries(e.responses || {}).filter(
    ([k, v]) =>
      !k.startsWith("_") &&
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0),
  ).length;

const schoolLabel = (e: SavedFormEntry): string => {
  const r = (e.responses || {}) as Record<string, any>;
  return (
    r.school_name ||
    r.schoolName ||
    r.name_of_school ||
    e.formName ||
    "Unnamed school"
  )
    .toString()
    .slice(0, 48);
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

/**
 * Render a list of saved entries to a PNG data URL that visually resembles the
 * in-app saved-forms screen, then return it. Never throws.
 */
const renderListSnapshot = (
  title: string,
  accent: string,
  entries: SavedFormEntry[],
): string | null => {
  try {
    const dpr = 2;
    const width = 720;
    const rowH = 64;
    const headerH = 96;
    const footH = 40;
    const maxRows = 40;
    const rows = entries.slice(0, maxRows);
    const height = headerH + Math.max(rows.length, 1) * rowH + footH;

    const canvas = document.createElement("canvas");
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#f4f6fb";
    ctx.fillRect(0, 0, width, height);

    // Header band
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, width, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, 24, 42);
    ctx.font = "14px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      `${entries.length} form${entries.length === 1 ? "" : "s"} · captured ${new Date().toLocaleString()}`,
      24,
      70,
    );

    // Rows
    rows.forEach((e, i) => {
      const y = headerH + i * rowH;
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#eef2f9";
      ctx.fillRect(12, y + 6, width - 24, rowH - 10);
      // accent chip
      ctx.fillStyle = accent;
      ctx.fillRect(12, y + 6, 5, rowH - 10);
      ctx.fillStyle = "#0c2340";
      ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${i + 1}. ${schoolLabel(e)}`, 30, y + 28);
      ctx.fillStyle = "#64748b";
      ctx.font = "13px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        `${answeredCount(e)} answered · updated ${fmtTime(e.updatedAt || e.finalizedAt || e.createdAt)}`,
        30,
        y + 48,
      );
    });

    if (rows.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "15px system-ui, -apple-system, sans-serif";
      ctx.fillText("No forms in this list.", 30, headerH + 36);
    }

    // Footer
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      entries.length > maxRows ? `+ ${entries.length - maxRows} more not shown` : "Amehnities · Bloomberg device audit",
      24,
      height - 16,
    );

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const uploadSnapshot = async (
  userId: string,
  key: string,
  dataUrl: string | null,
): Promise<string | null> => {
  if (!dataUrl) return null;
  try {
    const path = `${userId}/${key}-${getAuditDeviceId()}.png`;
    const blob = dataUrlToBlob(dataUrl);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: "image/png" });
    if (error) {
      console.warn("Device audit snapshot upload failed:", error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.warn("Device audit snapshot upload error:", e);
    return null;
  }
};

/**
 * Capture and upload snapshots of this device's Bloomberg Drafts and
 * Ready-to-Send lists, and record the storage paths + a device-derived
 * days-worked figure on the audit row. Safe to call on every sync; never throws.
 */
export const captureAndUploadDeviceAuditSnapshots = async (): Promise<void> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const all = (await listSavedEntries(user.id)).filter(isBloomberg);
    const drafts = all.filter((e) => e.status === "draft");
    const ready = all.filter((e) => e.status === "finalized");
    const sent = all.filter((e) => e.status === "sent");

    // Days worked, derived on the device from submission metadata: the number of
    // distinct calendar days on which this device finalized or sent a form. This
    // is robust even when server timestamps are unusual for some users.
    const dayKeys = new Set<string>();
    [...sent, ...ready].forEach((e) => {
      const t = e.sentAt || e.finalizedAt || e.updatedAt || e.createdAt;
      if (!t) return;
      const d = new Date(t);
      if (!isNaN(d.getTime())) dayKeys.add(d.toISOString().slice(0, 10));
    });

    const draftsImg = renderListSnapshot("Drafts", "#b45309", drafts);
    const readyImg = renderListSnapshot("Ready to Send", "#2563eb", ready);

    const [draftsPath, readyPath] = await Promise.all([
      uploadSnapshot(user.id, "drafts", draftsImg),
      uploadSnapshot(user.id, "ready", readyImg),
    ]);

    await supabase
      .from("bloomberg_local_form_audit" as any)
      .upsert(
        {
          user_id: user.id,
          device_id: getAuditDeviceId(),
          drafts_screenshot_path: draftsPath,
          ready_screenshot_path: readyPath,
          days_worked: dayKeys.size,
          snapshot_captured_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" },
      );
  } catch (e) {
    console.warn("captureAndUploadDeviceAuditSnapshots failed:", e);
  }
};

/** Resolve a stored snapshot path to a temporary signed URL (admin/dashboard use). */
export const getDeviceAuditSnapshotUrl = async (
  path: string | null | undefined,
): Promise<string | null> => {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
};
