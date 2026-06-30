// Resilient network helpers for field data collection on flaky mobile links.
//
// "Failed to fetch" is a low-level TypeError the browser throws when a request
// never reaches the server — dropped connection, radio handoff, captive portal,
// or a payload too large to complete before the socket dies. These helpers make
// submissions survive those conditions by (a) shrinking oversized phone photos
// before upload and (b) retrying transient failures with backoff.

export function isTransientNetworkError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connection") ||
    msg.includes("fetch event") ||
    err?.name === "TypeError"
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an async task, retrying transient network failures with exponential
 * backoff. Non-network errors (validation, RLS, etc.) are thrown immediately.
 */
export async function withNetworkRetry<T>(
  task: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 800;
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) throw err;
      await sleep(base * Math.pow(2, i) + Math.random() * 250);
    }
  }
  throw lastErr;
}

/**
 * Downscale + re-encode large images so uploads complete reliably on slow
 * mobile connections. Non-image files (e.g. PDF consent forms) are returned
 * unchanged. Falls back to the original file if anything goes wrong.
 */
export async function compressImageFile(
  file: File,
  opts: { maxDimension?: number; quality?: number; maxBytes?: number } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.72;
  const maxBytes = opts.maxBytes ?? 600 * 1024;

  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  // Small images don't need processing.
  if (file.size <= maxBytes) return file;

  try {
    const bitmap = await createImageBitmapSafe(file);
    if (!bitmap) return file;

    let { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    if ("close" in bitmap) (bitmap as ImageBitmap).close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function createImageBitmapSafe(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(file);
    }
  } catch {
    /* fall through to <img> decode */
  }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
