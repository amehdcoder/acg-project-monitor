/**
 * KoboToolbox attachment helpers.
 *
 * Kobo media (photos, signatures, barcode captures) sits behind token auth, so
 * the browser cannot load `download_url` directly. These helpers resolve a cell
 * value to its attachment record and stream the bytes through the
 * `kobo-form-manager` edge function, which returns a base64 data URL.
 * Results are memoised per session so a gallery never re-downloads an image.
 */
import { supabase } from "@/integrations/supabase/client";
import type { KoboConfig } from "./koboClient";

export interface KoboAttachment {
  id?: number | string;
  filename: string;          // full stored path
  basename: string;          // file name only
  mimetype: string;
  downloadUrl: string;
  smallUrl?: string;
  questionXpath?: string;
  isImage: boolean;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|svg)$/i;

const base = (p: string) => String(p ?? "").split("/").pop() ?? "";

export function listAttachments(record: any): KoboAttachment[] {
  const raw = Array.isArray(record?._attachments) ? record._attachments : [];
  return raw.map((a: any) => {
    const filename = String(a?.filename ?? a?.media_file ?? "");
    const mimetype = String(a?.mimetype ?? "");
    const basename = base(filename) || base(String(a?.download_url ?? ""));
    return {
      id: a?.id,
      filename,
      basename,
      mimetype,
      downloadUrl: String(a?.download_url ?? a?.download_medium_url ?? ""),
      smallUrl: a?.download_small_url ? String(a.download_small_url) : undefined,
      questionXpath: a?.question_xpath ? String(a.question_xpath) : undefined,
      isImage: mimetype.startsWith("image/") || IMAGE_EXT.test(basename),
    } as KoboAttachment;
  }).filter((a: KoboAttachment) => !!a.downloadUrl);
}

/** Does this raw cell value look like a media file reference? */
export function looksLikeMedia(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return !!s && !s.includes(" ") && /\.(jpe?g|png|gif|webp|bmp|heic|svg|mp3|mp4|m4a|3gp|amr|wav|pdf)$/i.test(s);
}

/** Find the attachment matching a submission cell value (Kobo stores the file name). */
export function matchAttachment(record: any, value: unknown): KoboAttachment | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const wanted = base(s).toLowerCase();
  const normalised = wanted.replace(/[^a-z0-9.]+/gi, "_");
  const all = listAttachments(record);
  return (
    all.find((a) => a.basename.toLowerCase() === wanted) ??
    all.find((a) => a.basename.toLowerCase() === normalised) ??
    all.find((a) => a.filename.toLowerCase().endsWith(wanted)) ??
    null
  );
}

/* ── authenticated media loading ─────────────────────────────────────────── */

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export async function loadAttachment(cfg: KoboConfig | null, url: string): Promise<string | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  if (inflight.has(url)) return inflight.get(url)!;
  if (!cfg?.serverUrl || !cfg?.apiToken) return null;

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: {
          action: "fetch_attachment",
          server_url: cfg.serverUrl,
          api_token: cfg.apiToken,
          attachment_url: url,
        },
      });
      if (error) throw error;
      const dataUrl = (data as any)?.data_url as string | undefined;
      if (!dataUrl) return null;
      if (cache.size > 400) cache.clear();
      cache.set(url, dataUrl);
      return dataUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/** Every image attachment across a set of submissions, newest first. */
export interface GalleryItem extends KoboAttachment {
  submissionId: string;
  submittedAt: string;
  record: any;
}

export function buildGallery(records: any[]): GalleryItem[] {
  const out: GalleryItem[] = [];
  for (const r of records ?? []) {
    for (const a of listAttachments(r)) {
      if (!a.isImage) continue;
      out.push({
        ...a,
        submissionId: String(r?._id ?? r?._uuid ?? ""),
        submittedAt: String(r?._submission_time ?? ""),
        record: r,
      });
    }
  }
  return out.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}
