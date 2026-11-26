import jsQR from "jsqr";

/** 3×3 average of the grey channel, in place (RGBA): removes the grain of dark camera pictures. */
export function smoothGrain(px: Uint8ClampedArray, w: number, h: number): void {
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) / 256;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * w + x + dx];
    const i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = s / 9;
  }
}

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
  smoothGrain(img.data, w, h);
  stretchContrast(img.data);
  return jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" })?.data || null;
}

/** Scan area covering almost the whole camera picture, so codes held close to the lens still read. */
export const wideQrBox = (w: number, h: number) => ({ width: Math.max(50, Math.round(w * 0.96)), height: Math.max(50, Math.round(h * 0.96)) });

/**
 * Runs the poor-light reader beside an html5-qrcode scanner in `containerId`.
 * Fires `onText` once, and stops by itself once the camera picture is removed.
 */
export function startLowLightBackup(containerId: string, onText: (text: string) => void): () => void {
  let seen = false;
  const timer = window.setInterval(() => {
    const video = document.querySelector<HTMLVideoElement>(`#${CSS.escape(containerId)} video`);
    if (!video) { if (seen) stop(); return; }
    seen = true;
    try { const text = decodeLowLight(video); if (text) { stop(); onText(text); } } catch { /* next frame */ }
  }, 500);
  function stop() { window.clearInterval(timer); }
  return stop;
}
