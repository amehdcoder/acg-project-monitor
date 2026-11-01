import { normCsom, normSummary, t, totals, vaTotal, type EyeReportRow } from "./definition";
import { normEyeGps } from "./gps";

export type BoundaryFeature = { type: "Feature"; properties: { state: string; lga: string }; geometry: { type: string; coordinates: any } };
function inRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function boundaryAt(lat: number, lng: number, features: BoundaryFeature[]) {
  return features.find((feature) => {
    const polygons: number[][][][] = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [];
    return polygons.some((rings) => rings.length > 0 && inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole)));
  });
}
export type MapMetric = "consulted" | "surgeries" | "glasses" | "outcome";
export const MAP_METRICS: { key: MapMetric; label: string }[] = [
  { key: "consulted", label: "Persons consulted" }, { key: "surgeries", label: "Surgeries" },
  { key: "glasses", label: "Glasses dispensed" }, { key: "outcome", label: "Good discharge outcome" },
];
export function mapValue(report: EyeReportRow, metric: MapMetric, sex: "all" | "m" | "f" = "all"): number | null {
  if (metric === "outcome") { const c = normCsom(report.csom); const den = c ? vaTotal(c.discharge.presenting) : 0; return c && den ? c.discharge.presenting.good / den * 100 : null; }
  const counts = totals(normSummary(report.summary))[metric];
  return sex === "all" ? t(counts) : counts[sex];
}
export function locatedReports(rows: EyeReportRow[], features: BoundaryFeature[]) {
  return rows.flatMap((report) => {
    const gps = normEyeGps(report.gps);
    if (!gps) return [];
    const boundary = boundaryAt(gps.lat, gps.lng, features);
    return [{ report, gps, state: boundary?.properties.state ?? null, lga: boundary?.properties.lga ?? null }];
  });
}