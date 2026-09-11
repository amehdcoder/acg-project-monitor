// Private media storage for beneficiary photographs (patient portraits, limb
// and hydrocoele clinical images).
//
// Files live in the private `beneficiary-media` bucket under
// `<project_id>/<beneficiary_id>/<uuid>.<ext>`, so storage access follows the
// same project membership rules as the record itself. Nothing is ever public;
// the UI resolves short-lived signed URLs on demand.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const MEDIA_BUCKET = "beneficiary-media";

const ext = (file: File) => {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (fromName || file.type.split("/")[1] || "jpg").toLowerCase();
};

/** Reads a file as a data URL — used offline and for on-device image analysis. */
export const fileToDataUrl = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the picture"));
    reader.readAsDataURL(file);
  });

/**
 * Uploads a picture and returns its storage path. When the device is offline
 * (or the upload fails) the caller keeps the data URL instead, so field teams
 * never lose an image.
 */
export const uploadBeneficiaryMedia = async (
  file: File,
  projectId: string,
  beneficiaryId: string,
): Promise<string> => {
  const uuid =
    (crypto as unknown as { randomUUID?: () => string })?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${projectId}/${beneficiaryId}/${uuid}.${ext(file)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  return path;
};

const cache = new Map<string, { url: string; expires: number }>();

/** Resolves a viewable URL for a stored path, a data URL or an external link. */
export const resolveMediaUrl = async (value?: string | null): Promise<string> => {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  const hit = cache.get(value);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(value, 3600);
  const url = data?.signedUrl || "";
  if (url) cache.set(value, { url, expires: Date.now() + 50 * 60 * 1000 });
  return url;
};

/** React helper: viewable URL for a stored picture reference. */
export const useMediaUrl = (value?: string | null) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveMediaUrl(value);
      if (!cancelled) setUrl(resolved);
    })();
    return () => { cancelled = true; };
  }, [value]);
  return url;
};
