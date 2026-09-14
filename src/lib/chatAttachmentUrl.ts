import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedUrl {
  signedUrl: string;
  expiresAt: number;
}

const cache = new Map<string, CachedUrl>();

/**
 * Extract the canonical relative object path from a stored attachment_url.
 * New rows store the relative path directly (e.g. "<uid>/1712345678.png").
 * Legacy rows may hold a full public URL; normalise those too.
 */
export function canonicalAttachmentPath(stored: string): string | null {
  if (!stored) return null;
  const marker = `/${BUCKET}/`;
  if (stored.includes("://")) {
    const idx = stored.indexOf(marker);
    if (idx === -1) return null;
    const path = stored.slice(idx + marker.length).split("?")[0];
    return path || null;
  }
  return stored.replace(/^\/+/, "") || null;
}

/**
 * Resolve a stored chat attachment reference to a short-lived signed URL.
 * Results are cached per object path until shortly before expiry.
 */
export async function getChatAttachmentSignedUrl(stored: string): Promise<string | null> {
  const path = canonicalAttachmentPath(stored);
  if (!path) return null;

  const cached = cache.get(path);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.signedUrl;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  cache.set(path, {
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}
