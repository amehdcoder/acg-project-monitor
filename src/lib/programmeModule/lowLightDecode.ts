import jsQR from "jsqr";

/** Stretches the darkest 2% to black and brightest 2% to white, in place (RGBA). */
export function stretchContrast(px: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    px[i] = g; hist[g]++;
  }
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * 0.02; hi--);
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
}

let canvas: HTMLCanvasElement | null = null;
/** Backup reader for dark, dull or blurry camera pictures that the main scanner misses. */
export function decodeLowLight(video: HTMLVideoElement): string | null {
  const w0 = video.videoWidth, h0 = video.videoHeight;
  if (!w0 || !h0) return null;
  const scale = Math.min(1, 720 / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  canvas ??= document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  stretchContrast(img.data);
  return jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" })?.data || null;
}
