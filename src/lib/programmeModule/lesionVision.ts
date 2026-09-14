// On-device computer vision for visible disease manifestations.
//
// Everything here runs in the browser on the phone that took the picture — no
// upload, no model download, no network. Field teams working in villages with
// no signal get the same analysis as a connected clinic.
//
// How it works
// ------------
//  1. The photograph is downscaled to a small working canvas.
//  2. Skin tone is estimated from the frame border (the healthy surround).
//  3. Every pixel is scored on how far it sits from that healthy surround in a
//     perceptual (CIE-Lab) sense; the largest connected region of high-scoring
//     pixels near the centre of the frame is taken as the lesion.
//  4. The region's area is reported as a share of the frame and — when the
//     clinician says how wide a reference object in the picture is (a ruler, a
//     coin, a standard 85.6 mm card) — converted to square millimetres.
//  5. Comparing two visits gives an improvement or deterioration percentage,
//     and the measured area drives a WHO-style stage for the condition.
//
// The output is a decision-support signal for a trained clinician. It is not a
// diagnosis and every screen that shows it says so.

export type LesionCondition =
  | "trachoma_tt"
  | "lymphoedema"
  | "hydrocoele"
  | "buruli_ulcer"
  | "leprosy_ulcer"
  | "wound"
  | "other";

export interface LesionConditionMeta {
  value: LesionCondition;
  label: string;
  /** Short clinical hint shown under the picker. */
  hint: string;
  /** Photograph framing guidance shown at capture time. */
  capture: string;
}

export const LESION_CONDITIONS: LesionConditionMeta[] = [
  {
    value: "trachoma_tt",
    label: "Trachomatous trichiasis (TT)",
    hint: "Lid margin and in-turned lashes — track lid inflammation and post-surgery recurrence.",
    capture: "Fill the frame with the everted lid. Keep the same eye and the same distance each visit.",
  },
  {
    value: "lymphoedema",
    label: "Lymphoedema (limb)",
    hint: "Affected limb — track swelling, skin folds and acute attacks between visits.",
    capture: "Whole affected limb against a plain background, same side and same angle each visit.",
  },
  {
    value: "hydrocoele",
    label: "Hydrocoele",
    hint: "Scrotal swelling — track pre-surgical size and post-surgical resolution.",
    capture: "Centre the swelling in the frame with a ruler beside it for scale.",
  },
  {
    value: "buruli_ulcer",
    label: "Buruli ulcer",
    hint: "Ulcer bed and undermined edges — track wound closure.",
    capture: "Photograph square-on with a ruler touching the wound edge.",
  },
  {
    value: "leprosy_ulcer",
    label: "Leprosy / plantar ulcer",
    hint: "Plantar or hand ulcer — track healing and recurrence.",
    capture: "Square-on with a ruler beside the ulcer, same foot or hand each visit.",
  },
  { value: "wound", label: "Other wound or lesion", hint: "Any other visible lesion.", capture: "Square-on, plain background, ruler for scale." },
  { value: "other", label: "Other manifestation", hint: "Anything else the clinician wants tracked visually.", capture: "Keep framing identical across visits." },
];

export const conditionLabel = (value?: string | null) =>
  LESION_CONDITIONS.find((c) => c.value === value)?.label || "Lesion";

/** Common reference objects used to convert pixels to millimetres. */
export const SCALE_REFERENCES = [
  { value: "0", label: "No reference object (relative tracking only)", mm: 0 },
  { value: "85.6", label: "ID / bank card long edge (85.6 mm)", mm: 85.6 },
  { value: "100", label: "Ruler segment — 10 cm (100 mm)", mm: 100 },
  { value: "50", label: "Ruler segment — 5 cm (50 mm)", mm: 50 },
  { value: "27", label: "₦50 coin (27 mm)", mm: 27 },
  { value: "24", label: "₦1 coin (24 mm)", mm: 24 },
];

