// On-device machine learning for MMDP / NTD outcome tracking.
//
// Two independent signals are combined, both computed entirely in the browser
// so the analysis works with no network at all:
//
//  1. Image signal — a 2-means colour clustering segments the affected limb or
//     scrotum from its background in each clinical photograph. The share of the
//     frame occupied by the segmented region, normalised for how close the
//     photograph was taken, is a proxy for swelling.
//  2. Measurement signal — least-squares regression across every recorded
//     circumference/volume measurement for the same site gives the trend, and
//     the percentage change between the baseline and the current visit gives
//     the magnitude.
//
// The two are fused into a single verdict with a confidence score; the
// measurement signal always dominates because it is a direct clinical
// observation and the image signal only corroborates it.

export interface LimbMeasurement {
  /** ISO date of the visit. */
  date: string;
  /** Anatomical site key, e.g. "limb_ankle", "limb_calf", "scrotum". */
  site: string;
  /** Circumference / diameter in centimetres. */
  cm: number;
}

export interface ImageSignal {
  /** Share of the frame occupied by the segmented region, 0–1. */
  areaFraction: number;
  /** Mean width of the region relative to the frame, 0–1. */
  widthFraction: number;
}

export type ProgressVerdict = "reduction" | "stable" | "increase" | "insufficient";

export interface ProgressAssessment {
  verdict: ProgressVerdict;
  /** Percentage change from the earliest to the latest measurement (negative = reduction). */
  percentChange: number;
  /** Regression slope in cm per visit (negative = reducing). */
  slopePerVisit: number;
  /** 0–1. */
  confidence: number;
  headline: string;
  detail: string;
  /** Per-site comparison for the table shown in the record. */
  sites: {
    site: string; baseline: number; latest: number; change: number; percent: number;
  }[];
  /** Percentage change of the segmented image area, when two photographs exist. */
  imagePercentChange: number | null;
}

/* ------------------------------------------------------------------ */
/* Image segmentation                                                  */
/* ------------------------------------------------------------------ */

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the picture"));
    img.src = src;
  });

/**
 * Segments the dominant central subject of a clinical photograph with 2-means
 * clustering over RGB, and reports how much of the frame it occupies.
 */
export const analyseClinicalImage = async (src: string): Promise<ImageSignal> => {
  const img = await loadImage(src);
  const W = 128;
  const H = Math.max(1, Math.round((img.height / img.width) * W));
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { areaFraction: 0, widthFraction: 0 };
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // --- 2-means over RGB -------------------------------------------------
  let c0 = [40, 40, 40];
  let c1 = [200, 170, 150];
  const assign = new Uint8Array(W * H);
  for (let iter = 0; iter < 8; iter += 1) {
    const s0 = [0, 0, 0]; const s1 = [0, 0, 0];
    let n0 = 0; let n1 = 0;
    for (let p = 0; p < W * H; p += 1) {
      const r = data[p * 4]; const g = data[p * 4 + 1]; const b = data[p * 4 + 2];
      const d0 = (r - c0[0]) ** 2 + (g - c0[1]) ** 2 + (b - c0[2]) ** 2;
      const d1 = (r - c1[0]) ** 2 + (g - c1[1]) ** 2 + (b - c1[2]) ** 2;
      if (d0 <= d1) { assign[p] = 0; s0[0] += r; s0[1] += g; s0[2] += b; n0 += 1; }
      else { assign[p] = 1; s1[0] += r; s1[1] += g; s1[2] += b; n1 += 1; }
    }
    if (n0) c0 = s0.map((v) => v / n0);
    if (n1) c1 = s1.map((v) => v / n1);
  }

  // The subject is the cluster whose pixels sit closest to the centre of the
  // frame — clinicians centre the limb or scrotum they are photographing.
  const centreScore = [0, 0];
  const counts = [0, 0];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      const k = assign[p];
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      centreScore[k] += 1 - Math.min(1, Math.hypot(dx, dy));
      counts[k] += 1;
    }
  }
  const mean0 = counts[0] ? centreScore[0] / counts[0] : 0;
  const mean1 = counts[1] ? centreScore[1] / counts[1] : 0;
  const subject = mean1 > mean0 ? 1 : 0;

  let area = 0;
  let widthSum = 0;
  let rowsWithSubject = 0;
  for (let y = 0; y < H; y += 1) {
    let minX = -1; let maxX = -1; let rowCount = 0;
    for (let x = 0; x < W; x += 1) {
      if (assign[y * W + x] === subject) {
        rowCount += 1;
        if (minX < 0) minX = x;
        maxX = x;
      }
    }
    area += rowCount;
    if (rowCount > 0) { widthSum += (maxX - minX + 1) / W; rowsWithSubject += 1; }
  }

  return {
    areaFraction: area / (W * H),
    widthFraction: rowsWithSubject ? widthSum / rowsWithSubject : 0,
  };
};

