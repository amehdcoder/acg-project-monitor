/**
 * Predictive models for the Integrated Supervisory Checklist.
 * ────────────────────────────────────────────────────────────────────────────
 * Two dependency-free, fully local (no AI, no network) models:
 *
 *  1. `forecastCompletion` — weighted least-squares velocity model that projects
 *     the MDA campaign completion date from the observed geographic-coverage
 *     curve, adjusted for medicine-offer performance and the Status-of-MDA mix.
 *     Returns days-from-today, the calendar date, and a 95% confidence band.
 *
 *  2. `estimatePrevalence` — hierarchical (State → LGA → Ward) prevalence
 *     estimator with Wilson score 95% intervals, refined by empirical-Bayes
 *     calibration against user-entered observed prevalence.
 *
 * Every formula is documented verbatim in the Methodology dialog so analysts
 * can reproduce the numbers by hand.
 */

import { tCritical95 } from "@/lib/statisticalInference";

// ── Shared helpers ──────────────────────────────────────────────────────────

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Wilson score interval for a binomial proportion (superior to Wald at small n). */
export function wilsonInterval(successes: number, n: number, z = 1.96) {
  if (n <= 0) return { p: 0, low: 0, high: 0, n: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, low: clamp01(centre - margin), high: clamp01(centre + margin), n };
}

// ── 1. Campaign completion timeline ─────────────────────────────────────────

export interface CoveragePoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Cumulative distinct communities visited up to and including this day. */
  cumulative: number;
}

export interface CompletionForecast {
  /** Cumulative communities covered so far. */
  covered: number;
  /** Denominator — total communities targeted. */
  target: number;
  coverage: number;
  /** Raw regression slope, communities/day. */
  rawVelocity: number;
  /** Velocity after the offer-rate and status-mix adjustment. */
  adjVelocity: number;
  velocityLow: number;
  velocityHigh: number;
  /** Multiplicative performance adjustment applied to the raw velocity. */
  adjustment: number;
  offeredRate: number;
  haltedShare: number;
  completedShare: number;
  days: number;
  daysLow: number;
  daysHigh: number;
  date: string;
  dateLow: string;
  dateHigh: string;
  observations: number;
  rSquared: number;
  /** Non-null when the model cannot be fitted; explains why. */
  warning: string | null;
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

/**
 * Weighted linear regression of cumulative coverage on time.
 * Recency weights wᵢ = 0.5^((tₙ − tᵢ)/halfLife) put more trust in current
 * field throughput than in the campaign's ramp-up phase.
 */
export function forecastCompletion(opts: {
  points: CoveragePoint[];
  target: number | null;
  offeredRate: number;   // 0–1, share of respondents offered the medicine(s)
  haltedShare: number;   // 0–1, share of checklists reporting Halted / Not Started
  completedShare: number; // 0–1, share of checklists reporting Completed
  halfLifeDays?: number;
}): CompletionForecast | null {
  const { points, target, offeredRate, haltedShare, completedShare } = opts;
  const halfLife = opts.halfLifeDays ?? 7;
  if (points.length === 0) return null;

  const covered = points[points.length - 1].cumulative;
  const tgt = target && target > 0 ? target : 0;
  const coverage = tgt ? clamp01(covered / tgt) : 0;

  const base: CompletionForecast = {
    covered, target: tgt, coverage,
    rawVelocity: 0, adjVelocity: 0, velocityLow: 0, velocityHigh: 0,
    adjustment: 1, offeredRate, haltedShare, completedShare,
    days: 0, daysLow: 0, daysHigh: 0, date: "—", dateLow: "—", dateHigh: "—",
    observations: points.length, rSquared: 0, warning: null,
  };

  if (!tgt) return { ...base, warning: "Set the total communities targeted to enable the forecast." };
  if (points.length < 3) return { ...base, warning: "At least 3 distinct submission days are required to fit the velocity model." };

  const t0 = new Date(points[0].date + "T00:00:00Z").getTime();
  const tEnd = new Date(points[points.length - 1].date + "T00:00:00Z").getTime();
  const xs = points.map((p) => (new Date(p.date + "T00:00:00Z").getTime() - t0) / 86_400_000);
  const ys = points.map((p) => p.cumulative);
  const ws = points.map((p) => {
    const age = (tEnd - new Date(p.date + "T00:00:00Z").getTime()) / 86_400_000;
    return Math.pow(0.5, age / halfLife);
  });

  const W = ws.reduce((s, w) => s + w, 0);
  const mx = xs.reduce((s, x, i) => s + ws[i] * x, 0) / W;
  const my = ys.reduce((s, y, i) => s + ws[i] * y, 0) / W;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += ws[i] * (xs[i] - mx) ** 2;
    sxy += ws[i] * (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx <= 0) return { ...base, warning: "Submissions span a single day — no time variation to model." };

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  // Residual variance → standard error of the slope.
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    const fit = intercept + slope * xs[i];
    ssRes += ws[i] * (ys[i] - fit) ** 2;
    ssTot += ws[i] * (ys[i] - my) ** 2;
  }
  const df = xs.length - 2;
  const seSlope = df > 0 && sxx > 0 ? Math.sqrt(ssRes / df / sxx) : 0;
  const tc = tCritical95(Math.max(df, 1));
  const rSquared = ssTot > 0 ? clamp01(1 - ssRes / ssTot) : 0;

