/**
 * residentialMask.ts
 * Fetches OSM features (via Overpass) inside a perimeter bbox and classifies them
 * into residential building centroids vs. exclusion zones (roads, waterways,
 * schools, hospitals, places of worship, industrial / commercial / cemeteries).
 *
 * Used by CES Step 2 to keep synthesized households and segment centroids off
 * roads, rivers, schools, hospitals and other non-residential land.
 */

export type LatLng = { lat: number; lng: number };
export type ExclusionPoint = { lat: number; lng: number; bufferM: number };

export type ResidentialMaskResult = {
  residentialBuildings: LatLng[];
  exclusionZones: {
    roads: ExclusionPoint[];
    waterways: ExclusionPoint[];
    nonResidential: ExclusionPoint[];
  };
  source: "osm-overpass" | "cache";
  fetchedAt: number;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h
const memCache = new Map<string, ResidentialMaskResult>();

const RESIDENTIAL_BUILDINGS = new Set([
  "yes", "house", "residential", "apartments", "detached", "bungalow",
  "semidetached_house", "terrace", "hut", "farm", "dormitory", "cabin",
  "static_caravan", "ger", "shack", "tent", "houseboat", "barracks",
]);
// In rural Nigeria many compounds are tagged only `place=isolated_dwelling`,
// `place=hamlet`, `place=village`, or `man_made=courtyard`. We treat those as
// residential anchors as well.
const RESIDENTIAL_PLACES = new Set([
  "isolated_dwelling", "hamlet", "village", "neighbourhood", "quarter", "farm",
]);

const NON_RESIDENTIAL_AMENITY = /^(hospital|clinic|school|college|university|kindergarten|place_of_worship|government|police|fire_station|prison|courthouse)$/;
const NON_RESIDENTIAL_BUILDING = /^(hospital|school|university|college|commercial|retail|industrial|warehouse|church|mosque|temple|cathedral|chapel|government|public)$/;
const NON_RESIDENTIAL_LANDUSE = /^(industrial|commercial|cemetery|education|institutional|military|retail)$/;

function bbox(perimeter: LatLng[]): { s: number; w: number; n: number; e: number } {
  const lats = perimeter.map((p) => p.lat);
  const lngs = perimeter.map((p) => p.lng);
  // Pad slightly so edge buildings are included
  const padLat = 0.0008;
  const padLng = 0.0008;
  return {
    s: Math.min(...lats) - padLat,
    w: Math.min(...lngs) - padLng,
    n: Math.max(...lats) + padLat,
    e: Math.max(...lngs) + padLng,
  };
}

function cacheKey(b: { s: number; w: number; n: number; e: number }): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(b.s)},${r(b.w)},${r(b.n)},${r(b.e)}`;
}

function readPersisted(key: string): ResidentialMaskResult | null {
  try {
    const raw = localStorage.getItem(`ces:resmask:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResidentialMaskResult;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return { ...parsed, source: "cache" };
  } catch {
    return null;
  }
}

function writePersisted(key: string, result: ResidentialMaskResult) {
  try {
    localStorage.setItem(`ces:resmask:${key}`, JSON.stringify(result));
  } catch {
    /* quota — ignore */
  }
}

function buildQuery(b: { s: number; w: number; n: number; e: number }): string {
  const box = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:30];
