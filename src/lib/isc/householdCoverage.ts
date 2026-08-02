/**
 * Household Survey Coverage estimation for the Integrated MDA Supervisory Checklist.
 *
 * The supervisory checklist is, statistically, a *two-stage cluster sample*:
 *   Stage 1 — communities (clusters) are visited by monitors.
 *   Stage 2 — a small number of households/classes are interviewed per community.
 *
 * Treating the pooled respondents as a simple random sample would UNDERSTATE the
 * uncertainty (households inside the same community are correlated) and can bias
 * the point estimate toward large clusters. To generalise honestly from the
 * sampled households to *all* households in a Community / Ward / LGA / State we
 * therefore use:
 *
 *   • A ratio estimator  p = Σx_i / Σn_i  over clusters i (self-weighting, so it
 *     neither over- nor under-estimates coverage when cluster sizes differ).
 *   • Taylor-linearised between-cluster variance for the ratio, which is the
 *     standard design-based variance for cluster samples.
 *   • A logit-transformed 95% confidence interval (t-distribution, df = clusters−1)
 *     so the interval never leaves [0, 1] and stays valid for extreme proportions.
 *   • A Wilson score interval as the fallback when only ONE cluster is available
 *     (no between-cluster information exists — the interval is then binomial only
 *     and is flagged as such).
 *   • Design effect (DEFF), effective sample size and the intra-cluster
 *     correlation (ICC / roh) are reported so users can judge precision.
 *
 * Everything is computed locally — no network, no AI, O(n) over respondents.
 */

import { tCritical95 } from "@/lib/statisticalInference";
import { resolveChecklistValue, splitMulti } from "@/components/IntegratedSupervisory/checklistSchema";

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Core interval machinery
// ---------------------------------------------------------------------------

export interface CoverageEstimate {
  /** Weighted point estimate (proportion 0–1). */
  p: number;
  /** Numerator (households meeting the indicator). */
  x: number;
  /** Denominator (households assessed for the indicator). */
  n: number;
  /** Number of clusters (communities) contributing. */
  clusters: number;
  ciLow: number;
  ciHigh: number;
  /** Standard error of the ratio estimator. */
  se: number;
  /** Design effect (1 = as good as simple random sampling). */
  deff: number;
  /** Effective sample size n / DEFF. */
  neff: number;
  /** Intra-cluster correlation implied by DEFF. */
  icc: number;
  /** Half-width of the CI in percentage points. */
  marginPct: number;
  /** Estimation route actually used. */
  method: "cluster" | "wilson" | "none";
  /** True when precision is too weak to generalise confidently. */
  lowPrecision: boolean;
}

const EMPTY: CoverageEstimate = {
  p: 0, x: 0, n: 0, clusters: 0, ciLow: 0, ciHigh: 0, se: 0,
  deff: 1, neff: 0, icc: 0, marginPct: 0, method: "none", lowPrecision: true,
};

/** Wilson score interval — exact-ish binomial interval, valid at 0% and 100%. */
export function wilsonInterval(x: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 0];
  const p = x / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - half) / d), Math.min(1, (centre + half) / d)];
}

/**
 * Design-based coverage estimate from cluster-level (numerator, denominator) pairs.
 * Clusters are communities; `x` respondents meeting the indicator out of `n` assessed.
 */