  // Performance adjustment: poor medicine-offer performance and a large
  // halted / not-started backlog slow effective throughput.
  const adjustment = clamp01(0.55 + 0.45 * clamp01(offeredRate)) * (1 - 0.35 * clamp01(haltedShare));
  const adjVelocity = slope * adjustment;
  const vLow = Math.max((slope - tc * seSlope) * adjustment, 0);
  const vHigh = Math.max((slope + tc * seSlope) * adjustment, 0);

  const remaining = Math.max(tgt - covered, 0);
  if (adjVelocity <= 0) {
    return {
      ...base, rawVelocity: slope, adjVelocity, velocityLow: vLow, velocityHigh: vHigh,
      adjustment, rSquared,
      warning: "Effective coverage velocity is zero or negative — the campaign is stalled and no completion date can be projected.",
    };
  }

  const today = new Date();
  const days = remaining / adjVelocity;
  const daysLow = vHigh > 0 ? remaining / vHigh : days;      // fastest plausible
  const daysHigh = vLow > 0 ? remaining / vLow : Infinity;   // slowest plausible

  const cap = (n: number) => (Number.isFinite(n) ? Math.min(n, 3650) : 3650);

  return {
    ...base,
    rawVelocity: slope, adjVelocity, velocityLow: vLow, velocityHigh: vHigh,
    adjustment, rSquared,
    days: Math.ceil(days),
    daysLow: Math.max(0, Math.floor(daysLow)),
    daysHigh: Math.ceil(cap(daysHigh)),
    date: fmtDate(addDays(today, Math.ceil(days))),
    dateLow: fmtDate(addDays(today, Math.max(0, Math.floor(daysLow)))),
    dateHigh: fmtDate(addDays(today, Math.ceil(cap(daysHigh)))),
    warning: remaining === 0 ? "Target already reached — campaign coverage is complete." : null,
  };
}

// ── 2. Hierarchical prevalence model with learning calibration ──────────────

export type AdminLevel = "state" | "lga" | "ward";

export interface PrevalenceUnit {
  level: AdminLevel;
  /** "State" | "State|LGA" | "State|LGA|Ward" */
  key: string;
  state: string;
  lga?: string;
  ward?: string;
  disease: string;
  /** Respondents contributing to the estimate. */
  n: number;
  /** Untreated respondents (risk numerator). */
  untreated: number;
  /** Model point estimate (0–1) after calibration. */
  predicted: number;
  low: number;
  high: number;
  /** Pre-calibration model estimate. */
  raw: number;
  /** Calibration multiplier applied (1 = no learning yet). */
  factor: number;
  /** User-entered observed prevalence, if any. */
  observed: number | null;
  /** Absolute calibration error at the last learning step. */
  residual: number | null;
}

/** Endemic baseline priors (untreated-population prevalence) per campaign type. */
export const DISEASE_PRIORS: Record<string, number> = {
  "Schistosomiasis": 0.18,
  "Onchocerciasis Only": 0.12,
  "Onchocerciasis/Lymphatic Filariasis": 0.14,
  "Soil Transmitted Helminths": 0.24,
  "Schistosomiasis/Soil Transmitted Helminths": 0.22,
  "Trachoma": 0.09,
  "Multiple Drug Therapy": 0.16,
};
export const DEFAULT_PRIOR = 0.15;

export interface ObservedRecord {
  /** `${disease}::${key}` */
  id: string;
  disease: string;
  key: string;
  level: AdminLevel;
  /** Observed prevalence as a proportion (0–1). */
  value: number;
  updatedAt: string;
}

/** Shrinkage pseudo-count: how much evidence is needed before the model fully trusts an observation. */
const SHRINK_K = 2;

/**
 * Empirical-Bayes calibration factor for a unit.
 * Learns from observations at the unit itself, then falls back up the hierarchy
 * (Ward → LGA → State → disease-global), each level shrunk toward 1.
 */
function calibrationFactor(
  disease: string,
  chain: string[],           // most specific first
  learned: Map<string, { logSum: number; weight: number }>,
): number {
  let logFactor = 0;
  let remaining = 1;
  for (const key of [...chain, "*"]) {
    const rec = learned.get(`${disease}::${key}`);
    if (!rec || rec.weight <= 0) continue;
    const shrunk = rec.logSum / (rec.weight + SHRINK_K);
    logFactor += remaining * shrunk;
    remaining *= 0.35; // each broader level contributes progressively less
    if (remaining < 0.05) break;
  }
  return Math.exp(logFactor);
}