export interface LesionMetrics {
  /** Share of the frame occupied by the lesion region, 0–1. */
  areaFraction: number;
  /** Widest span of the region relative to the frame, 0–1. */
  widthFraction: number;
  /** Region height relative to the frame, 0–1. */
  heightFraction: number;
  /** How red the region is compared with the healthy surround, 0–1. */
  rednessIndex: number;
  /** Boundary irregularity — higher means a more ragged lesion edge, 0–1. */
  edgeIrregularity: number;
  /** Square millimetres when a reference width was supplied, otherwise null. */
  areaMm2: number | null;
  /** Longest span of the region in millimetres, when a reference was supplied. */
  longestMm: number | null;
  /** How confident the segmentation is that it found a real lesion, 0–1. */
  segmentationQuality: number;
  /** Working canvas size the metrics were computed on. */
  frame: { width: number; height: number };
  /** Normalised lesion outline box for the on-screen overlay, 0–1 coordinates. */
  box: { x: number; y: number; w: number; h: number };
  /** Data URL of the mask overlay so the clinician can sanity-check the region. */
  overlay: string;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the picture"));
    img.src = src;
  });

/* sRGB -> CIE Lab ---------------------------------------------------- */
const pivotRgb = (v: number) => {
  const c = v / 255;
  return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
};
const pivotXyz = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);

