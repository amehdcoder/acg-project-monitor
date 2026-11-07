import { sampleCorrelation } from "simple-statistics";
import { measuredNumber, planningDistance, type AnalysisEntry } from "./planningAnalysis";

export type CorrelationMethod = "spearman" | "pearson";
export interface CorrelationMetric { id: string; label: string; value: (e: AnalysisEntry) => number | null }
const field = (id: string, label: string): CorrelationMetric => ({ id, label, value: e => measuredNumber(e[id]) });
const knownBinary = (value: unknown, positive: string[], negative: string[]) => {
  const s = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return positive.includes(s) ? 1 : negative.includes(s) ? 0 : null;
};
const distance: CorrelationMetric = { id: "distance", label: "FLHF distance (km)", value: e => planningDistance(e)?.km ?? null };
export const CORRELATION_GROUPS: { id: string; label: string; metrics: CorrelationMetric[] }[] = [
  { id: "population", label: "Population & household relationships", metrics: [field("estimated_total_population", "Total population"), field("number_of_households", "Households"), field("estimated_children_0_4", "Children 0–4"), field("estimated_children_5_14", "Children 5–14"), field("estimated_adults_15_plus", "Adults 15+"), distance] },
  { id: "operations", label: "Operational constraints & workload", metrics: [field("estimated_total_population", "Total population"), field("number_of_households", "Households"), distance,
    { id: "access_constraint", label: "Access constraint (0/1)", value: e => knownBinary(e.accessibility, ["seasonal", "hard_to_reach", "inaccessible"], ["accessible"]) },
    { id: "security_constraint", label: "Security constraint (0/1)", value: e => knownBinary(e.security_clearance, ["partial", "not_cleared"], ["cleared"]) },
    { id: "cdd_mentions", label: "Recorded CDD names", value: e => { const raw = String(e.cdd_names ?? "").trim(); return raw ? new Set(raw.split(/[,;\n/]+|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean)).size : null; } },
  ] },
];
export function tiedRanks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a,b) => a.v - b.v), result = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1; while (j < order.length && order[j].v === order[i].v) j++;
    const rank = (i + 1 + j) / 2; for (let k = i; k < j; k++) result[order[k].i] = rank; i = j;
  }
  return result;
}
export interface CorrelationResult { value: number | null; n: number; reason: string | null; points: { x: number; y: number }[] }
export function correlatePairs(points: { x: number; y: number }[], method: CorrelationMethod): CorrelationResult {
  const usable = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)), n = usable.length;
  if (n < 5) return { value: null, n, reason: "Fewer than 5 complete paired records", points: usable };
  const x = usable.map(p => p.x), y = usable.map(p => p.y);
  if (x.every(v => v === x[0]) || y.every(v => v === y[0])) return { value: null, n, reason: "No variation in one or both measures", points: usable };
  const value = sampleCorrelation(method === "spearman" ? tiedRanks(x) : x, method === "spearman" ? tiedRanks(y) : y);
  return { value: Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : null, n, reason: Number.isFinite(value) ? null : "Not computable", points: usable };
}
export function correlationMatrix(entries: AnalysisEntry[], metrics: CorrelationMetric[], method: CorrelationMethod) {
  const columns = metrics.map(m => entries.map(e => m.value(e)));
  return metrics.map((_,i) => metrics.map((__,j) => correlatePairs(entries.flatMap((___,k) => {
    const x = columns[i][k], y = columns[j][k]; return x == null || y == null ? [] : [{ x, y }];
  }), method)));
}