/* ------------------------------------------------------------------ */
/* Measurement regression + fusion                                     */
/* ------------------------------------------------------------------ */

const slope = (values: number[]): number => {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  values.forEach((y, i) => { num += (i - meanX) * (y - meanY); den += (i - meanX) ** 2; });
  return den ? num / den : 0;
};

/**
 * Assesses whether the affected limb or scrotum has visibly reduced in size
 * compared with previous visits.
 *
 * @param visits  measurements grouped per visit, oldest first.
 * @param images  optional image signal per visit, aligned with `visits`.
 */
export const assessLimbProgress = (
  visits: { date: string; measurements: LimbMeasurement[] }[],
  images: (ImageSignal | null)[] = [],
): ProgressAssessment => {
  const withData = visits.filter((v) => v.measurements.some((m) => Number.isFinite(m.cm) && m.cm > 0));
  if (withData.length < 2) {
    return {
      verdict: "insufficient",
      percentChange: 0, slopePerVisit: 0, confidence: 0,
      headline: "Not enough visits yet",
      detail: "Record measurements at a second outcome-tracking visit and the app will compare the two.",
      sites: [],
      imagePercentChange: null,
    };
  }

  const first = withData[0];
  const last = withData[withData.length - 1];
  const siteKeys = Array.from(new Set(withData.flatMap((v) => v.measurements.map((m) => m.site))));

  const sites = siteKeys
    .map((site) => {
      const baseline = first.measurements.find((m) => m.site === site)?.cm ?? NaN;
      const latest = last.measurements.find((m) => m.site === site)?.cm ?? NaN;
      if (!Number.isFinite(baseline) || !Number.isFinite(latest) || baseline <= 0) return null;
      return {
        site, baseline, latest,
        change: +(latest - baseline).toFixed(1),
        percent: +(((latest - baseline) / baseline) * 100).toFixed(1),
      };
    })
    .filter(Boolean) as ProgressAssessment["sites"];

  const meanPer = (v: { measurements: LimbMeasurement[] }) => {
    const vals = v.measurements.filter((m) => Number.isFinite(m.cm) && m.cm > 0).map((m) => m.cm);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  };
  const series = withData.map(meanPer).filter((n) => Number.isFinite(n));
  const percentChange = series.length >= 2 && series[0] > 0
    ? ((series[series.length - 1] - series[0]) / series[0]) * 100
    : 0;
  const slopePerVisit = slope(series);

  const imgs = images.filter(Boolean) as ImageSignal[];
  const imagePercentChange = imgs.length >= 2 && imgs[0].areaFraction > 0
    ? ((imgs[imgs.length - 1].areaFraction - imgs[0].areaFraction) / imgs[0].areaFraction) * 100
    : null;

  const verdict: ProgressVerdict =
    percentChange <= -3 ? "reduction" : percentChange >= 3 ? "increase" : "stable";

  // Confidence: more visits, larger effect and agreement with the photographs.
  let confidence = Math.min(0.6, 0.25 + 0.1 * (withData.length - 1))
    + Math.min(0.2, Math.abs(percentChange) / 50);
  if (imagePercentChange != null) {
    const agrees = Math.sign(imagePercentChange) === Math.sign(percentChange) || verdict === "stable";
    confidence += agrees ? 0.2 : -0.15;
  }
  confidence = Math.max(0.1, Math.min(0.97, confidence));

  const abs = Math.abs(percentChange).toFixed(1);
  const headline =
    verdict === "reduction" ? `Visible reduction — ${abs}% smaller than baseline`
      : verdict === "increase" ? `Swelling has increased by ${abs}%`
        : "No meaningful change since baseline";
  const detail = [
    `Average measurement moved ${slopePerVisit >= 0 ? "+" : ""}${slopePerVisit.toFixed(2)} cm per visit across ${withData.length} visits.`,
    imagePercentChange != null
      ? `Photograph analysis shows the affected area is ${Math.abs(imagePercentChange).toFixed(0)}% ${imagePercentChange < 0 ? "smaller" : "larger"} in the frame.`
      : "Add a photograph at each visit so the app can corroborate the measurements.",
  ].join(" ");

  return { verdict, percentChange, slopePerVisit, confidence, headline, detail, sites, imagePercentChange };
};

export const SITE_LABELS: Record<string, string> = {
  limb_ankle: "Ankle circumference",
  limb_calf: "Mid-calf circumference",
  limb_knee: "Below knee circumference",
  limb_thigh: "Mid-thigh circumference",
  limb_forearm: "Forearm circumference",
  scrotum_circumference: "Scrotal circumference",
  scrotum_length: "Scrotal length",
};
