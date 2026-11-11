export interface ExchangeEntry {
  id: string; state: string; lga: string; ward: string; flhf_name: string;
  community_name: string; settlement_name: string | null;
  total_treated?: number | null; total_households_reported?: number | null;
  total_households_treated?: number | null; medicine_used?: number | null;
  medicine_returns?: MedicineReturn[] | null;
  estimated_total_population?: number | null;
}
export interface MedicineReturn { name: string; unit: string; used: number; returned: number; damaged: number }
export interface ExchangeRow {
  row: number; entryId: string; state: string; lga: string; ward: string; flhf: string;
  community: string; settlement: string; treated?: number; households?: number;
  treatedHouseholds?: number; medicineUsed?: number; medicines: MedicineReturn[];
  population?: number; errors: string[];
}
export interface MatchResult { status: "exact" | "fuzzy" | "review" | "unmatched"; id?: string; score: number; candidates: { id: string; score: number }[] }
export const normalizePlace = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(ward|district)\b/g, "").replace(/[^a-z0-9]/g, "");
const similar = (a: string, b: string) => {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const pairs = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
  const x = pairs(a), y = pairs(b); let common = 0;
  x.forEach((v, k) => { common += Math.min(v, y.get(k) ?? 0); });
  return (2 * common) / Math.max(1, a.length + b.length - 2);
};
export function createCoverageMatcher(entries: ExchangeEntry[]) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const buckets = new Map<string, ExchangeEntry[]>();
  const geo = (e: {state: string; lga: string; ward: string}) => [e.state, e.lga, e.ward].map(normalizePlace).join("|");
  entries.forEach(e => { const k = geo(e); const list = buckets.get(k) ?? []; list.push(e); buckets.set(k, list); });
  return (row: ExchangeRow): MatchResult => {
    if (row.entryId) {
      const e = byId.get(row.entryId);
      // IDs outside the current authorized source never fall back to fuzzy writes.
      if (!e || geo(e) !== geo(row) || normalizePlace(e.community_name) !== normalizePlace(row.community) || normalizePlace(e.settlement_name) !== normalizePlace(row.settlement)) return {status: "review", score: 0, candidates: []};
      return {status: "exact", id: e.id, score: 1, candidates: [{id: e.id, score: 1}]};
    }
    const ranked = (buckets.get(geo(row)) ?? []).map(e => {
      const community = similar(normalizePlace(row.community), normalizePlace(e.community_name));
      const settlement = similar(normalizePlace(row.settlement), normalizePlace(e.settlement_name));
      const facility = row.flhf ? similar(normalizePlace(row.flhf), normalizePlace(e.flhf_name)) : 1;
      const score = community * .7 + settlement * .2 + facility * .1;
      return {id: e.id, score};
    }).filter(c => c.score >= .55).sort((a,b) => b.score - a.score).slice(0,5);
    const first = ranked[0];
    if (!first) return {status: "unmatched", score: 0, candidates: []};
    const unique = first.score - (ranked[1]?.score ?? 0) >= .08;
    const status = first.score === 1 && unique ? "exact" : first.score >= .92 && unique ? "fuzzy" : "review";
    return {status, id: status === "review" ? undefined : first.id, score: first.score, candidates: ranked};
  };
}
export function validateCoverageRow(row: ExchangeRow) {
  const errors = [...row.errors];
  if (!row.state || !row.lga || !row.ward || !row.community) errors.push("State, LGA, Ward and Community are required.");
  for (const [label, n] of [["Total Treated",row.treated],["Total HHs",row.households],["Treated HHs",row.treatedHouseholds],["Medicine Used",row.medicineUsed],["Population",row.population]] as const) {
    if (n !== undefined && (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)) errors.push(`${label} must be a non-negative whole number.`);
  }
  if (row.households !== undefined && row.treatedHouseholds !== undefined && row.treatedHouseholds > row.households) errors.push("Treated HHs cannot exceed Total HHs.");
  row.medicines.forEach(m => {
    if (!m.name || !m.unit) errors.push("Medicine name and dispensing unit are required.");
    if ([m.used,m.returned,m.damaged].some(n => !Number.isSafeInteger(n) || n < 0 || n > 2147483647)) errors.push("Medicine quantities must be non-negative whole numbers.");
  });
  if (row.medicines.length && row.medicineUsed !== undefined && row.medicines.reduce((s,m) => s+m.used,0) !== row.medicineUsed) errors.push("Medicine Used must equal the sum of medicine-specific quantities used.");
  return [...new Set(errors)];
}
export function coveragePatch(row: ExchangeRow, existing?: ExchangeEntry): Record<string, unknown> {
  const errors = validateCoverageRow(row);
  if (row.treatedHouseholds !== undefined && row.treatedHouseholds > (row.households ?? existing?.total_households_reported ?? Infinity)) errors.push("Treated HHs exceed the saved Total HHs.");
  if (row.households !== undefined && (row.treatedHouseholds ?? existing?.total_households_treated ?? 0) > row.households) errors.push("Total HHs are below saved Treated HHs.");
  if (errors.length) throw new Error(errors.join(" "));
  const patch: Record<string, unknown> = {};
  if (row.treated !== undefined) patch.total_treated = row.treated;
  if (row.households !== undefined) patch.total_households_reported = row.households;
  if (row.treatedHouseholds !== undefined) patch.total_households_treated = row.treatedHouseholds;
  if (row.medicineUsed !== undefined || row.medicines.length) patch.medicine_used = row.medicineUsed ?? row.medicines.reduce((s,m) => s+m.used,0);
  if (row.medicines.length) patch.medicine_returns = row.medicines;
  return patch;
}
export interface SavedAllocation { id: string; lga: string; ward?: string | null; flhf?: string | null; amount: number; jrsm_target?: number | null; medicine_name?: string | null; year?: number; community_snapshot?: unknown }
export function mergeAllocationPlan<T extends {id?: string; lga: string; ward?: string; flhf?: string; amount: string}>(saved: T[], uploaded: T[]): T[] {
  const key = (r: T) => [r.lga,r.ward,r.flhf].map(normalizePlace).join("|");
  const merged = new Map(saved.map(r => [key(r),r]));
  uploaded.forEach(r => { const old = merged.get(key(r)); merged.set(key(r), {...old,...r,id: old?.id}); });
  return [...merged.values()];
}