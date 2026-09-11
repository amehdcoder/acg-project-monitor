// Avatars live in a private storage bucket. Stored profile URLs are the legacy
// "public object" form, so they are rewritten to short-lived signed URLs before
// being rendered. Results are cached in memory to avoid repeated round-trips.

import { supabase } from "@/integrations/supabase/client";

const PUBLIC_MARKER = "/storage/v1/object/public/avatars/";
const SIGN_TTL_SECONDS = 60 * 60;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

/** Extracts the object path inside the avatars bucket, if this is one of ours. */
export const avatarObjectPath = (src?: string | null): string | null => {
  if (!src) return null;
  const idx = src.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  const path = src.slice(idx + PUBLIC_MARKER.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
};

/**
 * Returns a displayable URL for an avatar. External URLs (Google photos, etc.)
 * are returned untouched; bucket objects are signed on demand.
 */
export const resolveAvatarUrl = async (src?: string | null): Promise<string | null> => {
  if (!src) return null;
  const path = avatarObjectPath(src);
  if (!path) return src;

  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const pending = inflight.get(path);
  if (pending) return pending;

  const task = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, SIGN_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      cache.set(path, {
        url: data.signedUrl,
        // Refresh a little before the signature actually expires.
        expiresAt: Date.now() + (SIGN_TTL_SECONDS - 120) * 1000,
      });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();

  inflight.set(path, task);
  return task;
};
