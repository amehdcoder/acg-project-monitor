/**
 * GRID3 nearest-settlement resolver (offline authority for GPS verification).
 *
 * OpenStreetMap publishes very few named settlements in rural Nigeria, which is
 * why reverse geocoding returns "No reference" for a large share of MDA points.
 * The GRID3 registry shipped at /data/grid3_settlements.json holds ~292K
 * Nigerian settlements with State → LGA → Ward → [name, lat, lng], which is a
 * far better reference for these coordinates.
 *
 * The blob is parsed once, flattened into typed arrays and bucketed into a
 * 0.1° spatial grid, so a nearest-neighbour lookup touches a few hundred
 * candidates instead of scanning 292K rows.
 */

export interface NearestSettlement {
  settlement: string;
  ward: string;
  lga: string;
  state: string;
  lat: number;
  lng: number;
  distanceM: number;
}

type Blob = Record<string, Record<string, Record<string, [string, number | null, number | null][]>>>;

interface Index {
  lat: Float64Array;
  lng: Float64Array;
  name: string[];
  ward: string[];
  lga: string[];
  state: string[];
  buckets: Map<string, number[]>;
  /** normalised settlement name → row indices (registry name lookup). */
  names: Map<string, number[]>;
}


const CELL = 0.1; // ≈ 11 km
const cellKey = (lat: number, lng: number) =>
  `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

let index: Index | null = null;
let loading: Promise<Index | null> | null = null;

function build(data: Blob): Index {
  const lat: number[] = [], lng: number[] = [];
  const name: string[] = [], ward: string[] = [], lga: string[] = [], state: string[] = [];
  const buckets = new Map<string, number[]>();
  const names = new Map<string, number[]>();

  for (const st of Object.keys(data)) {
    const lgas = data[st] || {};
    for (const lg of Object.keys(lgas)) {
      const wards = lgas[lg] || {};
      for (const wd of Object.keys(wards)) {
        for (const entry of wards[wd] || []) {
          const [n, la, ln] = entry;
          if (la == null || ln == null || !Number.isFinite(la) || !Number.isFinite(ln)) continue;
          const i = lat.length;
          lat.push(la); lng.push(ln);
          name.push(n); ward.push(wd); lga.push(lg); state.push(st);
          const k = cellKey(la, ln);
          const b = buckets.get(k);
          if (b) b.push(i); else buckets.set(k, [i]);
          const nk = norm(n);
          if (nk) {
            const nb = names.get(nk);
            if (nb) nb.push(i); else names.set(nk, [i]);
          }
        }
      }
    }
  }

  return {
    lat: Float64Array.from(lat),
    lng: Float64Array.from(lng),
    name, ward, lga, state, buckets, names,
  };
}

/** Normalise a place name for registry lookups. */
export const norm = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");


/** Load + index the registry once. Safe to call repeatedly / concurrently. */
export async function loadGrid3Index(): Promise<Index | null> {
  if (index) return index;
  if (loading) return loading;
  loading = fetch("/data/grid3_settlements.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      index = d ? build(d as Blob) : null;
      return index;
    })
    .catch(() => null)
    .finally(() => { loading = null; });
  return loading;
}

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Nearest GRID3 settlement to a coordinate. Searches expanding rings of grid
 * cells (up to ~55 km) so rural points still resolve to a named place.
 */
export async function nearestGrid3Settlement(
  lat: number,
  lng: number,
  maxMeters = 25000,
): Promise<NearestSettlement | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const idx = await loadGrid3Index();
  if (!idx) return null;

  const cx = Math.floor(lat / CELL), cy = Math.floor(lng / CELL);
  let best = -1, bestD = Infinity;

  for (let ring = 0; ring <= 5; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        // only the new perimeter on each ring
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const b = idx.buckets.get(`${cx + dx}:${cy + dy}`);
        if (!b) continue;
        for (const i of b) {
          const d = haversine(lat, lng, idx.lat[i], idx.lng[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    // A hit comfortably inside the scanned radius cannot be beaten further out.
    if (best >= 0 && bestD < ring * CELL * 111000) break;
  }

  if (best < 0 || bestD > maxMeters) return null;
  return {
    settlement: idx.name[best],
    ward: idx.ward[best],
    lga: idx.lga[best],
    state: idx.state[best],
    lat: idx.lat[best],
    lng: idx.lng[best],
    distanceM: bestD,
  };
}

/** Warm the index in the background (call when the map panel mounts). */
export function warmGrid3Index() { void loadGrid3Index(); }

/* ------------------------------------------------------------------------ */
/* Registry lookup BY NAME — used by the GRID3 coordinate accuracy audit.     */
/* ------------------------------------------------------------------------ */

export interface NamedGrid3Match extends NearestSettlement {
  /** exact | fuzzy (prefix/containment on the normalised name). */
  how: "exact" | "fuzzy";
  /** Administrative scope the winning candidate satisfied. */
  scope: "ward" | "lga" | "state" | "unscoped";
}

/** Cache of fuzzy key resolutions (the fallback scan is the expensive path). */
const FUZZY_CACHE = new Map<string, string[]>();

function fuzzyKeys(idx: Index, key: string): string[] {
  const hit = FUZZY_CACHE.get(key);
  if (hit) return hit;
  const out: string[] = [];
  if (key.length >= 4) {
    for (const k of idx.names.keys()) {
      if (k === key || k.startsWith(key) || key.startsWith(k) || (k.length >= 5 && key.includes(k))) {
        out.push(k);
        if (out.length >= 40) break;
      }
    }
  }
  FUZZY_CACHE.set(key, out);
  return out;
}

/**
 * Find the GRID3 registry entry that carries this community name INSIDE the
 * administrative unit the monitor declared, and sits closest to the captured
 * GPS point.
 *
 * Scoping is strict by default: a community named "Obasanjo" declared in a Yobe
 * ward is only ever compared with registry settlements of that name inside the
 * SAME Ward and LGA — never with a same-name settlement in Bayelsa. When the
 * declared ward yields no candidate we relax one step at a time (Ward → LGA →
 * State) and report which scope produced the match, so the audit can show it.
 * With `strict: true` (default) the search never leaves the declared State.
 */
export async function findGrid3Named(
  community: string,
  lat: number,
  lng: number,
  scope: { ward?: string; lga?: string; state?: string; strict?: boolean } = {},
): Promise<NamedGrid3Match | null> {
  const key = norm(community);
  if (!key) return null;
  const idx = await loadGrid3Index();
  if (!idx) return null;

  const wardK = norm(scope.ward ?? "");
  const lgaK = norm(scope.lga ?? "");
  const stateK = norm(scope.state ?? "");
  const strict = scope.strict !== false;

  const levels: { name: NamedGrid3Match["scope"]; ok: (i: number) => boolean }[] = [];
  if (wardK && lgaK) {
    levels.push({
      name: "ward",
      ok: (i) =>
        norm(idx.ward[i]) === wardK &&
        norm(idx.lga[i]) === lgaK &&
        (!stateK || norm(idx.state[i]) === stateK),
    });
  }
  if (lgaK) {
    levels.push({
      name: "lga",
      ok: (i) => norm(idx.lga[i]) === lgaK && (!stateK || norm(idx.state[i]) === stateK),
    });
  }
  if (stateK) levels.push({ name: "state", ok: (i) => norm(idx.state[i]) === stateK });
  // Only fall through to a nationwide search when the caller opts out of strict
  // scoping, or when the record carries no administrative labels at all.
  if (!strict || levels.length === 0) levels.push({ name: "unscoped", ok: () => true });

  const closest = (
    cands: number[],
    ok: (i: number) => boolean,
    how: "exact" | "fuzzy",
    scopeName: NamedGrid3Match["scope"],
  ): NamedGrid3Match | null => {
    let best = -1;
    let bestD = Infinity;
    for (const i of cands) {
      if (!ok(i)) continue;
      const d = haversine(lat, lng, idx.lat[i], idx.lng[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;
    return {
      settlement: idx.name[best], ward: idx.ward[best], lga: idx.lga[best],
      state: idx.state[best], lat: idx.lat[best], lng: idx.lng[best],
      distanceM: bestD, how, scope: scopeName,
    };
  };

  const exact = idx.names.get(key) ?? [];
  const fuzzyPool: number[] = [];
  for (const k of fuzzyKeys(idx, key)) {
    if (k === key) continue;
    for (const i of idx.names.get(k) ?? []) fuzzyPool.push(i);
  }

  // Tightest administrative scope wins, and within a scope an exact name beats
  // a fuzzy one — never the other way round.
  for (const level of levels) {
    const hit =
      (exact.length ? closest(exact, level.ok, "exact", level.name) : null) ??
      (fuzzyPool.length ? closest(fuzzyPool, level.ok, "fuzzy", level.name) : null);
    if (hit) return hit;
  }
  return null;
}

