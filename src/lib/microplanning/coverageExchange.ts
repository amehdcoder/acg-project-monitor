export interface ExchangeEntry {
  id: string; state: string; lga: string; ward: string; flhf_name: string;
  community_name: string; settlement_name: string | null;
  total_treated?: number | null; total_households_reported?: number | null;
  total_households_treated?: number | null; medicine_used?: number | null;
  medicine_returns?: MedicineReturn[] | null;
  estimated_total_population?: number | null;
  year_of_microplanning?: number | null;
  coverage_target_population?: number | null;
}
export interface MedicineReturn { name: string; unit: string; used: number; returned: number; damaged: number; received?: number; lost?: number; expired?: number }
export interface MedicineStock { received?: number; used?: number; lost?: number; expired?: number; returned?: number }
export interface ExchangeRow {
  row: number; entryId: string; state: string; lga: string; ward: string; flhf: string;
  community: string; settlement: string; treated?: number; households?: number;
  treatedHouseholds?: number; medicineUsed?: number; medicines: MedicineReturn[];
  population?: number; targetPopulation?: number; errors: string[];
  year?: number; stock?: MedicineStock;
}
const validQuantity = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
export function stockTotal(stock: MedicineStock): number | undefined {
  const quantities = [stock.used, stock.lost, stock.expired, stock.returned];
  if (!quantities.every(validQuantity)) return undefined;
  const total = quantities.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  return validQuantity(total) ? total : undefined;
}
export function canAlignStock(row: ExchangeRow) {
  return !!row.stock && stockTotal(row.stock) !== undefined && row.stock.received !== stockTotal(row.stock);
}
export function alignStock(row: ExchangeRow): ExchangeRow {
  if (!row.stock) return row;
  const received = stockTotal(row.stock);
  if (received === undefined) return row;
  return { ...row, stock: { ...row.stock, received } };
}
export function medicineAccounted(m: MedicineReturn) { return m.returned + (m.lost !== undefined || m.expired !== undefined ? (m.lost ?? 0) + (m.expired ?? 0) : m.damaged); }
export function medicineReceived(medicines: MedicineReturn[]): number | undefined {
  return medicines.length && medicines.every(m => m.received !== undefined) ? medicines.reduce((sum, m) => sum + (m.received ?? 0), 0) : undefined;
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
  const geography = [...buckets.entries()].map(([key, rows]) => ({ key, rows, state: normalizePlace(rows[0]?.state), lga: normalizePlace(rows[0]?.lga), ward: normalizePlace(rows[0]?.ward) }));
  const candidatesByGeo = new Map<string, { entry: ExchangeEntry; lga: number; ward: number }[]>();
  return (row: ExchangeRow): MatchResult => {
    if (row.entryId) {
      const e = byId.get(row.entryId);
      // IDs outside the current authorized source never fall back to fuzzy writes.
      if (!e || geo(e) !== geo(row) || normalizePlace(e.community_name) !== normalizePlace(row.community) || normalizePlace(e.settlement_name) !== normalizePlace(row.settlement)) return {status: "review", score: 0, candidates: []};
      return {status: "exact", id: e.id, score: 1, candidates: [{id: e.id, score: 1}]};
    }
    const geographicKey = geo(row);
    let scoped = candidatesByGeo.get(geographicKey);
    if (!scoped) {
      const state = normalizePlace(row.state), lga = normalizePlace(row.lga), ward = normalizePlace(row.ward);
      // Never search another State or accept weak geography as a name match.
      scoped = geography.filter(group => group.state === state).flatMap(group => {
        const lgaScore = similar(lga, group.lga), wardScore = similar(ward, group.ward);
        return lgaScore >= .65 && wardScore >= .65 ? group.rows.map(entry => ({ entry, lga: lgaScore, ward: wardScore })) : [];
      });
      candidatesByGeo.set(geographicKey, scoped);
    }
    const ranked = scoped.map(({ entry: e, lga, ward }) => {
      const community = similar(normalizePlace(row.community), normalizePlace(e.community_name));
      const settlement = similar(normalizePlace(row.settlement), normalizePlace(e.settlement_name));
      const facility = row.flhf ? similar(normalizePlace(row.flhf), normalizePlace(e.flhf_name)) : 1;
      const names = community * .7 + settlement * .2 + facility * .1;
      const score = names * .8 + lga * .1 + ward * .1;
      // Community and settlement identity cannot be outweighed by matching geography.
      const eligible = community >= .65 && (!row.settlement || settlement >= .65);
      const automatic = lga >= .8 && ward >= .8 && community >= .8 && (!row.flhf || facility >= .8);
      return {id: e.id, score: eligible ? score : 0, automatic};
    }).filter(c => c.score >= .55).sort((a,b) => b.score - a.score).slice(0,5);
    const first = ranked[0];
    if (!first) return {status: "unmatched", score: 0, candidates: []};
    const unique = first.score - (ranked[1]?.score ?? 0) >= .08;
    const status = first.score === 1 && unique ? "exact" : first.score >= .90 && unique && first.automatic ? "fuzzy" : "review";
    return {status, id: status === "review" ? undefined : first.id, score: first.score, candidates: ranked.map(({id,score}) => ({id,score}))};
  };
}
export function validateCoverageRow(row: ExchangeRow) {
  const errors = [...row.errors];
  if (!row.state || !row.lga || !row.ward || !row.community) errors.push("State, LGA, Ward and Community are required.");
  for (const [label, n] of [["Total Treated",row.treated],["Total HHs",row.households],["Treated HHs",row.treatedHouseholds],["Medicine Used",row.medicineUsed],["Population",row.population],["Target Population",row.targetPopulation]] as const) {
    if (n !== undefined && (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)) errors.push(`${label} must be a non-negative whole number.`);
  }
  if (row.households !== undefined && row.treatedHouseholds !== undefined && row.treatedHouseholds > row.households) errors.push("Treated HHs cannot exceed Total HHs.");
  if (row.population !== undefined && row.treated !== undefined && row.treated > row.population) errors.push("Total Treated cannot exceed Total Population.");
  if (row.targetPopulation !== undefined && row.treated !== undefined && row.treated > row.targetPopulation) errors.push("Total Treated cannot exceed Target Population.");
  if (row.targetPopulation !== undefined && row.population !== undefined && row.targetPopulation > row.population) errors.push("Target Population cannot exceed Total Population.");
  if (row.year !== undefined && (!Number.isSafeInteger(row.year) || row.year < 1900 || row.year > 2100)) errors.push("Year of Microplanning must be a whole year between 1900 and 2100.");
  if (row.stock) {
    if (row.medicines.length || row.medicineUsed !== undefined) errors.push("Use either the five quantity columns or the legacy medicine columns, not both.");
    for (const [key, label] of [["received", "Quantity Received"], ["used", "Quantity Used"], ["lost", "Quantity Lost"], ["expired", "Quantity Expired"], ["returned", "Quantity Returned to FLHF"]] as const) {
      if (!validQuantity(row.stock[key])) errors.push(`${label} must be supplied as a non-negative whole number (use 0 for none).`);
    }
    const total = stockTotal(row.stock);
    if (total === undefined && [row.stock.used,row.stock.lost,row.stock.expired,row.stock.returned].every(validQuantity)) errors.push("The combined medicine quantities exceed the supported whole-number limit.");
    if (total !== undefined && row.stock.received !== total) errors.push("Quantity Received must equal Quantity Used + Quantity Lost + Quantity Expired + Quantity Returned to FLHF.");
  }
  row.medicines.forEach(m => {
    if (!m.name || !m.unit) errors.push("Medicine name and dispensing unit are required.");
    if ([m.used,m.returned,m.damaged].some(n => !Number.isSafeInteger(n) || n < 0 || n > 2147483647)) errors.push("Medicine quantities must be non-negative whole numbers.");
  });
  if (row.medicines.length && row.medicineUsed !== undefined && row.medicines.reduce((s,m) => s+m.used,0) !== row.medicineUsed) errors.push("Medicine Used must equal the sum of medicine-specific quantities used.");
  return [...new Set(errors)];
}
export function coverageTargetPopulation(entry: ExchangeEntry, derivedTarget: number): number {
  return validQuantity(entry.coverage_target_population) ? entry.coverage_target_population : derivedTarget;
}
export function coveragePatch(row: ExchangeRow, existing?: ExchangeEntry, derivedTarget?: number): Record<string, unknown> {
  const errors = validateCoverageRow(row);
  if (row.treatedHouseholds !== undefined && row.treatedHouseholds > (row.households ?? existing?.total_households_reported ?? Infinity)) errors.push("Treated HHs exceed the saved Total HHs.");
  if (row.households !== undefined && (row.treatedHouseholds ?? existing?.total_households_treated ?? 0) > row.households) errors.push("Total HHs are below saved Treated HHs.");
  if (row.treated !== undefined && existing?.estimated_total_population != null && existing.estimated_total_population > 0 && row.treated > existing.estimated_total_population) errors.push("Total Treated exceeds the saved Total Population.");
  const effectiveTarget = row.targetPopulation ?? existing?.coverage_target_population;
  if (effectiveTarget != null && (row.treated ?? existing?.total_treated ?? 0) > effectiveTarget) errors.push("Total Treated exceeds the supplied or saved Target Population.");
  if (row.targetPopulation !== undefined && existing?.estimated_total_population != null && row.targetPopulation > existing.estimated_total_population) errors.push("Target Population exceeds the saved Total Population.");
  if (errors.length) throw new Error(errors.join(" "));
  const patch: Record<string, unknown> = {};
  // An untouched prefilled target remains derived; manually added/changed targets are explicit Coverage denominators.
  if (row.targetPopulation !== undefined && (!row.entryId || !existing || derivedTarget !== undefined && row.targetPopulation !== derivedTarget)) patch.coverage_target_population = row.targetPopulation;
  if (row.treated !== undefined) patch.total_treated = row.treated;
  if (row.households !== undefined) patch.total_households_reported = row.households;
  if (row.treatedHouseholds !== undefined) patch.total_households_treated = row.treatedHouseholds;
  if (row.medicineUsed !== undefined || row.medicines.length) patch.medicine_used = row.medicineUsed ?? row.medicines.reduce((s,m) => s+m.used,0);
  if (row.medicines.length) patch.medicine_returns = row.medicines;
  if (row.stock) {
    patch.medicine_used = row.stock.used;
    patch.medicine_returns = [{ name: "Reported medicine quantities", unit: "units", received: row.stock.received, used: row.stock.used, lost: row.stock.lost, expired: row.stock.expired, returned: row.stock.returned, damaged: (row.stock.lost ?? 0) + (row.stock.expired ?? 0) }];
    patch.medicine_reversed_to = "FLHF";
  }
  return patch;
}
export interface SavedAllocation { id: string; lga: string; ward?: string | null; flhf?: string | null; amount: number; jrsm_target?: number | null; medicine_name?: string | null; year?: number; community_snapshot?: unknown }
export function mergeAllocationPlan<T extends {id?: string; lga: string; ward?: string; flhf?: string; amount: string}>(saved: T[], uploaded: T[]): T[] {
  const key = (r: T) => [r.lga,r.ward,r.flhf].map(normalizePlace).join("|");
  const merged = new Map(saved.map(r => [key(r),r]));
  uploaded.forEach(r => { const old = merged.get(key(r)); merged.set(key(r), {...old,...r,id: old?.id}); });
  return [...merged.values()];
}