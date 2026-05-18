// Design-based coverage estimation + CIs and two-proportion z-test vs Microplanning.

export interface SegmentTally {
  label?: string;
  est_hh: number;            // GIS estimated households
  reported_total_hh: number; // User reported total households in segment
  sampled: number;           // HHs interviewed (in 3D mapping)
  treated_hh: number;        // HHs where treatment took place
  eligible_persons: number;  // Total eligible persons in sampled HHs
  treated_persons: number;   // Total treated persons in sampled HHs
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
  // New Metrics
  therapeuticCoveragePct: number;
  geographicCoveragePct: number;
  totalEligiblePersons: number;
  totalTreatedPersons: number;
  totalReportedHH: number;
  totalTreatedHH: number;
}


// Weighted (design-based) estimator with finite population correction
export function computeCoverage(segments: SegmentTally[]): CoverageEstimate {
  const sampled = segments.filter((s) => s.sampled > 0);
  const totalEstHH = segments.reduce((a, s) => a + s.est_hh, 0);
  const totalReportedHH = segments.reduce((a, s) => a + s.reported_total_hh, 0);
  const totalSampled = sampled.reduce((a, s) => a + s.sampled, 0);
  const totalTreatedHH = sampled.reduce((a, s) => a + s.treated_hh, 0);
  const totalEligiblePersons = sampled.reduce((a, s) => a + s.eligible_persons, 0);
  const totalTreatedPersons = sampled.reduce((a, s) => a + s.treated_persons, 0);

  if (totalSampled === 0 || totalEstHH === 0) {
    return {
      inferredCoveragePct: 0, pHat: 0, seWeighted: 0,
      ci95: [0, 0], ci99: [0, 0], designEffect: 1, precisionPct: 0,
      totalSampled, totalTreated: totalTreatedHH, totalEstHH,
      therapeuticCoveragePct: 0, geographicCoveragePct: 0,
      totalEligiblePersons: 0, totalTreatedPersons: 0,
      totalReportedHH, totalTreatedHH,
    };
  }


  // Weights = N_h / n_h (stratum-level inverse selection probability)
  let num = 0;
  let varSum = 0;
  for (const s of sampled) {
    if (s.sampled === 0) continue;
    const w = s.est_hh / s.sampled;
    const p_h = s.treated_hh / s.sampled;
    num += w * s.treated_hh;

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
    totalTreated: totalTreatedHH,
    totalEstHH,
    therapeuticCoveragePct: totalEligiblePersons > 0 ? (totalTreatedPersons / totalEligiblePersons) * 100 : 0,
    geographicCoveragePct: totalReportedHH > 0 ? (totalTreatedHH / totalReportedHH) * 100 : 0,
    totalEligiblePersons,
    totalTreatedPersons,
    totalReportedHH,
    totalTreatedHH,
  };
}


export interface ProportionCompare {
  pCES: number; pJRSM: number;
  diff: number; // pCES - pJRSM (pct points)
  z: number; pValue: number;
  ci95: [number, number]; ci99: [number, number]; // diff CI in pct
  cohenH: number;        // effect size, Cohen's h
  effectMagnitude: "negligible" | "small" | "medium" | "large";
  direction: "above" | "below" | "equal"; // CES vs Microplan
  agreement: "agree" | "minor_discrepancy" | "major_discrepancy";
}

// Cohen's h effect size for two proportions
export function cohensH(p1: number, p2: number): number {
  const phi = (p: number) => 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, p))));
  return phi(p1) - phi(p2);
}

export function classifyEffect(h: number): ProportionCompare["effectMagnitude"] {
  const a = Math.abs(h);
  if (a < 0.2) return "negligible";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  return "large";
}

export function isSignificantAtAlpha(pValue: number, alpha: number): boolean {
  return pValue < (Number.isFinite(alpha) && alpha > 0 ? alpha : 0.05);
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
  const pValue = pVal;
  const z95 = 1.96, z99 = 2.576;
  const absDiff = Math.abs((p1 - p2) * 100);
  const agreement: ProportionCompare["agreement"] =
    pValue > 0.05 ? "agree" : absDiff < 10 ? "minor_discrepancy" : "major_discrepancy";
  const h = cohensH(p1, p2);
  return {
    pCES: p1 * 100, pJRSM: p2 * 100,
    diff: (p1 - p2) * 100, z, pValue,
    ci95: [(p1 - p2) * 100 - z95 * seDiff * 100, (p1 - p2) * 100 + z95 * seDiff * 100],
    ci99: [(p1 - p2) * 100 - z99 * seDiff * 100, (p1 - p2) * 100 + z99 * seDiff * 100],
    cohenH: h,
    effectMagnitude: classifyEffect(h),
    direction: p1 > p2 ? "above" : p1 < p2 ? "below" : "equal",
    agreement,
  };
}

// Two-proportion z-test (geographic coverage) — pCES = treated_hh/reported_hh, pMicro = treated_micro/reported_micro
export function compareGeographicCoverage(
  cesTreatedHH: number, cesReportedHH: number,
  microTreatedHH: number, microReportedHH: number,
): ProportionCompare | null {
  if (cesReportedHH <= 0 || microReportedHH <= 0) return null;
  const p1 = cesTreatedHH / cesReportedHH;
  const p2 = microTreatedHH / microReportedHH;
  const pPool = (cesTreatedHH + microTreatedHH) / (cesReportedHH + microReportedHH);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / cesReportedHH + 1 / microReportedHH));

  if (se === 0) {
    const diff = (p1 - p2) * 100;
    return {
      pCES: p1 * 100, pJRSM: p2 * 100, diff, z: 0, pValue: 1,
      ci95: [diff, diff], ci99: [diff, diff],
      agreement: diff === 0 ? "agree" : "major_discrepancy"
    };
  }

  const z = (p1 - p2) / se;
  // Two-tailed p-value
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  let agreement: ProportionCompare["agreement"] = "agree";
  const diff = (p1 - p2) * 100;
  if (Math.abs(diff) > 10 && pValue < 0.05) agreement = "major_discrepancy";
  else if (Math.abs(diff) > 5) agreement = "minor_discrepancy";

  const z95 = 1.96, z99 = 2.576;
  return {
    pCES: p1 * 100, pJRSM: p2 * 100,
    diff, z, pValue,
    ci95: [diff - z95 * se * 100, diff + z95 * se * 100],
    ci99: [diff - z99 * se * 100, diff + z99 * se * 100],
    agreement,
  };
}


function normalCdf(z: number): number {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