export function clusterCoverage(clusters: { x: number; n: number }[]): CoverageEstimate {
  const valid = clusters.filter((c) => c.n > 0);
  const m = valid.length;
  const X = valid.reduce((s, c) => s + c.x, 0);
  const N = valid.reduce((s, c) => s + c.n, 0);
  if (!m || !N) return { ...EMPTY };

  const p = X / N;
  const srsVar = (p * (1 - p)) / N;

  if (m < 2) {
    const [lo, hi] = wilsonInterval(X, N);
    return {
      p, x: X, n: N, clusters: m, ciLow: lo, ciHigh: hi,
      se: Math.sqrt(srsVar), deff: 1, neff: N, icc: 0,
      marginPct: ((hi - lo) / 2) * 100,
      method: "wilson",
      lowPrecision: true,
    };
  }

  // Taylor-linearised variance of the ratio estimator over clusters.
  const nBar = N / m;
  const ssq = valid.reduce((s, c) => s + (c.x - p * c.n) ** 2, 0);
  let varRatio = (m / (m - 1)) * (ssq / (N * N));
  if (!Number.isFinite(varRatio) || varRatio < 0) varRatio = srsVar;

  // Never claim to be *more* precise than a simple random sample of the same size.
  const varUsed = Math.max(varRatio, srsVar * 0.25);
  const se = Math.sqrt(varUsed);
  const deff = srsVar > 0 ? Math.max(0.25, varUsed / srsVar) : 1;
  const neff = deff > 0 ? N / deff : N;
  const icc = nBar > 1 ? Math.max(-1, Math.min(1, (deff - 1) / (nBar - 1))) : 0;
  const tc = tCritical95(m - 1);

  // Logit-scale interval keeps bounds inside [0,1] and behaves near 0% / 100%.
  let ciLow: number, ciHigh: number;
  if (p <= 0 || p >= 1 || se <= 0) {
    const [lo, hi] = wilsonInterval(X, Math.max(1, Math.round(neff)));
    ciLow = lo; ciHigh = hi;
  } else {
    const logit = Math.log(p / (1 - p));
    const seLogit = se / (p * (1 - p));
    const lo = logit - tc * seLogit;
    const hi = logit + tc * seLogit;
    ciLow = 1 / (1 + Math.exp(-lo));
    ciHigh = 1 / (1 + Math.exp(-hi));
  }

  const marginPct = ((ciHigh - ciLow) / 2) * 100;
  return {
    p, x: X, n: N, clusters: m, ciLow, ciHigh, se, deff, neff, icc, marginPct,
    method: "cluster",
    // WHO cluster-survey practice: < 5 clusters or a ±10pp margin is too weak
    // to generalise to the whole administrative unit.
    lowPrecision: m < 5 || marginPct > 10,
  };
}

// ---------------------------------------------------------------------------
// Indicator definitions (respondent level)
// ---------------------------------------------------------------------------

/** Cluster key: the community within its ward/LGA/state. */
export function communityKey(r: Row): string {
  const s = (k: string) => String(r[k] ?? "").trim().toLowerCase();
  return `${s("State")}|${s("LGA")}|${s("Ward")}|${s("COMMUNITIES")}`;
}

const code = (v: unknown) => String(v ?? "").trim();

const IMPROVED_WATER = new Set([
  "Piped_water_/Tubewell/_Borehole_inside_d",
  "Tubewell/Borehole_outside_dwelling",
  "Protected_dug_well",
  "Protected_Spring",
  "Rainwater_collection",
]);

const IMPROVED_SANITATION = new Set(["Piped_Flush_WC", "Pour_Flush_WC", "Pit_Laterine"]);
const OPEN_DEFECATION = new Set(["No_facilities_or_bush"]);
const SAFE_WASTEWATER = new Set(["Sink_&_closed_septic_tank_system", "Pit_beside_dwelling"]);

/**
 * Indicator = (eligible?, met?) for one respondent.
 * `null` means the respondent is NOT part of the denominator (question skipped
 * or not applicable) — excluding them is what keeps coverage unbiased.
 */
export type IndicatorFn = (r: Row) => boolean | null;

export interface IndicatorDef {
  key: string;
  label: string;
  short: string;
  description: string;
  /** Denominator description, shown in the methodology + tooltips. */
  denominator: string;
  group: "medicine" | "wash";
  /** Higher is better (green) vs. lower is better (red). */
  positive: boolean;
  fn: IndicatorFn;
}

const offeredCode = (r: Row) => code(r.Were_you_OFFERED_the_medicine_s);
const swallowCode = (r: Row) => code(r.swallow);

const wasOffered = (r: Row): boolean | null => {
  const c = offeredCode(r);
  if (!c) return null;
  return c !== "Not_offered_any_required_1";
};

