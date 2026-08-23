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
        }
      }
    }
  }

  return {
    lat: Float64Array.from(lat),
    lng: Float64Array.from(lng),
    name, ward, lga, state, buckets,
  };
}

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
