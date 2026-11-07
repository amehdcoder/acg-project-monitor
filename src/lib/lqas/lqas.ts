// LQAS (Lot Quality Assurance Sampling) planning and decision rules.
// Configurable small-sample binomial classification, not a universal WHO
// disease-specific survey protocol or proof that a lot meets its target.

export type EuLevel = "state" | "lga" | "ward" | "flhf" | "community";
export const EU_LEVELS: { id: EuLevel; label: string }[] = [
  { id: "state", label: "State" },
  { id: "lga", label: "LGA" },
  { id: "ward", label: "Ward" },
  { id: "flhf", label: "Health facility (FLHF)" },
  { id: "community", label: "Community" },
];

export const DEFAULT_SAMPLE = 19;
export const INSECURE_CLEARANCE = new Set(["not_cleared", "partial", "unknown"]);

export interface PlanEntry {
  state: string; lga: string; ward: string; flhf_name: string; community_name: string;
  estimated_total_population?: number | null; number_of_households?: number | null;
  security_clearance?: string | null;
}

function logChoose(n: number, k: number) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}
export function binomCdf(k: number, n: number, p: number) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}

/** Decision rule d: a lot passes when covered >= d. Largest d with
 * P(covered < d | true coverage = target) <= alpha. n=19, 80% → 13. */
export function decisionRule(n: number, target: number, alpha = 0.1) {
  let d = 0;
  for (let k = 1; k <= n; k++) {
    if (binomCdf(k - 1, n, target) <= alpha) d = k; else break;
  }
  return d;
}

export type LotDecision = "pass" | "mop_up";
export function lotDecision(covered: number, sampled: number, target: number): LotDecision {
  return covered >= decisionRule(sampled, target) ? "pass" : "mop_up";
}

export const euKey = (e: Pick<PlanEntry, "state" | "lga" | "ward" | "flhf_name" | "community_name">, level: EuLevel) => {
  const parts = [e.state, e.lga, e.ward, e.flhf_name, e.community_name].map((v) => (v || "").trim().replace(/\s+/g, " ").toUpperCase());
  const depth = { state: 1, lga: 2, ward: 3, flhf: 4, community: 5 }[level];
  return parts.slice(0, depth).join(" › ");
};
export const euName = (key: string) => key.split(" › ").pop() || key;

/** Deterministic PRNG so a printed plan can be regenerated identically. */
export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SamplePoint { slot: number; community: string; ward: string; flhf: string; insecure: boolean }
export interface EuPlan {
  key: string; name: string; level: EuLevel; state: string; lga: string;
  population: number; households: number; communities: number;
  insecureCommunities: number; securityMode: boolean; sample: SamplePoint[];
  frameMissing: number;
}

/** Group microplan rows into Evaluation Units and select n sampling points per
 * EU by probability-proportional-to-size systematic sampling of communities. */
export function buildPlan(entries: PlanEntry[], level: EuLevel, n = DEFAULT_SAMPLE, seed = "lqas"): EuPlan[] {
  const groups = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    if (!e.state || !e.lga) continue;
    const k = euKey(e, level);
    const group = groups.get(k) ?? [];
    group.push(e); groups.set(k, group);
  }
  const plans: EuPlan[] = [];
  for (const [key, rows] of groups) {
    const weight = (r: PlanEntry) => Math.max(0, Number(r.estimated_total_population) || 0);
    const frameMissing = rows.filter((r) => !r.community_name?.trim() || weight(r) <= 0).length;
    const total = rows.reduce((s, r) => s + weight(r), 0);
    const rand = seededRandom(`${seed}|${key}`);
    const interval = total / n;
    const start = rand() * interval;
    const sorted = [...rows].sort((a, b) => (a.ward + a.community_name).localeCompare(b.ward + b.community_name));
    const sample: SamplePoint[] = [];
    let cum = 0, idx = 0;
    for (let i = 0; i < n && !frameMissing && total > 0; i++) {
      const target = start + i * interval;
      while (idx < sorted.length - 1 && cum + weight(sorted[idx]) <= target) { cum += weight(sorted[idx]); idx++; }
      const r = sorted[idx];
      sample.push({ slot: i + 1, community: r.community_name, ward: r.ward, flhf: r.flhf_name, insecure: INSECURE_CLEARANCE.has(String(r.security_clearance || "")) });
    }
    const insecure = rows.filter((r) => INSECURE_CLEARANCE.has(String(r.security_clearance || ""))).length;
    plans.push({
      key, name: euName(key), level, state: rows[0].state, lga: rows[0].lga,
      population: rows.reduce((s, r) => s + (Number(r.estimated_total_population) || 0), 0),
      households: rows.reduce((s, r) => s + (Number(r.number_of_households) || 0), 0),
      communities: rows.length, insecureCommunities: insecure,
      securityMode: insecure > 0, sample, frameMissing,
    });
  }
  return plans.sort((a, b) => a.key.localeCompare(b.key));
}

export interface LotResult { eu_name: string; eu_level: string; state?: string | null; lga?: string | null; sampled: number; covered: number; population?: number }
export interface RegionCoverage { coverage: number; lower: number; upper: number; lots: number; passed: number; mopUp: number }

/** Population-weighted coverage across lots (stratified estimator) with a
 * normal-approximation 95% CI, as used for LQAS aggregation. */
export function aggregateCoverage(lots: LotResult[], target: number): RegionCoverage {
  if (!lots.length) return { coverage: 0, lower: 0, upper: 0, lots: 0, passed: 0, mopUp: 0 };
  const w = lots.map((l) => Math.max(1, l.population || 1));
  const W = w.reduce((a, b) => a + b, 0);
  let p = 0, v = 0;
  lots.forEach((l, i) => {
    const pi = l.covered / l.sampled, wi = w[i] / W;
    p += wi * pi;
    v += wi * wi * (pi * (1 - pi)) / Math.max(1, l.sampled - 1);
  });
  const se = Math.sqrt(v);
  const passed = lots.filter((l) => lotDecision(l.covered, l.sampled, target) === "pass").length;
  return { coverage: p, lower: Math.max(0, p - 1.96 * se), upper: Math.min(1, p + 1.96 * se), lots: lots.length, passed, mopUp: lots.length - passed };
}