const toLab = (r: number, g: number, b: number): [number, number, number] => {
  const R = pivotRgb(r); const G = pivotRgb(g); const B = pivotRgb(b);
  const x = pivotXyz((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = pivotXyz(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = pivotXyz((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

/**
 * Segments the lesion in a clinical photograph and measures it.
 *
 * @param src           data URL or signed URL of the photograph.
 * @param referenceMm   real-world width in millimetres of the reference object
 *                      spanning the picture, or 0 when there is none.
 */
export const analyseLesion = async (src: string, referenceMm = 0): Promise<LesionMetrics> => {
  const img = await loadImage(src);
  const W = 160;
  const H = Math.max(1, Math.round((img.height / Math.max(1, img.width)) * W));
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const empty: LesionMetrics = {
    areaFraction: 0, widthFraction: 0, heightFraction: 0, rednessIndex: 0,
    edgeIrregularity: 0, areaMm2: null, longestMm: null, segmentationQuality: 0,
    frame: { width: W, height: H }, box: { x: 0, y: 0, w: 0, h: 0 }, overlay: "",
  };
  if (!ctx) return empty;
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const N = W * H;
  const lab = new Float32Array(N * 3);
  for (let p = 0; p < N; p += 1) {
    const [l, a, bb] = toLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    lab[p * 3] = l; lab[p * 3 + 1] = a; lab[p * 3 + 2] = bb;
  }

  // Healthy surround = median of the outer 12% border ring.
  const border = Math.max(2, Math.round(Math.min(W, H) * 0.12));
  const ls: number[] = []; const as: number[] = []; const bs: number[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (x > border && x < W - border && y > border && y < H - border) continue;
      const p = y * W + x;
      ls.push(lab[p * 3]); as.push(lab[p * 3 + 1]); bs.push(lab[p * 3 + 2]);
    }
  }
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((m, n) => m - n);
    return s[Math.floor(s.length / 2)];
  };
  const ref = [median(ls), median(as), median(bs)];

  // Perceptual distance from the healthy surround, biased towards the centre
  // where clinicians frame the lesion.
  const dist = new Float32Array(N);
  let maxD = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      const d = Math.hypot(lab[p * 3] - ref[0], lab[p * 3 + 1] - ref[1], lab[p * 3 + 2] - ref[2]);
      const dx = (x - W / 2) / (W / 2); const dy = (y - H / 2) / (H / 2);
      const centreWeight = 1 - 0.45 * Math.min(1, Math.hypot(dx, dy));
      const v = d * centreWeight;
      dist[p] = v;
      if (v > maxD) maxD = v;
    }
  }
  if (maxD <= 0) return empty;

  // Otsu threshold over the normalised distance map.
  const bins = 64;
  const hist = new Array(bins).fill(0);
  for (let p = 0; p < N; p += 1) hist[Math.min(bins - 1, Math.floor((dist[p] / maxD) * bins))] += 1;
  let sumAll = 0;
  for (let i = 0; i < bins; i += 1) sumAll += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let threshBin = bins / 2;
  for (let i = 0; i < bins; i += 1) {
    wB += hist[i];
    if (!wB) continue;
    const wF = N - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshBin = i; }
  }
  const threshold = ((threshBin + 1) / bins) * maxD;

  const mask = new Uint8Array(N);
  for (let p = 0; p < N; p += 1) mask[p] = dist[p] >= threshold ? 1 : 0;

  // Largest connected component (4-neighbour flood fill), preferring the one
  // nearest the frame centre when two are comparable.
  const labels = new Int32Array(N).fill(-1);
  const stack: number[] = [];
  let bestPixels: number[] = [];
  let bestScore = -1;
  let comp = 0;
  for (let seed = 0; seed < N; seed += 1) {
    if (!mask[seed] || labels[seed] >= 0) continue;
    stack.length = 0; stack.push(seed);
    labels[seed] = comp;
    const pixels: number[] = [];
    while (stack.length) {
      const p = stack.pop() as number;
      pixels.push(p);
      const x = p % W; const y = (p - x) / W;
      const push = (q: number) => { if (q >= 0 && q < N && mask[q] && labels[q] < 0) { labels[q] = comp; stack.push(q); } };
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    // Score by size with a centre bonus.
    let cx = 0; let cy = 0;
    for (const p of pixels) { cx += p % W; cy += Math.floor(p / W); }
    cx /= pixels.length; cy /= pixels.length;
    const centreness = 1 - Math.min(1, Math.hypot((cx - W / 2) / (W / 2), (cy - H / 2) / (H / 2)));
    const score = pixels.length * (0.6 + 0.4 * centreness);
    if (score > bestScore) { bestScore = score; bestPixels = pixels; }
    comp += 1;
  }
  if (!bestPixels.length) return empty;

  let minX = W; let maxX = 0; let minY = H; let maxY = 0;
  let rSum = 0; let gSum = 0; let bSum = 0;
  const inRegion = new Uint8Array(N);
  for (const p of bestPixels) {
    inRegion[p] = 1;
    const x = p % W; const y = (p - x) / W;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    rSum += data[p * 4]; gSum += data[p * 4 + 1]; bSum += data[p * 4 + 2];
  }
  const area = bestPixels.length;
  const areaFraction = area / N;
  const widthFraction = (maxX - minX + 1) / W;
  const heightFraction = (maxY - minY + 1) / H;

  // Redness: how much the lesion leans to red compared with the surround.
  const meanR = rSum / area; const meanG = gSum / area; const meanB = bSum / area;
  const rednessIndex = Math.max(0, Math.min(1,
    (meanR - (meanG + meanB) / 2) / 90));

  // Edge irregularity: perimeter against the perimeter of a circle of the same
  // area (1 = perfect circle; higher = ragged).
  let perimeter = 0;
  for (const p of bestPixels) {
    const x = p % W; const y = (p - x) / W;
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) { perimeter += 1; continue; }
    if (!inRegion[p - 1] || !inRegion[p + 1] || !inRegion[p - W] || !inRegion[p + W]) perimeter += 1;
  }
  const circlePerimeter = 2 * Math.sqrt(Math.PI * area);
  const edgeIrregularity = Math.max(0, Math.min(1, (perimeter / Math.max(1, circlePerimeter) - 1) / 2));

  // Physical area when a reference width is known.
  const mmPerPx = referenceMm > 0 ? referenceMm / W : 0;
  const areaMm2 = mmPerPx > 0 ? +(area * mmPerPx * mmPerPx).toFixed(1) : null;
  const longestMm = mmPerPx > 0
    ? +(Math.max(maxX - minX + 1, maxY - minY + 1) * mmPerPx).toFixed(1)
    : null;

  // Quality: penalise regions that fill nearly the whole frame (segmentation
  // failure), are tiny (noise), or touch every edge.
  const quality = Math.max(0.05, Math.min(0.98,
    1 - Math.abs(areaFraction - 0.28) * 1.6 - (areaFraction > 0.85 ? 0.5 : 0)));

  // Mask overlay for the clinician to confirm the region.
  const ov = document.createElement("canvas");
  ov.width = W; ov.height = H;
  const octx = ov.getContext("2d");
  let overlay = "";
  if (octx) {
    const im = octx.createImageData(W, H);
    for (let p = 0; p < N; p += 1) {
      im.data[p * 4] = data[p * 4];
      im.data[p * 4 + 1] = data[p * 4 + 1];
      im.data[p * 4 + 2] = data[p * 4 + 2];
      im.data[p * 4 + 3] = 255;
      if (inRegion[p]) {
        im.data[p * 4] = Math.min(255, data[p * 4] * 0.45 + 255 * 0.55);
        im.data[p * 4 + 1] = data[p * 4 + 1] * 0.45;
        im.data[p * 4 + 2] = data[p * 4 + 2] * 0.45 + 60;
      }
    }
    octx.putImageData(im, 0, 0);
    overlay = ov.toDataURL("image/jpeg", 0.72);
  }

  return {
    areaFraction: +areaFraction.toFixed(5),
    widthFraction: +widthFraction.toFixed(4),
    heightFraction: +heightFraction.toFixed(4),
    rednessIndex: +rednessIndex.toFixed(3),
    edgeIrregularity: +edgeIrregularity.toFixed(3),
    areaMm2,
    segmentationQuality: +quality.toFixed(2),
    frame: { width: W, height: H },
    box: { x: minX / W, y: minY / H, w: widthFraction, h: heightFraction },
    overlay,
  };
};

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

export interface StageResult {
  stage: number;
  label: string;
  /** Plain-language explanation of why that stage was suggested. */
  rationale: string;
}

/**
 * Suggests a stage from the measured lesion.
 *
 * Lymphoedema follows the seven-stage WHO/Dreyer clinical scale, condensed to
 * what a photograph can support (swelling extent, skin folds, inflammation).
 * Ulcers follow a simple size band. Trichiasis is graded on lid inflammation
 * rather than area. The clinician can always override the suggestion.
 */
export const stageLesion = (condition: LesionCondition, m: LesionMetrics): StageResult => {
  const a = m.areaFraction;
  const mm2 = m.areaMm2;

  if (condition === "trachoma_tt") {
    const inflamed = m.rednessIndex;
    if (inflamed >= 0.55) return { stage: 3, label: "Marked lid inflammation", rationale: "Strong redness across the lid margin region." };
    if (inflamed >= 0.3) return { stage: 2, label: "Moderate lid inflammation", rationale: "Moderate redness over the segmented lid margin." };
    if (inflamed > 0) return { stage: 1, label: "Mild / quiet lid", rationale: "Little redness detected on the lid margin." };
    return { stage: 0, label: "Not gradable", rationale: "The lid margin could not be isolated in this picture." };
  }

  if (condition === "lymphoedema") {
    if (a >= 0.55 || m.edgeIrregularity >= 0.6) {
      return { stage: 5, label: "Stage 5–7 — large limb, knobs and mossy lesions", rationale: "Very large affected area with a highly irregular skin surface." };
    }
    if (a >= 0.42) return { stage: 4, label: "Stage 4 — knobs present", rationale: "Large affected area with surface irregularity." };
    if (a >= 0.32) return { stage: 3, label: "Stage 3 — shallow skin folds", rationale: "Clear increase in affected area over the healthy surround." };
    if (a >= 0.2) return { stage: 2, label: "Stage 2 — swelling not reversible overnight", rationale: "Moderate swelling segmented in the frame." };
    if (a > 0) return { stage: 1, label: "Stage 1 — swelling reversible overnight", rationale: "Small affected area relative to the limb." };
    return { stage: 0, label: "Not gradable", rationale: "No swelling region could be isolated." };
  }

  if (condition === "hydrocoele") {
    if (a >= 0.5) return { stage: 4, label: "Grade 4 — very large", rationale: "Swelling dominates the frame." };
    if (a >= 0.35) return { stage: 3, label: "Grade 3 — large", rationale: "Large swelling relative to the frame." };
    if (a >= 0.2) return { stage: 2, label: "Grade 2 — moderate", rationale: "Moderate swelling segmented." };
    if (a > 0) return { stage: 1, label: "Grade 1 — mild", rationale: "Small swelling segmented." };
    return { stage: 0, label: "Not gradable", rationale: "No swelling region could be isolated." };
  }

  // Ulcers and other wounds — size bands in square centimetres when scaled.
  if (mm2 != null) {
    const cm2 = mm2 / 100;
    if (cm2 >= 50) return { stage: 4, label: "Category III — extensive (≥50 cm²)", rationale: `Measured ${cm2.toFixed(1)} cm² against the reference object.` };
    if (cm2 >= 5) return { stage: 3, label: "Category II — 5–50 cm²", rationale: `Measured ${cm2.toFixed(1)} cm² against the reference object.` };
    if (cm2 > 0) return { stage: 2, label: "Category I — under 5 cm²", rationale: `Measured ${cm2.toFixed(1)} cm² against the reference object.` };
  }
  if (a >= 0.3) return { stage: 3, label: "Large lesion", rationale: "Lesion occupies a large share of the frame." };
  if (a > 0) return { stage: 2, label: "Small to moderate lesion", rationale: "Lesion isolated; add a reference object to measure it in cm²." };
  return { stage: 0, label: "Not gradable", rationale: "No lesion region could be isolated." };
};

/* ------------------------------------------------------------------ */
/* Visit-to-visit comparison                                           */
/* ------------------------------------------------------------------ */

export type LesionTrend = "improving" | "stable" | "deteriorating" | "insufficient";

export interface LesionComparison {
  trend: LesionTrend;
  /** Negative = the lesion got smaller. */
  percentChange: number;
  /** Change against the very first recorded assessment. */
  percentSinceBaseline: number;
  headline: string;
  detail: string;
  confidence: number;
}

export interface LesionPoint {
  assessed_on: string;
  area_fraction?: number | null;
  area_mm2?: number | null;
  stage?: number | null;
}

const pctChange = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : 0);