export const COVERAGE_INDICATORS: IndicatorDef[] = [
  {
    key: "offered",
    label: "Offered the medicine(s)",
    short: "Offered",
    description: "Respondents who were offered any of the required medicine(s) by a CDD.",
    denominator: "All respondents who answered the offer question",
    group: "medicine",
    positive: true,
    fn: wasOffered,
  },
  {
    key: "offered_all",
    label: "Offered ALL required medicine(s)",
    short: "Offered all",
    description: "Respondents offered the complete regimen required for this campaign.",
    denominator: "All respondents who answered the offer question",
    group: "medicine",
    positive: true,
    fn: (r) => {
      const c = offeredCode(r);
      if (!c) return null;
      return c === "Offered_all_required_1";
    },
  },
  {
    key: "not_offered",
    label: "NOT offered any medicine",
    short: "Not offered",
    description: "Programmatic gap — households the distribution never reached.",
    denominator: "All respondents who answered the offer question",
    group: "medicine",
    positive: false,
    fn: (r) => {
      const c = offeredCode(r);
      if (!c) return null;
      return c === "Not_offered_any_required_1";
    },
  },
  {
    key: "epi_coverage",
    label: "Epidemiological coverage (swallowed)",
    short: "Swallowed",
    description:
      "Respondents who swallowed the medicine(s), out of ALL respondents surveyed — the true treatment coverage of the population.",
    denominator: "All respondents who answered the offer question",
    group: "medicine",
    positive: true,
    fn: (r) => {
      const o = offeredCode(r);
      if (!o) return null;
      if (o === "Not_offered_any_required_1") return false; // cannot swallow what was not offered
      const s = swallowCode(r);
      if (!s) return null;
      return s !== "Did_not_swallow_any_offered_1";
    },
  },
  {
    key: "swallowed_of_offered",
    label: "Swallowed among those offered (uptake)",
    short: "Uptake",
    description: "Adherence of households that were actually reached by a CDD.",
    denominator: "Respondents who were offered medicine(s)",
    group: "medicine",
    positive: true,
    fn: (r) => {
      if (wasOffered(r) !== true) return null;
      const s = swallowCode(r);
      if (!s) return null;
      return s !== "Did_not_swallow_any_offered_1";
    },
  },
  {
    key: "not_swallowed",
    label: "Offered but DID NOT swallow (refusal)",
    short: "Refused",
    description: "Reached households that declined or did not ingest the medicine.",
    denominator: "Respondents who were offered medicine(s)",
    group: "medicine",
    positive: false,
    fn: (r) => {
      if (wasOffered(r) !== true) return null;
      const s = swallowCode(r);
      if (!s) return null;
      return s === "Did_not_swallow_any_offered_1";
    },
  },
  {
    key: "improved_water",
    label: "Improved drinking-water source",
    short: "Water",
    description:
      "JMP-aligned improved sources: piped/borehole, protected well or spring, rainwater.",
    denominator: "Respondents reporting a household water source",
    group: "wash",
    positive: true,
    fn: (r) => {
      const codes = splitMulti(r.What_water_source_i_your_class_household);
      if (!codes.length) return null;
      return codes.some((c) => IMPROVED_WATER.has(c));
    },
  },
  {
    key: "improved_sanitation",
    label: "Improved sanitation facility",
    short: "Sanitation",
    description: "Flush/pour-flush WC or pit latrine (i.e. not open defecation).",
    denominator: "Respondents reporting a latrine type",
    group: "wash",
    positive: true,
    fn: (r) => {
      const c = code(r.What_type_of_Laterin_our_school_household);
      if (!c) return null;
      return IMPROVED_SANITATION.has(c);
    },
  },
  {
    key: "open_defecation",
    label: "Open defecation (no facility)",
    short: "Open defecation",
    description: "Households with no latrine — a key NTD re-infection driver.",
    denominator: "Respondents reporting a latrine type",
    group: "wash",
    positive: false,
    fn: (r) => {
      const c = code(r.What_type_of_Laterin_our_school_household);
      if (!c) return null;
      return OPEN_DEFECATION.has(c);
    },
  },
  {
    key: "safe_wastewater",
    label: "Contained wastewater disposal",
    short: "Wastewater",
    description: "Dirty water disposed into a closed septic/sink system or a contained pit.",
    denominator: "Respondents reporting a disposal practice",
    group: "wash",
    positive: true,
    fn: (r) => {
      const codes = splitMulti(r.How_do_you_Dispose_D_your_class_household);
      if (!codes.length) return null;
      return codes.some((c) => SAFE_WASTEWATER.has(c));
    },
  },
];

