// In-app image preprocessing for OCR — no external services.
// Pipeline: orient/downscale → grayscale → contrast stretch → light denoise →
// deskew estimation → adaptive binarization. Returns a high-contrast PNG that
// dramatically improves Tesseract accuracy on phone photos of paper forms.

const MAX_DIMENSION = 2400;

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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Build grayscale + min/max for histogram stretch. */
function toGrayscale(px: Uint8ClampedArray, w: number, h: number) {
  const gray = new Uint8ClampedArray(w * h);
  let min = 255;
  let max = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  return { gray, min, max };
}

/** 3x3 median filter — fast salt-and-pepper noise removal without blur. */
function medianFilter(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const window = new Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Edges: copy through
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[y * w + x] = src[y * w + x];
        continue;
      }
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          window[k++] = src[(y + dy) * w + (x + dx)];
        }
      }
      window.sort((a, b) => a - b);
      out[y * w + x] = window[4];
    }
  }
  return out;
}

/**
 * Estimate skew angle by sweeping ±5° in 0.5° steps and choosing the angle
 * whose horizontal projection profile has the highest variance (sharpest
 * dark-line peaks correspond to upright text rows).
 */
function estimateSkewAngle(gray: Uint8ClampedArray, w: number, h: number): number {
  const angles: number[] = [];
  for (let a = -5; a <= 5; a += 0.5) angles.push(a);

  // Downsample for speed
  const sw = Math.min(w, 600);
  const sh = Math.round((h * sw) / w);
  const stepX = w / sw;
  const stepY = h / sh;
  const small = new Uint8ClampedArray(sw * sh);
  for (let y = 0; y < sh; y++) {
    const sy = (y * stepY) | 0;
    for (let x = 0; x < sw; x++) {
      small[y * sw + x] = gray[sy * w + ((x * stepX) | 0)];
    }
  }

  const cx = sw / 2;
  const cy = sh / 2;
  let bestAngle = 0;
  let bestScore = -Infinity;

  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const proj = new Float32Array(sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const xr = (x - cx) * cos - (y - cy) * sin + cx;
        const yr = (x - cx) * sin + (y - cy) * cos + cy;
        if (xr < 0 || xr >= sw || yr < 0 || yr >= sh) continue;
        // Dark pixel = text. Use 255 - gray so peaks correspond to text rows.
        proj[(yr | 0)] += 255 - small[(yr | 0) * sw + (xr | 0)];
      }
    }
    let mean = 0;
    for (let i = 0; i < sh; i++) mean += proj[i];
    mean /= sh;
    let variance = 0;
    for (let i = 0; i < sh; i++) {
      const d = proj[i] - mean;
      variance += d * d;
    }
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

/** Rotate a dataURL by `deg` (radians applied internally). */
async function rotate(dataUrl: string, deg: number): Promise<string> {
  if (Math.abs(deg) < 0.25) return dataUrl;
  const img = await loadImage(dataUrl);
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const newW = Math.ceil(w * cos + h * sin);
  const newH = Math.ceil(w * sin + h * cos);
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, newW, newH);
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL("image/jpeg", 0.95);
}

/**
 * Apply OCR-friendly preprocessing:
 *  - grayscale + contrast stretch
 *  - 3x3 median denoise
 *  - adaptive thresholding (sliding-window mean) for text vs paper
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

  // 1) Grayscale + histogram stretch
  const { gray, min, max } = toGrayscale(px, w, h);
  const range = Math.max(1, max - min);
  for (let j = 0; j < gray.length; j++) {
    gray[j] = ((gray[j] - min) * 255) / range;
  }

  // 2) Light denoise (median filter) before thresholding
  const denoised = medianFilter(gray, w, h);

  // 3) Adaptive threshold via integral image (mean of NxN window).
  const N = Math.max(15, Math.round(Math.min(w, h) / 35)) | 1; // odd window
  const half = N >> 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += denoised[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] =
        integral[y * (w + 1) + (x + 1)] + row;
    }
  }

  const C = 10; // bias toward white background
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
      const v = denoised[y * w + x] < mean - C ? 0 : 255;
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

/**
 * Estimate skew angle from the source grayscale (cheap) and rotate the
 * downscaled image to upright before binarization.
 */
async function deskew(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const { gray } = toGrayscale(data, canvas.width, canvas.height);
    const angle = estimateSkewAngle(gray, canvas.width, canvas.height);
    if (Math.abs(angle) < 0.5) return dataUrl;
    return await rotate(dataUrl, -angle);
  } catch {
    return dataUrl;
  }
}

export async function preprocess(dataUrl: string): Promise<string> {
  const small = await downscale(dataUrl);
  const upright = await deskew(small);
  try {
    return await enhanceForOcr(upright);
  } catch {
    return upright;
  }
}
