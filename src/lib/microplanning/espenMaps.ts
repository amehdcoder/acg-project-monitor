// Additional ESPEN / Crosscut Geospatial Microplanner thematic maps that the
// Geo Microplanning records can genuinely produce. Each map classes a
// settlement landblock by one measured value; missing data stays grey and is
// never estimated.
import type { HeatEntry } from "./heatmaps";

export type EspenEntry = HeatEntry & {
  flhf_name?: string | null;
  community_distance_to_flhf_km?: number | null; settlement_distance_to_flhf_km?: number | null;
  estimated_children_0_4?: number | null; estimated_children_5_14?: number | null; estimated_adults_15_plus?: number | null;
  households_treated?: number | null; total_households_reported?: number | null;
  cdd_names?: string | null; pwd_total?: number | null; medicine_used?: number | null;
};

export interface EspenMap {
  id: string; title: string; description: string; legendTitle: string;
  breaks: number[]; // ascending class upper limits; classes = breaks.length + 1
  colors: string[];
  labels: string[];
  value: (e: EspenEntry, areaKm2: number) => number | null;
  fmt: (v: number) => string;
}

export const NO_DATA = "#C3C9CF";
const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const perKm2 = (v: number | null, a: number) => (v == null || a <= 0 ? null : v / a);
const int = (v: number) => Math.round(v).toLocaleString();

export const cddCount = (e: EspenEntry) => String(e.cdd_names ?? "").split(/[,;\n/]+|\band\b/i).map((s) => s.trim()).filter(Boolean).length;
export const distanceToFacility = (e: EspenEntry) => n(e.community_distance_to_flhf_km) ?? n(e.settlement_distance_to_flhf_km);

export const ESPEN_MAPS: EspenMap[] = [
  { id: "distance", title: "Distance to health facility", description: "Recorded distance from each settlement to its first-level health facility (FLHF).", legendTitle: "Distance to FLHF (km)",
    breaks: [5, 10, 15], colors: ["#2E7D32", "#B5D86A", "#F2A900", "#B71C1C"], labels: ["< 5 km", "5 – 10 km", "10 – 15 km", "15 km +"],
    value: (e) => distanceToFacility(e), fmt: (v) => `${v.toFixed(1)} km` },
  { id: "under5", title: "Children under 5 density", description: "Estimated children 0–4 years per km² of landblock.", legendTitle: "Children 0–4 / km²",
    breaks: [10, 40], colors: ["#DCEEF8", "#5BBDE8", "#0B5E91"], labels: ["< 10", "10 – 40", "40 +"],
    value: (e, a) => perKm2(n(e.estimated_children_0_4), a), fmt: (v) => `${int(v)} / km²` },
  { id: "school", title: "School-age children density", description: "Estimated children 5–14 years (MDA school-age target) per km².", legendTitle: "Children 5–14 / km²",
    breaks: [15, 60], colors: ["#E6F2DA", "#8CC56A", "#2E6B1F"], labels: ["< 15", "15 – 60", "60 +"],
    value: (e, a) => perKm2(n(e.estimated_children_5_14), a), fmt: (v) => `${int(v)} / km²` },
  { id: "adults", title: "Adult population density", description: "Estimated adults 15+ per km².", legendTitle: "Adults 15+ / km²",
    breaks: [20, 80], colors: ["#F1E4F3", "#B57BC1", "#5E2A6E"], labels: ["< 20", "20 – 80", "80 +"],
    value: (e, a) => perKm2(n(e.estimated_adults_15_plus), a), fmt: (v) => `${int(v)} / km²` },
  { id: "households", title: "Household density", description: "Households per km² — drives house-to-house team workload.", legendTitle: "Households / km²",
    breaks: [5, 20], colors: ["#FBE7D3", "#F0A35E", "#A0480F"], labels: ["< 5", "5 – 20", "20 +"],
    value: (e, a) => perKm2(n(e.number_of_households) ?? n(e.total_households_reported), a), fmt: (v) => `${int(v)} / km²` },
  { id: "cdd", title: "CDD workload", description: "Population per community drug distributor (CDD) named for the settlement.", legendTitle: "Population per CDD",
    breaks: [250, 500, 1000], colors: ["#2E7D32", "#B5D86A", "#F2A900", "#B71C1C"], labels: ["< 250", "250 – 500", "500 – 1,000", "1,000 + / no CDD"],
    value: (e) => { const p = n(e.estimated_total_population); if (p == null || p <= 0) return null; const c = cddCount(e); return c ? p / c : Infinity; }, fmt: (v) => (Number.isFinite(v) ? `${int(v)} people / CDD` : "No CDD named") },
  { id: "coverage", title: "Household treatment coverage", description: "Households treated ÷ households recorded (WHO 80% programme target).", legendTitle: "Households treated (%)",
    breaks: [65, 80], colors: ["#B71C1C", "#F2A900", "#2E7D32"], labels: ["< 65%", "65 – 79%", "80% +"],
    value: (e) => { const t = n(e.households_treated), h = n(e.number_of_households) ?? n(e.total_households_reported); return t == null || !h ? null : Math.min(100, (t / h) * 100); }, fmt: (v) => `${v.toFixed(0)}%` },
  { id: "pwd", title: "Persons with disabilities", description: "Persons with disabilities recorded per 1,000 population — plan inclusive delivery.", legendTitle: "PWD per 1,000",
    breaks: [5, 20], colors: ["#E3ECF7", "#6E9BD1", "#1F4E8C"], labels: ["< 5", "5 – 20", "20 +"],
    value: (e) => { const d = n(e.pwd_total), p = n(e.estimated_total_population); return d == null || !p ? null : (d / p) * 1000; }, fmt: (v) => `${v.toFixed(1)} / 1,000` },
  { id: "hard", title: "Hard-to-reach composite", description: "Count of barriers: hard/inaccessible access, not-cleared security, difficult terrain, FLHF over 10 km.", legendTitle: "Barriers present",
    breaks: [0, 1, 2], colors: ["#2E7D32", "#E3D46A", "#E8702A", "#B71C1C"], labels: ["None", "1", "2", "3 – 4"],
    value: (e) => {
      const a = String(e.accessibility ?? "").toLowerCase(), s = String(e.security_clearance ?? "").toLowerCase(), t = String(e.terrain_type ?? "").toLowerCase();
      if (!a && !s && !t && distanceToFacility(e) == null) return null;
      return (/hard|inacc|not/.test(a) ? 1 : 0) + (/not|insecure|no/.test(s) && !/partial/.test(s) ? 1 : 0) + (/river|swamp|mountain|hill|forest/.test(t) ? 1 : 0) + ((distanceToFacility(e) ?? 0) > 10 ? 1 : 0);
    }, fmt: (v) => `${v} barrier${v === 1 ? "" : "s"}` },
];

export function classIndex(map: EspenMap, v: number): number {
  const i = map.breaks.findIndex((b) => (map.id === "hard" ? v <= b : v < b));
  return i < 0 ? map.breaks.length : i;
}

// Distinct catchment colours for FLHF catchment map (ESPEN "health facility catchments").
const CATCH = ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B", "#E377C2", "#17BECF", "#BCBD22", "#7F7F7F", "#AEC7E8", "#FFBB78", "#98DF8A", "#FF9896", "#C5B0D5"];
export function catchmentColor(name: string | null | undefined): string {
  const s = String(name ?? "").trim().toUpperCase();
  if (!s) return NO_DATA;
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CATCH[h % CATCH.length];
}