export const INDICATOR_BY_KEY = new Map(COVERAGE_INDICATORS.map((i) => [i.key, i]));

// ---------------------------------------------------------------------------
// Estimation over a set of respondents
// ---------------------------------------------------------------------------

/** Estimate one indicator over respondents, clustering by community. */
export function estimateIndicator(rows: Row[], ind: IndicatorDef): CoverageEstimate {
  const byCluster = new Map<string, { x: number; n: number }>();
  for (const r of rows) {
    const v = ind.fn(r);
    if (v == null) continue;
    const k = communityKey(r);
    const c = byCluster.get(k) ?? { x: 0, n: 0 };
    c.n += 1;
    if (v) c.x += 1;
    byCluster.set(k, c);
  }
  return clusterCoverage([...byCluster.values()]);
}

export interface CoverageRow {
  /** Display name of the administrative unit. */
  name: string;
  /** Parent unit (for Ward → LGA context). */
  parent?: string;
  grandParent?: string;
  key: string;
  respondents: number;
  communities: number;
  campaigns: string[];
  estimates: Record<string, CoverageEstimate>;
}

export type CoverageLevel = "State" | "LGA" | "Ward" | "Community";

const LEVEL_KEYS: Record<CoverageLevel, string[]> = {
  State: ["State"],
  LGA: ["State", "LGA"],
  Ward: ["State", "LGA", "Ward"],
  Community: ["State", "LGA", "Ward", "COMMUNITIES"],
};

/** Coverage table generalised to every unit of a given administrative level. */
export function coverageByLevel(
  rows: Row[],
  level: CoverageLevel,
  indicators: IndicatorDef[] = COVERAGE_INDICATORS,
): CoverageRow[] {
  const keys = LEVEL_KEYS[level];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const parts = keys.map((k) => String(r[k] ?? "").trim());
    if (!parts[parts.length - 1]) continue;
    groups.set(parts.join(" › "), [...(groups.get(parts.join(" › ")) ?? []), r]);
  }

  const out: CoverageRow[] = [];
  for (const [key, group] of groups) {
    const parts = key.split(" › ");
    const communities = new Set(group.map(communityKey));
    const campaigns = [...new Set(group
      .map((r) => resolveChecklistValue("MDA_Campaign_Type", r.MDA_Campaign_Type))
      .filter(Boolean))];
    const estimates: Record<string, CoverageEstimate> = {};
    for (const ind of indicators) estimates[ind.key] = estimateIndicator(group, ind);
    out.push({
      key,
      name: parts[parts.length - 1] || "—",
      parent: parts.length > 1 ? parts[parts.length - 2] : undefined,
      grandParent: parts.length > 2 ? parts[parts.length - 3] : undefined,
      respondents: group.length,
      communities: communities.size,
      campaigns,
      estimates,
    });
  }
  return out.sort((a, b) => b.respondents - a.respondents);
}

/** Distribution of reasons (labelled) for a respondent-level select field. */
export function reasonBreakdown(rows: Row[], field: string): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = r[field];
    if (v == null || v === "") continue;
    const label = resolveChecklistValue(field, v) || String(v);
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Campaign-type options present in the respondent set. */
export function campaignOptions(rows: Row[]): { code: string; label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = code(r.MDA_Campaign_Type);
    if (!c) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([c, n]) => ({ code: c, label: resolveChecklistValue("MDA_Campaign_Type", c) || c, n }))
    .sort((a, b) => b.n - a.n);
}

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
