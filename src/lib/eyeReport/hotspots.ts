import { boundaryAt, type BoundaryFeature } from "./mapModel";
import type { EnvironmentalFeature } from "./environment";
import type { EyeReportRow } from "./definition";
import { normEyeGps } from "./gps";
import { validCoordinates, type MapFacility } from "./environmentStore";

export type LocatedFacility = { key: string; name: string; lat: number; lng: number; evidence: "Registered facility coordinates" | "Latest report-capture proxy" };
/** A facility is counted once; registered locations take precedence over report-capture proxies. */
export function facilityLocations(rows: EyeReportRow[], registry: MapFacility[]) {
  const locations = new Map<string, LocatedFacility>();
  const names = new Map(registry.map((f) => [f.name.trim().toLowerCase(), f.id]));
  const identified = new Set<string>();
  const keyFor = (r: EyeReportRow) => r.facility_id ?? names.get(r.facility_name.trim().toLowerCase()) ?? `${r.project_id}:${r.facility_name.trim().toLowerCase()}`;
  for (const f of registry) {
    identified.add(f.id);
    if (validCoordinates(f.latitude, f.longitude)) locations.set(f.id, { key: f.id, name: f.name, lat: f.latitude, lng: Number(f.longitude), evidence: "Registered facility coordinates" });
  }
  for (const r of [...rows].sort((a,b) => b.report_date.localeCompare(a.report_date) || (b.gps?.captured_at ?? "").localeCompare(a.gps?.captured_at ?? ""))) {
    const key = keyFor(r); identified.add(key);
    const gps = normEyeGps(r.gps);
    if (gps && !locations.has(key)) locations.set(key, { key, name: r.facility_name, lat: gps.lat, lng: gps.lng, evidence: "Latest report-capture proxy" });
  }
  return { locations: [...locations.values()], unlocated: identified.size - locations.size };
}
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180, a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export function facilitiesInZone(feature: EnvironmentalFeature, locations: LocatedFacility[], radiusKm = 1) {
  return locations.filter((f) => feature.geometry.type === "Point"
    ? distanceKm(f.lat, f.lng, feature.geometry.coordinates[1], feature.geometry.coordinates[0]) <= radiusKm
    : !!boundaryAt(f.lat,f.lng,[feature as unknown as BoundaryFeature]));
}