/**
 * Builds the calibration memory from observed prevalence entries.
 * Each observation contributes ln(observed / raw-model) weighted by √n.
 */
export function buildCalibration(
  observations: ObservedRecord[],
  rawByUnit: Map<string, { raw: number; n: number; state: string; lga?: string; ward?: string }>,
): Map<string, { logSum: number; weight: number }> {
  const learned = new Map<string, { logSum: number; weight: number }>();
  const add = (id: string, ln: number, w: number) => {
    const rec = learned.get(id) ?? { logSum: 0, weight: 0 };
    rec.logSum += ln * w;
    rec.weight += w;
    learned.set(id, rec);
  };

  for (const obs of observations) {
    const unit = rawByUnit.get(`${obs.disease}::${obs.key}`);
    if (!unit || unit.raw <= 0 || obs.value <= 0) continue;
    const ln = Math.log(obs.value / unit.raw);
    const w = Math.sqrt(Math.max(unit.n, 1));
    add(`${obs.disease}::${obs.key}`, ln, w);
    // Propagate to broader levels so unseen siblings also benefit.
    const parts = obs.key.split("|");
    for (let i = parts.length - 1; i >= 1; i--) {
      add(`${obs.disease}::${parts.slice(0, i).join("|")}`, ln, w * 0.6);
    }
    add(`${obs.disease}::*`, ln, w * 0.4);
  }
  return learned;
}

export interface PrevalenceInput {
  disease: string;
  state: string;
  lga: string;
  ward: string;
  /** true when the respondent did NOT swallow / was NOT offered the medicine. */
  untreated: boolean;
}

/**
 * Hierarchical prevalence estimator.
 * Raw model:  p̂ = prior × (0.35 + 0.65 × untreatedRate)
 * The multiplier encodes the epidemiological fact that treated populations
 * retain residual prevalence (≈35% of the endemic baseline in the season
 * following MDA) while untreated populations regress to the endemic baseline.
 */
export function estimatePrevalence(
  rows: PrevalenceInput[],
  observations: ObservedRecord[],
): PrevalenceUnit[] {
  type Agg = { n: number; untreated: number; state: string; lga?: string; ward?: string; level: AdminLevel; disease: string };
  const agg = new Map<string, Agg>();

  const bump = (disease: string, level: AdminLevel, key: string, meta: Omit<Agg, "n" | "untreated" | "level" | "disease">, untreated: boolean) => {
    const id = `${disease}::${key}`;
    const rec = agg.get(id) ?? { n: 0, untreated: 0, level, disease, ...meta };
    rec.n += 1;
    if (untreated) rec.untreated += 1;
    agg.set(id, rec);
  };

  for (const r of rows) {
    if (!r.disease || !r.state) continue;
    bump(r.disease, "state", r.state, { state: r.state }, r.untreated);
    if (r.lga) bump(r.disease, "lga", `${r.state}|${r.lga}`, { state: r.state, lga: r.lga }, r.untreated);
    if (r.lga && r.ward) bump(r.disease, "ward", `${r.state}|${r.lga}|${r.ward}`, { state: r.state, lga: r.lga, ward: r.ward }, r.untreated);
  }

  const rawByUnit = new Map<string, { raw: number; n: number; state: string; lga?: string; ward?: string }>();
  for (const [id, a] of agg) {
    const prior = DISEASE_PRIORS[a.disease] ?? DEFAULT_PRIOR;
    const untreatedRate = a.n ? a.untreated / a.n : 0;
    const raw = clamp01(prior * (0.35 + 0.65 * untreatedRate));
    rawByUnit.set(id, { raw, n: a.n, state: a.state, lga: a.lga, ward: a.ward });
  }

  const learned = buildCalibration(observations, rawByUnit);
  const obsById = new Map(observations.map((o) => [`${o.disease}::${o.key}`, o]));

  const out: PrevalenceUnit[] = [];
  for (const [id, a] of agg) {
    const key = id.split("::")[1];
    const raw = rawByUnit.get(id)!.raw;
    const chain: string[] = [];
    const parts = key.split("|");
    for (let i = parts.length; i >= 1; i--) chain.push(parts.slice(0, i).join("|"));
    const factor = calibrationFactor(a.disease, chain, learned);
    const predicted = clamp01(raw * factor);

    // Wilson interval on the untreated proportion, scaled through the model.
    const w = wilsonInterval(a.untreated, a.n);
    const prior = DISEASE_PRIORS[a.disease] ?? DEFAULT_PRIOR;
    const toP = (rate: number) => clamp01(prior * (0.35 + 0.65 * rate) * factor);
    const obs = obsById.get(id) ?? null;

    out.push({
      level: a.level, key, state: a.state, lga: a.lga, ward: a.ward,
      disease: a.disease, n: a.n, untreated: a.untreated,
      predicted, low: toP(w.low), high: toP(w.high), raw, factor,
      observed: obs ? obs.value : null,
      residual: obs ? Math.abs(obs.value - predicted) : null,
    });
  }

  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
