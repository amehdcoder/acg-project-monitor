// In-app image preprocessing for OCR — no external services.
// Handles: downscaling, grayscale, contrast boost, adaptive binarization, deskew.

const MAX_DIMENSION = 2200;

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export async function downscale(dataUrl: string, max = MAX_DIMENSION): Promise<string> {
  const img = await loadImage(dataUrl);
  let { width, height } = img;
  if (width <= max && height <= max) return dataUrl;
  const scale = max / Math.max(width, height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Apply OCR-friendly preprocessing:
 *  - grayscale
 *  - contrast normalization (stretch histogram)
 *  - adaptive thresholding (sliding-window mean) for text vs paper
 * Returns a high-contrast dataURL optimized for Tesseract.
 */
export async function enhanceForOcr(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;

  // 1) Grayscale + collect histogram
  const gray = new Uint8ClampedArray(w * h);
  let min = 255;
  let max = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  // 2) Contrast stretch
  const range = Math.max(1, max - min);
  for (let j = 0; j < gray.length; j++) {
    gray[j] = ((gray[j] - min) * 255) / range;
  }

  // 3) Adaptive threshold via integral image (mean of NxN window).
  const N = Math.max(15, Math.round(Math.min(w, h) / 40)) | 1; // odd window
  const half = N >> 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] =
        integral[y * (w + 1) + (x + 1)] + row;
    }
  }

  const C = 8; // bias toward white background
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      const v = gray[y * w + x] < mean - C ? 0 : 255;
      const di = (y * w + x) * 4;
      px[di] = v;
      px[di + 1] = v;
      px[di + 2] = v;
      px[di + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function preprocess(dataUrl: string): Promise<string> {
  const small = await downscale(dataUrl);
  try {
    return await enhanceForOcr(small);
  } catch {
    return small;
  }
}
