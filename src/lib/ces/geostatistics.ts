import { LatLng, Segment } from "./kmeansSegments";

export interface SegmentCoverage {
  label: string;
  observed: boolean;
  rate: number; // 0-1
  count: number; // sample size
}

/**
 * Infer coverage for unsampled segments using Inverse Distance Weighting (IDW)
 * "Globally acceptable" spatial interpolation for discrete area units.
 */
export function inferSegmentCoverage(
  segments: Segment[],
  observations: Record<string, { total: number; covered: number }>
): Record<string, number> {
  const sampled: { centroid: LatLng; rate: number; label: string }[] = [];
  const results: Record<string, number> = {};

  // 1. Identify sampled segments and their observed rates
  segments.forEach((seg) => {
    const obs = observations[seg.label];
    if (obs && obs.total > 0) {
      const rate = obs.covered / obs.total;
      sampled.push({ centroid: seg.centroid, rate, label: seg.label });
      results[seg.label] = rate;
    }
  });

  // 2. If no segments sampled, return 0 (or a default)
  if (sampled.length === 0) {
    segments.forEach((seg) => (results[seg.label] = 0));
    return results;
  }

  // 3. If only one segment sampled, use that rate for everyone (simplest global mean)
  if (sampled.length === 1) {
    const globalRate = sampled[0].rate;
    segments.forEach((seg) => {
      if (results[seg.label] === undefined) results[seg.label] = globalRate;
    });
    return results;
  }

  // 4. For unsampled segments, use IDW (Inverse Distance Weighting)
  segments.forEach((seg) => {
    if (results[seg.label] !== undefined) return;

    let weightedSum = 0;
    let weightTotal = 0;

    sampled.forEach((s) => {
      const d2 = distSq(seg.centroid, s.centroid);
      const weight = 1 / Math.max(d2, 1e-9); // avoid division by zero
      weightedSum += s.rate * weight;
      weightTotal += weight;
    });

    results[seg.label] = weightedSum / weightTotal;
  });

  return results;
}

function distSq(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dy = ((a.lat - b.lat) * Math.PI) / 180 * R;
  const dx = ((a.lng - b.lng) * Math.PI) / 180 * R * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + dy * dy;
}

export function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat;
    const xj = poly[j].lng, yj = poly[j].lat;
    const intersect = yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
