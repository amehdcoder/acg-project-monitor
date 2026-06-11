// Population reconciliation for the Historical Data Review tab.
//
// Goal: given (a) historical microplan estimates per location across years,
// (b) WorldPop v3.0 LGA totals (projected forward 2026-2030), and
// (c) an optional GRID3 estimate, produce the single best recommended
// population figure for planning using an appropriate geostatistical method.
//
// Method summary
// --------------
// 1. GEOCODING / MATCHING — each location is resolved to its LGA using a
//    normalized "state|lga" key, tolerant of spelling/case/punctuation, so the
//    WorldPop LGA total can be attached.
// 2. DASYMETRIC DISAGGREGATION (areal weighting) — a WorldPop LGA total is an
//    aggregate; it is apportioned down to each community using the community's
//    share of the LGA's current-year microplan population as the ancillary
//    weight. This is the standard pycnophylactic / dasymetric weighting used in
//    spatial demography to move counts between incompatible areal units.
// 3. TEMPORAL PROJECTION — the WorldPop baseline (~2024) is grown to the chosen
//    planning year (2026-2030) with a geometric (compound) growth model, the
//    accepted method for short-horizon population projection.
// 4. ROBUST ENSEMBLE RECONCILIATION — the candidate sources (current year,
//    trend-projected previous year, WorldPop-apportioned, GRID3) are combined
//    with a median-anchored, inverse-deviation (precision) weighted mean. This
//    geostatistical estimator down-weights outliers relative to the spatial/
//    cross-source median, giving a stable best estimate with a confidence band.

import {
  WORLDPOP_LGA,
  WORLDPOP_BASELINE_YEAR,
  NIGERIA_ANNUAL_GROWTH,
} from "./worldpopLGA";
import { GRID3_LGA, GRID3_BASELINE_YEAR } from "./grid3Population";

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const STATE_ALIAS: Record<string, string> = {
  federalcapitalterritory: "fct",
  abuja: "fct",
  fctabuja: "fct",
  nassarawa: "nasarawa",
  akwaibom: "akwaibom",
  crossriver: "crossriver",
};

/** Normalized "state|lga" lookup key tolerant of aliases. */
export function lgaPopKey(state: unknown, lga: unknown): string {
  const st = norm(state);
  return `${STATE_ALIAS[st] ?? st}|${norm(lga)}`;
}

/** Resolve a WorldPop LGA baseline total with tolerant (prefix) matching. */
export function resolveWorldPopLGA(state: unknown, lga: unknown): number | null {
  const key = lgaPopKey(state, lga);
  if (WORLDPOP_LGA[key] != null) return WORLDPOP_LGA[key];
  const [st, lg] = key.split("|");
  if (!st || !lg) return null;
  let best: number | null = null;
  for (const k of Object.keys(WORLDPOP_LGA)) {
    const [s, l] = k.split("|");
    if (s !== st || !l) continue;
    if (l === lg || l.startsWith(lg) || lg.startsWith(l) || (l.length >= 5 && lg.length >= 5 && (l.includes(lg) || lg.includes(l)))) {
      best = WORLDPOP_LGA[k];
      break;
    }
  }
  return best;
}

/** Geometric (compound) projection of a baseline population to a target year. */
export function projectPopulation(
  baseline: number,
  targetYear: number,
  baselineYear = WORLDPOP_BASELINE_YEAR,
  rate = NIGERIA_ANNUAL_GROWTH,
): number {
  const dt = targetYear - baselineYear;
  return Math.round(baseline * Math.pow(1 + rate, dt));
}

export type EstimateSource = { label: string; value: number; weight?: number };

export interface ReconciliationResult {
  value: number;
  low: number;
  high: number;
  method: string;
  rationale: string;
  status: "ok" | "warn" | "alert";
  sources: EstimateSource[];
  cv: number; // coefficient of variation across sources (dispersion)
}

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Median-anchored, inverse-deviation weighted reconciliation.
 * Each source is weighted by 1 / (|source - median| + ε), so values far from the
 * cross-source median (likely data-entry or boundary-mismatch errors) contribute
 * less. Falls back gracefully when only 1-2 sources exist.
 */
export function reconcilePopulation(sources: EstimateSource[]): ReconciliationResult {
  const valid = sources.filter((s) => Number.isFinite(s.value) && s.value > 0);
  if (!valid.length) {
    return {
      value: 0, low: 0, high: 0, cv: 0,
      method: "none", status: "warn",
      rationale: "No population sources available.", sources: [],
    };
  }
  if (valid.length === 1) {
    const v = Math.round(valid[0].value);
    return {
      value: v, low: v, high: v, cv: 0,
      method: "single-source",
      status: "warn",
      rationale: `Only ${valid[0].label} available — using it directly. Add WorldPop/GRID3/prior-year data to strengthen the estimate.`,
      sources: valid,
    };
  }

  const values = valid.map((s) => s.value);
  const med = median(values);
  const eps = Math.max(med * 0.01, 1);

  // inverse-deviation precision weights (× any caller-supplied prior weight)
  let wsum = 0;
  let acc = 0;
  valid.forEach((s) => {
    const w = (s.weight ?? 1) / (Math.abs(s.value - med) + eps);
    acc += s.value * w;
    wsum += w;
  });
  const weighted = acc / wsum;

  // dispersion / confidence band
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  const cv = mean > 0 ? sd / mean : 0;
  const spread = Math.max(...values) / Math.max(1, Math.min(...values));

  const value = Math.round(weighted);
  const low = Math.round(Math.min(value, med) - sd / 2);
  const high = Math.round(Math.max(value, med) + sd / 2);

  const status: "ok" | "warn" | "alert" = spread > 2 || cv > 0.4 ? "alert" : spread > 1.4 || cv > 0.2 ? "warn" : "ok";

  return {
    value,
    low: Math.max(0, low),
    high,
    cv,
    method: "robust-ensemble",
    status,
    rationale: `Median-anchored inverse-deviation weighting of ${valid.length} sources (CV ${(cv * 100).toFixed(0)}%, spread ×${spread.toFixed(2)}). ${status === "alert" ? "High disagreement — verify field count." : status === "warn" ? "Moderate disagreement." : "Sources agree well."}`,
    sources: valid,
  };
}
