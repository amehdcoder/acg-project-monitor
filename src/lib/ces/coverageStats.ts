// Design-based coverage estimation + CIs and two-proportion z-test vs Microplanning.

export interface SegmentTally {
  est_hh: number;     // estimated households in segment (universe)
  sampled: number;    // households interviewed
  treated: number;    // treated count
}

export interface CoverageEstimate {
  inferredCoveragePct: number;  // 0-100
  pHat: number;                 // 0-1
  seWeighted: number;           // standard error
  ci95: [number, number];       // pct
  ci99: [number, number];       // pct
  designEffect: number;
  precisionPct: number;         // half-width of 95% CI in pct points
  totalSampled: number;
  totalTreated: number;
  totalEstHH: number;
}

// Weighted (design-based) estimator with finite population correction
export function computeCoverage(segments: SegmentTally[]): CoverageEstimate {
  const sampled = segments.filter((s) => s.sampled > 0);
  const totalEstHH = segments.reduce((a, s) => a + s.est_hh, 0);
  const totalSampled = sampled.reduce((a, s) => a + s.sampled, 0);
  const totalTreated = sampled.reduce((a, s) => a + s.treated, 0);

  if (totalSampled === 0 || totalEstHH === 0) {
    return {
      inferredCoveragePct: 0, pHat: 0, seWeighted: 0,
      ci95: [0, 0], ci99: [0, 0], designEffect: 1, precisionPct: 0,
      totalSampled, totalTreated, totalEstHH,
    };
  }

  // Weights = N_h / n_h (stratum-level inverse selection probability)
  let num = 0;
  let varSum = 0;
  for (const s of sampled) {
    if (s.sampled === 0) continue;
    const w = s.est_hh / s.sampled;
    const p_h = s.treated / s.sampled;
    num += w * s.treated;
    // stratum variance contribution: N_h^2 * (1 - n_h/N_h) * p(1-p)/(n_h-1)
    if (s.sampled > 1) {
      const fpc = s.est_hh > 0 ? Math.max(0, 1 - s.sampled / s.est_hh) : 1;
      varSum += s.est_hh * s.est_hh * fpc * (p_h * (1 - p_h)) / (s.sampled - 1);
    }
  }
  const totalUniverseSampledStrata = sampled.reduce((a, s) => a + s.est_hh, 0) || 1;
  const pHat = num / totalUniverseSampledStrata;
  const seWeighted = Math.sqrt(varSum) / totalUniverseSampledStrata;

  // Simple random sample variance for design effect comparison
  const srsVar = (pHat * (1 - pHat)) / totalSampled;
  const designEffect = srsVar > 0 ? (seWeighted * seWeighted) / srsVar : 1;

  const z95 = 1.96, z99 = 2.576;
  const ci95: [number, number] = [
    Math.max(0, (pHat - z95 * seWeighted) * 100),
    Math.min(100, (pHat + z95 * seWeighted) * 100),
  ];
  const ci99: [number, number] = [
    Math.max(0, (pHat - z99 * seWeighted) * 100),
    Math.min(100, (pHat + z99 * seWeighted) * 100),
  ];

  return {
    inferredCoveragePct: pHat * 100,
    pHat,
    seWeighted,
    ci95,
    ci99,
    designEffect: Number.isFinite(designEffect) ? designEffect : 1,
    precisionPct: (ci95[1] - ci95[0]) / 2,
    totalSampled,
    totalTreated,
    totalEstHH,
  };
}

export interface ProportionCompare {
  pCES: number; pJRSM: number;
  diff: number; // pCES - pJRSM
  z: number; pValue: number;
  ci95: [number, number]; ci99: [number, number]; // diff CI in pct
  agreement: "agree" | "minor_discrepancy" | "major_discrepancy";
}

// Two-proportion z-test (treated/total) — pCES = treated_ces/sampled_ces, pJRSM = treated_reported/target
export function compareProportions(
  cesTreated: number, cesSampled: number,
  jrsmTreated: number, jrsmTarget: number,
): ProportionCompare | null {
  if (cesSampled <= 0 || jrsmTarget <= 0) return null;
  const p1 = cesTreated / cesSampled;
  const p2 = jrsmTreated / jrsmTarget;
  const pPool = (cesTreated + jrsmTreated) / (cesSampled + jrsmTarget);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / cesSampled + 1 / jrsmTarget));
  const z = se > 0 ? (p1 - p2) / se : 0;
  // two-sided p-value (normal approx)
  const pVal = 2 * (1 - normalCdf(Math.abs(z)));
  const seDiff = Math.sqrt((p1 * (1 - p1)) / cesSampled + (p2 * (1 - p2)) / jrsmTarget);
  const diff = (p1 - p2) * 100;
  const ci95: [number, number] = [diff - 1.96 * seDiff * 100, diff + 1.96 * seDiff * 100];
  const ci99: [number, number] = [diff - 2.576 * seDiff * 100, diff + 2.576 * seDiff * 100];
  const absDiff = Math.abs(diff);
  const agreement: ProportionCompare["agreement"] =
    pVal > 0.05 ? "agree" : absDiff < 10 ? "minor_discrepancy" : "major_discrepancy";
  return { pCES: p1 * 100, pJRSM: p2 * 100, diff, z, pValue: pVal, ci95, ci99, agreement };
}

function normalCdf(z: number): number {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