(
  way["building"](${box});
  relation["building"](${box});
  node["building"](${box});
  way["highway"](${box});
  way["waterway"](${box});
  relation["waterway"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["landuse"="residential"](${box});
  node["place"~"isolated_dwelling|hamlet|village|neighbourhood|quarter|farm"](${box});
  way["amenity"~"hospital|clinic|school|college|university|kindergarten|place_of_worship|government|police|fire_station|prison|courthouse|marketplace"](${box});
  way["landuse"~"industrial|commercial|cemetery|education|institutional|military|retail|quarry"](${box});
);
out tags center;`;
}

async function fetchOverpass(query: string, signal?: AbortSignal): Promise<any> {
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${url} returned ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All Overpass endpoints failed");
}

function classify(elements: any[]): ResidentialMaskResult["exclusionZones"] & { residential: LatLng[] } {
  const residential: LatLng[] = [];
  const roads: ExclusionPoint[] = [];
  const waterways: ExclusionPoint[] = [];
  const nonResidential: ExclusionPoint[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const center = el.center ?? (typeof el.lat === "number" && typeof el.lon === "number" ? { lat: el.lat, lon: el.lon } : null);
    if (!center) continue;
    const pt = { lat: center.lat, lng: center.lon };

    // Roads
    if (tags.highway) {
      const hw = String(tags.highway);
      // Skip pure footpaths inside compounds — they aren't "you can't put a household here"
      if (hw === "footway" || hw === "path" || hw === "steps" || hw === "pedestrian") continue;
      const bufferM = ["motorway", "trunk", "primary"].includes(hw) ? 12
        : ["secondary", "tertiary"].includes(hw) ? 9
        : 6;
      roads.push({ ...pt, bufferM });
      continue;
    }

    // Water
    if (tags.waterway || tags.natural === "water") {
      const ww = String(tags.waterway ?? "");
      const bufferM = ww === "river" ? 15 : ww === "stream" ? 8 : 10;
      waterways.push({ ...pt, bufferM });
      continue;
    }

    // Non-residential amenities / landuse / building types
    if (
      (tags.amenity && NON_RESIDENTIAL_AMENITY.test(String(tags.amenity))) ||
      (tags.landuse && NON_RESIDENTIAL_LANDUSE.test(String(tags.landuse))) ||
      (tags.building && NON_RESIDENTIAL_BUILDING.test(String(tags.building)))
    ) {
      nonResidential.push({ ...pt, bufferM: 18 });
      continue;
    }

    // Residential building
    if (tags.building && RESIDENTIAL_BUILDINGS.has(String(tags.building))) {
      residential.push(pt);
    }
  }

  return { residential, roads, waterways, nonResidential };
}

/**
 * Get OSM-derived residential mask for the given perimeter.
 * Returns an empty (but valid) result on network failure — caller should fall back gracefully.
 */
export async function getResidentialMask(perimeter: LatLng[], opts?: { signal?: AbortSignal }): Promise<ResidentialMaskResult> {
  if (perimeter.length < 3) {
    return {
      residentialBuildings: [],
      exclusionZones: { roads: [], waterways: [], nonResidential: [] },
      source: "osm-overpass",
      fetchedAt: Date.now(),
    };
  }

  const b = bbox(perimeter);
  const key = cacheKey(b);

  const mem = memCache.get(key);
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_MS) return mem;

  const persisted = readPersisted(key);
  if (persisted) {
    memCache.set(key, persisted);
    return persisted;
  }

  const data = await fetchOverpass(buildQuery(b), opts?.signal);
  const { residential, roads, waterways, nonResidential } = classify(data.elements ?? []);

  const result: ResidentialMaskResult = {
    residentialBuildings: residential,
    exclusionZones: { roads, waterways, nonResidential },
    source: "osm-overpass",
    fetchedAt: Date.now(),
  };
  memCache.set(key, result);
  writePersisted(key, result);
  return result;
}

// ---------- Geometry helpers (exported for the workflow) ----------

export function pointInPolygon(pt: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = (yi > pt.lat) !== (yj > pt.lat) &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const latMid = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
}

/**
 * Reject points that are within `bufferM` of any exclusion feature.
 */
export function isOnExcludedFeature(pt: LatLng, mask: ResidentialMaskResult): boolean {
  const all = [...mask.exclusionZones.roads, ...mask.exclusionZones.waterways, ...mask.exclusionZones.nonResidential];
  for (const ex of all) {
    if (haversineM(pt, ex) <= ex.bufferM) return true;
  }
  return false;
}

/**
 * Snap a point to the nearest residential building centroid (within maxM, else returns original).
 */
export function snapToNearestResidential(pt: LatLng, residential: LatLng[], maxM = 60): LatLng {
  let best: LatLng | null = null;
  let bestD = Infinity;
  for (const r of residential) {
    const d = haversineM(pt, r);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best && bestD <= maxM ? best : pt;
}

/**
 * Equirectangular shoelace area in m² for a (possibly open) polygon.
 */
export function polygonAreaM2(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  const latRef = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRef * Math.PI / 180);
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng * mPerDegLng;
    const yi = polygon[i].lat * mPerDegLat;
    const xj = polygon[j].lng * mPerDegLng;
    const yj = polygon[j].lat * mPerDegLat;
    area += xj * yi - xi * yj;
  }
  return Math.abs(area / 2);
}
