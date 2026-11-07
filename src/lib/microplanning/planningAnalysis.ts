import { entryPoint, type HeatEntry } from "./heatmaps";
import { haversineKm } from "./distance";

export type AnalysisEntry = HeatEntry & {
  id?: string; flhf_name?: string | null; settlement_name?: string | null;
  cdd_names?: string | null; flhf_latitude?: number | null; flhf_longitude?: number | null;
  community_distance_to_flhf_km?: number | null; settlement_distance_to_flhf_km?: number | null;
  [key: string]: unknown;
};
export const ACCESS = ["accessible", "seasonal", "hard_to_reach", "inaccessible", "unknown"];
export const SECURITY = ["cleared", "partial", "not_cleared", "unknown"];
export const analysisLabels: Record<string, string> = { accessible: "Accessible", seasonal: "Seasonal", hard_to_reach: "Hard to reach", inaccessible: "Inaccessible", unknown: "Not recorded / unknown", cleared: "Cleared", partial: "Partially cleared", not_cleared: "Not cleared" };
export function measuredNumber(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const status = (v: unknown, keys: string[]) => {
  const s = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return keys.includes(s) ? s : "unknown";
};
const roster = (e: AnalysisEntry) => new Set(String(e.cdd_names ?? "").split(/[,;\n/]+|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean)).size;
/** Corrected settlement GPS → facility straight-line distance; otherwise recorded distance. */
export function planningDistance(e: AnalysisEntry): { km: number; source: "GPS straight-line" | "Recorded" } | null {
  const p = entryPoint(e), lat = measuredNumber(e.flhf_latitude), lng = measuredNumber(e.flhf_longitude);
  if (p && lat != null && lng != null && lat >= 4 && lat <= 14 && lng >= 2.6 && lng <= 14.8) return { km: haversineKm(p[0], p[1], lat, lng), source: "GPS straight-line" };
  const km = measuredNumber(e.community_distance_to_flhf_km) ?? measuredNumber(e.settlement_distance_to_flhf_km);
  return km == null ? null : { km, source: "Recorded" };
}
export function analysePlanning(rows: AnalysisEntry[], target: (row: AnalysisEntry) => number) {
  const matrix = ACCESS.map(access => ({ access, cells: SECURITY.map(security => ({ security, records: 0, population: 0, target: 0, missingPopulation: 0 })) }));
  const distance = ["0–5 km", ">5–10 km", ">10–15 km", ">15 km", "Not available"].map(label => ({ label, records: 0, population: 0, target: 0, gps: 0 }));
  const facilities = new Map<string, { key: string; state: string; lga: string; ward: string; name: string; records: number; population: number; target: number; households: number; rosterMentions: number; noRoster: number; exposed: number; distanceTotal: number; distanceCount: number }>();
  let population = 0, eligible = 0, exposedPopulation = 0, exposedRecords = 0, unknownConditions = 0;
  let missingPopulation = 0, missingTarget = 0, missingHouseholds = 0, missingGps = 0, unassigned = 0, noRoster = 0;
  const actions: { key: string; name: string; geography: string; population: number | null; target: number; reasons: string[]; distance: ReturnType<typeof planningDistance> }[] = [];
  for (const [i, e] of rows.entries()) {
    const pop = measuredNumber(e.estimated_total_population), hh = measuredNumber(e.number_of_households);
    const t = target(e), safeTarget = Number.isFinite(t) && t >= 0 ? t : 0;
    const a = status(e.accessibility, ACCESS), s = status(e.security_clearance, SECURITY);
    const exposed = ["seasonal", "hard_to_reach", "inaccessible"].includes(a) || ["partial", "not_cleared"].includes(s);
    const cell = matrix.find(m => m.access === a)?.cells.find(c => c.security === s);
    if (cell) { cell.records++; cell.population += pop ?? 0; cell.target += safeTarget; cell.missingPopulation += pop == null ? 1 : 0; }
    population += pop ?? 0; eligible += safeTarget;
    if (exposed) { exposedRecords++; exposedPopulation += pop ?? 0; }
    if (a === "unknown" || s === "unknown") unknownConditions++;
    if (pop == null) missingPopulation++;
    if (hh == null) missingHouseholds++;
    if (!entryPoint(e)) missingGps++;
    if (safeTarget === 0) missingTarget++;
    const name = String(e.flhf_name ?? "").trim(), count = roster(e);
    if (!name) unassigned++;
    if (!count) noRoster++;
    const d = planningDistance(e), bucket = distance[d == null ? 4 : d.km <= 5 ? 0 : d.km <= 10 ? 1 : d.km <= 15 ? 2 : 3];
    bucket.records++; bucket.population += pop ?? 0; bucket.target += safeTarget; bucket.gps += d?.source === "GPS straight-line" ? 1 : 0;
    const geo = [e.state, e.lga, e.ward].map(v => String(v ?? "").trim());
    const key = JSON.stringify([...geo, name].map(v => v.toUpperCase()));
    const f = facilities.get(key) ?? { key, state: geo[0], lga: geo[1], ward: geo[2], name: name || "Unassigned", records: 0, population: 0, target: 0, households: 0, rosterMentions: 0, noRoster: 0, exposed: 0, distanceTotal: 0, distanceCount: 0 };
    f.records++; f.population += pop ?? 0; f.target += safeTarget; f.households += hh ?? 0; f.rosterMentions += count; f.noRoster += count ? 0 : 1; f.exposed += exposed ? 1 : 0;
    if (d) { f.distanceTotal += d.km; f.distanceCount++; } facilities.set(key, f);
    const reasons = [exposed ? "Access / security constraint" : "", a === "unknown" || s === "unknown" ? "Verify access / security" : "", !name ? "Assign FLHF" : "", !count ? "Confirm CDD roster" : "", !entryPoint(e) ? "Capture GPS" : "", pop == null ? "Confirm population" : "", hh == null ? "Confirm households" : ""].filter(Boolean);
    if (reasons.length) actions.push({ key: e.id ?? String(i), name: String(e.community_name || e.settlement_name || "Unnamed record"), geography: geo.filter(Boolean).join(" · "), population: pop, target: safeTarget, reasons, distance: d });
  }
  return { matrix, distance, facilities: [...facilities.values()].sort((a, b) => b.target - a.target), actions: actions.sort((a, b) => b.reasons.length - a.reasons.length || b.target - a.target), population, eligible, exposedPopulation, exposedRecords, unknownConditions, missingPopulation, missingTarget, missingHouseholds, missingGps, unassigned, noRoster, records: rows.length };
}