/**
 * Real-time Haversine distance recomputation for microplan entries.
 *
 * Distances are always derived from whatever GPS is present on the row at read
 * time — field-captured coordinates, GRID3 fuzzy-matched settlement/facility
 * points, or ward/LGA centroid fallbacks written by the resolver. This keeps the
 * "Avg. Dist. FLHF" KPI and every export consistent with the latest resolved GPS
 * instead of relying on a stale stored column.
 */

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) && n !== 0 ? n : null;
};

const point = (lat: unknown, lng: unknown): [number, number] | null => {
  const la = num(lat);
  const ln = num(lng);
  if (la == null || ln == null) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return [la, ln];
};

export type GeoEntry = Record<string, any>;

export const flhfPoint = (e: GeoEntry) => point(e?.flhf_latitude, e?.flhf_longitude);
export const communityPoint = (e: GeoEntry) => point(e?.community_latitude, e?.community_longitude);
export const settlementPoint = (e: GeoEntry) => point(e?.settlement_latitude, e?.settlement_longitude);

/** Community → FLHF distance in km, recomputed from current GPS (null when unavailable). */
export function communityDistanceKm(e: GeoEntry): number | null {
  const f = flhfPoint(e);
  const c = communityPoint(e) ?? settlementPoint(e);
  if (!f || !c) return num(e?.community_distance_to_flhf_km);
  return Math.round(haversineKm(c[0], c[1], f[0], f[1]) * 100) / 100;
}

/** Settlement → FLHF distance in km, recomputed from current GPS (null when unavailable). */
export function settlementDistanceKm(e: GeoEntry): number | null {
  const f = flhfPoint(e);
  const s = settlementPoint(e);
  if (!f || !s) return num(e?.settlement_distance_to_flhf_km);
  return Math.round(haversineKm(s[0], s[1], f[0], f[1]) * 100) / 100;
}

/** Best available distance for KPI aggregation. */
export function effectiveDistanceKm(e: GeoEntry): number | null {
  return communityDistanceKm(e) ?? settlementDistanceKm(e);
}

/** Mean distance across rows, or null when nothing is computable. */
export function averageDistanceKm(rows: GeoEntry[]): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const d = effectiveDistanceKm(r);
    if (d != null && d > 0) { sum += d; n++; }
  }
  return n ? sum / n : null;
}

/** Row copy with the two distance columns refreshed — used by exports. */
export function withRecomputedDistances<T extends GeoEntry>(e: T): T {
  return {
    ...e,
    community_distance_to_flhf_km: communityDistanceKm(e),
    settlement_distance_to_flhf_km: settlementDistanceKm(e),
  };
}
