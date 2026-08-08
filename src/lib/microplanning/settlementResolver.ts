/**
 * Fuzzy GRID3 coordinate resolver for microplan entries.
 * ─────────────────────────────────────────────────────────────────────────
 * Health Facilities, Communities and Settlements captured in the field often
 * arrive with no Latitude/Longitude. This module recovers them offline from the
 * GRID3 shards already cached on the device, walking the administrative
 * cascade strictly downwards:
 *
 *      State → LGA → Ward → Health Facility → Community → Settlement
 *
 * Matching is fuzzy (normalised token overlap + Levenshtein ratio) but always
 * *scoped* to the LGA and Ward reported for the row, so a "Kofar Gabas" in one
 * ward can never be resolved to an identically-named place in another.
 *
 * When no GRID3 name match clears the confidence bar we fall back to the ward
 * centroid (mean of every GRID3 settlement inside that ward), which guarantees
 * the geolocated point still falls inside the ward indicated for the community.
 */

import {
  getGrid3SettlementsWithCoords,
  getGrid3FacilitiesWithCoords,
  type FacilityWithCoords,
} from "@/lib/grid3NigeriaData";

export type ResolveMethod =
  | "grid3_settlement_ward"
  | "grid3_settlement_lga"
  | "grid3_facility_ward"
  | "grid3_facility_lga"
  | "ward_centroid"
  | "lga_centroid"
  | "unresolved";

export interface ResolvedPoint {
  latitude: number;
  longitude: number;
  /** 0–1 name similarity (1 = exact). Centroid fallbacks report 0. */
  confidence: number;
  method: ResolveMethod;
  /** The GRID3 record name the row was matched against, when applicable. */
  matchedName: string | null;
}

export interface MicroplanGeoRow {
  id?: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  community_latitude?: number | null;
  community_longitude?: number | null;
  settlement_latitude?: number | null;
  settlement_longitude?: number | null;
  flhf_latitude?: number | null;
  flhf_longitude?: number | null;
}

export interface RowResolution {
  id?: string;
  state: string;
  lga: string;
  ward: string;
  /** Which of the three geo slots were filled. */
  community?: ResolvedPoint;
  settlement?: ResolvedPoint;
  flhf?: ResolvedPoint;
  /** Best GRID3 settlement name found for a row whose settlement is blank. */
  suggestedSettlementName?: string | null;
}

// ── normalisation & similarity ──────────────────────────────────────────

const STOP = new Set([
  "ward", "village", "settlement", "community", "town", "hamlet",
  "phc", "hp", "health", "post", "clinic", "centre", "center", "dispensary",
  "primary", "care", "facility", "the", "of", "and",
]);

export const normName = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const tokens = (s: string): string[] =>
  normName(s).split(" ").filter((t) => t && !STOP.has(t));

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0–1 hybrid similarity: token Jaccard blended with edit-distance ratio. */
export function similarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  const setB = new Set(tb);
  const inter = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  const jaccard = inter / union;
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  const contains = na.includes(nb) || nb.includes(na) ? 0.15 : 0;
  return Math.min(1, Math.max(jaccard, lev) * 0.85 + jaccard * 0.15 + contains);
}

/** Minimum similarity accepted as a real name match. */
export const MATCH_THRESHOLD = 0.62;

function bestMatch(
  name: string,
  pool: FacilityWithCoords[],
): { rec: FacilityWithCoords; score: number } | null {
  let best: { rec: FacilityWithCoords; score: number } | null = null;
  for (const rec of pool) {
    if (rec.latitude == null || rec.longitude == null) continue;
    const score = similarity(name, rec.name);
    if (!best || score > best.score) best = { rec, score };
  }
  return best;
}

function centroid(pool: FacilityWithCoords[]): { lat: number; lng: number } | null {
  let lat = 0, lng = 0, n = 0;
  for (const r of pool) {
    if (r.latitude == null || r.longitude == null) continue;
    lat += r.latitude; lng += r.longitude; n++;
  }
  return n ? { lat: lat / n, lng: lng / n } : null;
}

// ── shard access with a small per-run memo ──────────────────────────────

type Pools = {
  setWard: FacilityWithCoords[];
  setLga: FacilityWithCoords[];
  facWard: FacilityWithCoords[];
  facLga: FacilityWithCoords[];
};