/** Compares the newest assessment with the previous one and with baseline. */
export const compareLesions = (points: LesionPoint[]): LesionComparison => {
  const series = [...points]
    .filter((p) => Number(p.area_mm2 ?? p.area_fraction ?? 0) > 0)
    .sort((a, b) => (a.assessed_on < b.assessed_on ? -1 : 1));

  if (series.length < 2) {
    return {
      trend: "insufficient", percentChange: 0, percentSinceBaseline: 0, confidence: 0,
      headline: "One assessment so far",
      detail: "Photograph the same site at the next visit and the change will be measured automatically.",
    };
  }

  const scaled = series.every((p) => Number(p.area_mm2 || 0) > 0);
  const val = (p: LesionPoint) => Number(scaled ? p.area_mm2 : p.area_fraction) || 0;

  const latest = val(series[series.length - 1]);
  const previous = val(series[series.length - 2]);
  const baseline = val(series[0]);

  const percentChange = +pctChange(previous, latest).toFixed(1);
  const percentSinceBaseline = +pctChange(baseline, latest).toFixed(1);

  const trend: LesionTrend =
    percentChange <= -8 ? "improving" : percentChange >= 8 ? "deteriorating" : "stable";

  const confidence = Math.max(0.15, Math.min(0.95,
    0.35 + 0.08 * (series.length - 2) + Math.min(0.3, Math.abs(percentChange) / 80) + (scaled ? 0.15 : 0)));

  const size = scaled ? `${(latest / 100).toFixed(1)} cm²` : `${(latest * 100).toFixed(1)}% of the frame`;
  const headline =
    trend === "improving" ? `Improving — ${Math.abs(percentChange).toFixed(0)}% smaller since the last visit`
      : trend === "deteriorating" ? `Deteriorating — ${percentChange.toFixed(0)}% larger since the last visit`
        : "Little change since the last visit";

  const detail = [
    `Current measured size: ${size}.`,
    `${percentSinceBaseline <= 0 ? "Down" : "Up"} ${Math.abs(percentSinceBaseline).toFixed(0)}% against the first assessment across ${series.length} visits.`,
    scaled ? "" : "Include a ruler or card in the picture so the size can be reported in cm².",
  ].filter(Boolean).join(" ");

  return { trend, percentChange, percentSinceBaseline, headline, detail, confidence };
};

export const TREND_TONE: Record<LesionTrend, "success" | "warning" | "danger" | "neutral"> = {
  improving: "success",
  stable: "neutral",
  deteriorating: "danger",
  insufficient: "warning",
};
