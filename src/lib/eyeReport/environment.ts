import { boundaryAt, type BoundaryFeature } from "./mapModel";
import { normSummary, t, totals, type EyeReportRow } from "./definition";

export type Morbidity = "cataract" | "tt";
export function morbidityCount(report: EyeReportRow, disease: Morbidity, sex: "all" | "m" | "f") {
  const counts = normSummary(report.summary).screen[disease];
  return sex === "all" ? t(counts) : counts[sex];
}
export function facilityReporting(report: EyeReportRow, rows: EyeReportRow[], sex: "all" | "m" | "f") {
  const matching = rows.filter((r) => r.facility_name.trim().toLowerCase() === report.facility_name.trim().toLowerCase());
  const dates = [...new Set(rows.map((r) => r.report_date))].sort();
  const days = new Set(matching.map((r) => r.report_date)).size;
  const span = dates.length ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000) + 1 : 0;
  const consultations = matching.reduce((sum, row) => {
    const value = totals(normSummary(row.summary)).consulted;
    return sum + (sex === "all" ? t(value) : value[sex]);
  }, 0);
  return { days, span, rate: span > 0 ? days / span * 100 : null, consultations };
}

export type EnvironmentalFeature = {
  type: "Feature";
  properties: { kind: "dust" | "water" | "wash"; name: string; source: string; observed_at: string; source_url?: string; status?: string; water_source?: string; evidence_type?: string; value?: number; units?: string; period_start?: string; model_resolution?: string };
  geometry: { type: "Point" | "Polygon" | "MultiPolygon"; coordinates: any };
};
export type EnvironmentalCollection = { type: "FeatureCollection"; features: EnvironmentalFeature[] };
/** Only explicitly attributed environmental evidence is accepted, never inferred from morbidity. */
export function parseEnvironmentalEvidence(raw: unknown): EnvironmentalCollection {
  const data = raw as EnvironmentalCollection;
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length > 15000) throw new Error("Use a GeoJSON FeatureCollection containing at most 15,000 features.");
  for (const f of data.features) {
    const p = f?.properties;
    if (f?.type !== "Feature" || !p || !["dust", "water", "wash"].includes(p.kind) ||
      ![p.name, p.source].every((v) => typeof v === "string" && v.trim().length > 0 && v.length <= 300) ||
      typeof p.observed_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.observed_at) || !Number.isFinite(Date.parse(p.observed_at))) {
      throw new Error("Each feature needs kind (dust, water or wash), name, source and observed_at (YYYY-MM-DD).");
    }
    const g = f.geometry;
    if (p.value !== undefined && (typeof p.value !== "number" || !Number.isFinite(p.value) || p.value < 0)) throw new Error("Environmental concentration must be a finite non-negative number.");
    if (!g || (p.kind === "dust" ? !["Polygon", "MultiPolygon"].includes(g.type) : g.type !== "Point")) throw new Error("Dust zones must be polygons; water and WASH locations must be points.");
    const coordinate = (v: unknown): boolean => Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every((n) => typeof n === "number" && Number.isFinite(n)) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
    const ring = (r: any): boolean => Array.isArray(r) && r.length >= 4 && r.every(coordinate) && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
    const polygon = (v: any): boolean => Array.isArray(v) && v.length > 0 && v.every(ring);
    const valid = g.type === "Point" ? coordinate(g.coordinates) : g.type === "Polygon" ? polygon(g.coordinates) : Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(polygon);
    if (!valid) throw new Error("Environmental geometry contains invalid coordinates or unclosed polygon rings.");
  }
  return data;
}
/** Relative model concentration bands; not WHO health-risk thresholds. */
export function dustBand(value: number | undefined): "eye-gold" | "eye-orange" | "eye-rose" {
  return value === undefined || value < 100 ? "eye-gold" : value < 150 ? "eye-orange" : "eye-rose";
}
export function dustOverlap(lat: number, lng: number, features: EnvironmentalFeature[]) {
  return features.filter((f) => f.properties.kind === "dust" && boundaryAt(lat, lng, [f as unknown as BoundaryFeature]));
}