async function loadPools(
  cache: Map<string, Pools>,
  state: string,
  lga: string,
  ward: string,
): Promise<Pools> {
  const key = `${state}|${lga}|${ward}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [setWard, setLga, facWard, facLga] = await Promise.all([
    ward ? getGrid3SettlementsWithCoords(state, lga, ward).catch(() => []) : Promise.resolve([]),
    getGrid3SettlementsWithCoords(state, lga).catch(() => []),
    ward ? getGrid3FacilitiesWithCoords(state, lga, ward).catch(() => []) : Promise.resolve([]),
    getGrid3FacilitiesWithCoords(state, lga).catch(() => []),
  ]);
  const pools: Pools = { setWard, setLga, facWard, facLga };
  cache.set(key, pools);
  return pools;
}

/**
 * Resolve a single place name inside the LGA → Ward scope.
 * `kind` decides which GRID3 layer is searched first.
 */
function resolveName(
  name: string,
  pools: Pools,
  kind: "settlement" | "facility",
): ResolvedPoint {
  const order: Array<[FacilityWithCoords[], ResolveMethod]> =
    kind === "facility"
      ? [
          [pools.facWard, "grid3_facility_ward"],
          [pools.facLga, "grid3_facility_lga"],
          [pools.setWard, "grid3_settlement_ward"],
          [pools.setLga, "grid3_settlement_lga"],
        ]
      : [
          [pools.setWard, "grid3_settlement_ward"],
          [pools.setLga, "grid3_settlement_lga"],
          [pools.facWard, "grid3_facility_ward"],
          [pools.facLga, "grid3_facility_lga"],
        ];

  if (name) {
    for (const [pool, method] of order) {
      const m = bestMatch(name, pool);
      if (m && m.score >= MATCH_THRESHOLD) {
        return {
          latitude: m.rec.latitude as number,
          longitude: m.rec.longitude as number,
          confidence: Math.round(m.score * 100) / 100,
          method,
          matchedName: m.rec.name,
        };
      }
    }
  }

  // Fallback — geolocate inside the indicated ward using its GRID3 centroid.
  const wardC = centroid(pools.setWard.length ? pools.setWard : pools.facWard);
  if (wardC) {
    return { latitude: wardC.lat, longitude: wardC.lng, confidence: 0, method: "ward_centroid", matchedName: null };
  }
  const lgaC = centroid(pools.setLga.length ? pools.setLga : pools.facLga);
  if (lgaC) {
    return { latitude: lgaC.lat, longitude: lgaC.lng, confidence: 0, method: "lga_centroid", matchedName: null };
  }
  return { latitude: 0, longitude: 0, confidence: 0, method: "unresolved", matchedName: null };
}

const hasCoords = (lat: unknown, lng: unknown) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

/** True when the row is missing at least one of the three coordinate slots. */
export function rowNeedsGeocoding(r: MicroplanGeoRow): boolean {
  const needCommunity = !!r.community_name && !hasCoords(r.community_latitude, r.community_longitude);
  const needSettlement = !!r.settlement_name && !hasCoords(r.settlement_latitude, r.settlement_longitude);
  const needFlhf = !!r.flhf_name && !hasCoords(r.flhf_latitude, r.flhf_longitude);
  return needCommunity || needSettlement || needFlhf;
}

/**
 * Resolve coordinates for every row that is missing them.
 * Purely offline — reads the GRID3 shards already cached for each state.
 */
export async function resolveMissingCoordinates(
  rows: MicroplanGeoRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<RowResolution[]> {
  const targets = rows.filter(rowNeedsGeocoding);
  const cache = new Map<string, Pools>();
  const out: RowResolution[] = [];

  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    const state = String(r.state ?? "").trim();
    const lga = String(r.lga ?? "").trim();
    const ward = String(r.ward ?? "").trim();
    if (!state || !lga) { onProgress?.(i + 1, targets.length); continue; }

    const pools = await loadPools(cache, state, lga, ward);
    const res: RowResolution = { id: r.id, state, lga, ward };

    if (r.flhf_name && !hasCoords(r.flhf_latitude, r.flhf_longitude)) {
      const p = resolveName(String(r.flhf_name), pools, "facility");
      if (p.method !== "unresolved") res.flhf = p;
    }
    if (r.community_name && !hasCoords(r.community_latitude, r.community_longitude)) {
      const p = resolveName(String(r.community_name), pools, "settlement");
      if (p.method !== "unresolved") res.community = p;
    }
    if (r.settlement_name && !hasCoords(r.settlement_latitude, r.settlement_longitude)) {
      const p = resolveName(String(r.settlement_name), pools, "settlement");
      if (p.method !== "unresolved") res.settlement = p;
    }
    // Row has no settlement recorded at all → suggest the closest GRID3
    // settlement name inside the ward so the gap can be closed in the data.
    if (!r.settlement_name && r.community_name) {
      const m = bestMatch(String(r.community_name), pools.setWard.length ? pools.setWard : pools.setLga);
      if (m && m.score >= MATCH_THRESHOLD) res.suggestedSettlementName = m.rec.name;
    }

    if (res.flhf || res.community || res.settlement || res.suggestedSettlementName) out.push(res);
    onProgress?.(i + 1, targets.length);
  }

  return out;
}

/** Map a resolution into a Supabase update payload for `microplan_entries`. */
export function resolutionToUpdate(res: RowResolution): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (res.community) {
    patch.community_latitude = res.community.latitude;
    patch.community_longitude = res.community.longitude;
  }
  if (res.settlement) {
    patch.settlement_latitude = res.settlement.latitude;
    patch.settlement_longitude = res.settlement.longitude;
  }
  if (res.flhf) {
    patch.flhf_latitude = res.flhf.latitude;
    patch.flhf_longitude = res.flhf.longitude;
  }
  if (res.suggestedSettlementName) patch.settlement_name = res.suggestedSettlementName;
  return patch;
}
