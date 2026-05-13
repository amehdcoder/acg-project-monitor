/**
 * residentialMask.ts (renamed concept: feature classifier)
 *
 * Fetches OSM features (buildings, roads, waterways, landuse) inside a
 * perimeter bbox via Overpass with FULL GEOMETRY (out geom;) so we can render
 * actual building footprints (roof outlines) and road centrelines on the
 * satellite map — matching how Google Maps draws them.
 *
 * The previous residential vs non-residential split is removed: every building
 * footprint is rendered uniformly as a "building". Roads and waterways are
 * detected as line features (polylines) and labelled where OSM provides a
 * `name` or `ref` tag (typical "Rd", "Road", "Street", "Ave" suffixes).
 *
 * In-app classification:
 *   - Supervised heuristic: maps OSM `highway`/`waterway`/`building` tags to a
 *     class label and a buffer width. For untagged features we fall back to the
 *     unsupervised classifier below.
 *   - Unsupervised k-means: clusters un-tagged way geometries by simple shape
 *     features (length, sinuosity, area, vertex density) into "building-like"
 *     vs "road-like" vs "water-like" groups so the map exhaustively shows
 *     features even where OSM tags are missing.
 *
 * Backward-compatible exports:
 *   - `getResidentialMask`, `ResidentialMaskResult`, `pointInPolygon`,
 *     `haversineM`, `polygonAreaM2`, `isOnExcludedFeature`,
 *     `snapToNearestResidential` are preserved so existing call sites keep
 *     working. `residentialBuildings` now means "all building centroids" and
 *     `exclusionZones.nonResidential` is always empty (kept for type stability).
 *
 * New richer export: `featureGeometry` carries polygons/polylines for rendering.
 */

export type LatLng = { lat: number; lng: number };
export type ExclusionPoint = { lat: number; lng: number; bufferM: number };

export type RoadClass =
  | "motorway" | "trunk" | "primary" | "secondary" | "tertiary"
  | "residential" | "service" | "track" | "unclassified" | "path";
export type WaterClass = "river" | "stream" | "canal" | "drain" | "ditch" | "water";

export interface BuildingFeature {
  /** Stable classifier id used for QA labels and supervised corrections. */
  id: string;
  /** Footprint outer ring (closed or open — renderer closes it). */
  ring: LatLng[];
  /** Centroid of the footprint. */
  center: LatLng;
  /** Approx area in m². */
  areaM2: number;
  /** Optional `name` / `addr:housename` from OSM. */
  name?: string;
  /** Unsupervised size-class label: 'small' | 'medium' | 'large'. */
  sizeClass: "small" | "medium" | "large";
  /** True when classified by ML rather than from an explicit OSM tag. */
  inferred: boolean;
  /** Classifier confidence from 0–1; low values are highlighted for QA. */
  confidence: number;
}

export interface RoadFeature {
  id: string;
  points: LatLng[];
  name?: string;       // e.g. "Yakubu Gowon Way", "Aminu Kano Road"
  ref?: string;        // e.g. "A2"
  cls: RoadClass;
  bufferM: number;
  inferred: boolean;
  confidence: number;
}

export interface WaterwayFeature {
  id: string;
  points: LatLng[];
  name?: string;
  cls: WaterClass;
  bufferM: number;
  /** True for closed water polygons (lakes, ponds). */
  isPolygon: boolean;
  inferred?: boolean;
  confidence: number;
}

export interface FeatureGeometry {
  buildings: BuildingFeature[];
  roads: RoadFeature[];
  waterways: WaterwayFeature[];
}

export type ResidentialMaskResult = {
  /** Centroids of every detected building footprint (roof). */
  residentialBuildings: LatLng[];
  exclusionZones: {
    /** Road centroid buffers (legacy point-buffer model). */
    roads: ExclusionPoint[];
    /** Waterway centroid buffers (legacy). */
    waterways: ExclusionPoint[];
    /** Always [] now — non-residential split is disabled. */
    nonResidential: ExclusionPoint[];
  };
  /** Rich geometry for rendering footprints + road lines on the map. */
  featureGeometry: FeatureGeometry;
  source: "osm-overpass" | "cache";
  fetchedAt: number;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h
const memCache = new Map<string, ResidentialMaskResult>();

function bbox(perimeter: LatLng[]): { s: number; w: number; n: number; e: number } {
  const lats = perimeter.map((p) => p.lat);
  const lngs = perimeter.map((p) => p.lng);
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
    const raw = localStorage.getItem(`ces:resmask:v2:${key}`);
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
    localStorage.setItem(`ces:resmask:v2:${key}`, JSON.stringify(result));
  } catch {
    /* quota — ignore */
  }
}

/**
 * Overpass query — request FULL GEOMETRY (`out geom;`) so we get every node of
 * each way/relation, enabling true footprint and road-line rendering.
 *
 * We pull:
 *   - building=*               → all buildings (no residential/non-residential split)
 *   - highway=*                → roads (lines)
 *   - waterway=*               → rivers/streams/canals/drains
 *   - natural=water            → lakes, ponds (polygons)
 *   - landuse=residential|...  → context polygons (used by the unsupervised
 *     classifier to label untagged buildings inside residential zones)
 */
function buildQuery(b: { s: number; w: number; n: number; e: number }): string {
  const box = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:40];
(
  way["building"](${box});
  relation["building"](${box});
  way["highway"](${box});
  way["waterway"](${box});
  relation["waterway"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["landuse"](${box});
);
out tags geom;`;
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

// ---------- Geometry helpers ----------

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const latMid = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
}

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

function polylineLengthM(pts: LatLng[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += haversineM(pts[i - 1], pts[i]);
  return len;
}

function ringIsClosed(pts: LatLng[]): boolean {
  if (pts.length < 4) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

function ringCentroid(pts: LatLng[]): LatLng {
  let lat = 0, lng = 0;
  for (const p of pts) { lat += p.lat; lng += p.lng; }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

function stableFeatureId(prefix: string, pts: LatLng[], label = ""): string {
  const sample = pts.slice(0, 6).map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
  let h = 2166136261;
  const s = `${prefix}:${label}:${pts.length}:${sample}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

// ---------- Supervised heuristic + unsupervised k-means classifiers ----------

const ROAD_BUFFERS: Record<RoadClass, number> = {
  motorway: 18, trunk: 16, primary: 14, secondary: 10, tertiary: 8,
  residential: 6, service: 4, track: 4, unclassified: 6, path: 2,
};

function classifyRoadFromTag(highway: string): RoadClass {
  const t = highway.toLowerCase();
  if (t in ROAD_BUFFERS) return t as RoadClass;
  if (t === "motorway_link" || t === "trunk_link") return "trunk";
  if (t === "primary_link") return "primary";
  if (t === "secondary_link") return "secondary";
  if (t === "tertiary_link") return "tertiary";
  if (t === "footway" || t === "cycleway" || t === "steps" || t === "pedestrian") return "path";
  return "unclassified";
}

function classifyWaterFromTag(tag: string): WaterClass {
  const t = tag.toLowerCase();
  if (t === "river" || t === "stream" || t === "canal" || t === "drain" || t === "ditch") return t as WaterClass;
  return "water";
}

/**
 * Tiny 1-D k-means (k=3) on building areas to assign a small/medium/large
 * size class. Pure JS, runs in-app, no external ML lib.
 */
function kmeans1D(values: number[], k = 3, iters = 20): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const centroids: number[] = [];
  for (let i = 0; i < k; i++) {
    centroids.push(sorted[Math.floor((i + 0.5) * sorted.length / k)] ?? sorted[0]);
  }
  const labels = new Array(values.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(values[i] - centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    const sums = new Array(k).fill(0), counts = new Array(k).fill(0);
    for (let i = 0; i < values.length; i++) {
      sums[labels[i]] += values[i]; counts[labels[i]] += 1;
    }
    for (let c = 0; c < k; c++) if (counts[c] > 0) centroids[c] = sums[c] / counts[c];
    if (!changed) break;
  }
  // Map cluster index → ordered size rank (smallest=0)
  const order = centroids
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)
    .map((x) => x.i);
  const rank = new Array(k).fill(0);
  order.forEach((i, r) => { rank[i] = r; });
  return labels.map((l) => rank[l]);
}

/**
 * Unsupervised classifier for an untagged closed way: decide whether its
 * geometry "looks like" a building (compact, small area), water polygon
 * (large, irregular), or should be ignored. Returns null when the geometry is
 * too ambiguous to keep.
 */
function classifyUntaggedClosedWay(ring: LatLng[]): "building" | "water" | null {
  const area = polygonAreaM2(ring);
  if (area < 8 || area > 50_000) return null;
  const perim = polylineLengthM(ring);
  // Isoperimetric compactness: 1 = perfect circle. Buildings ≈ 0.4–0.95.
  const compactness = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;
  if (area < 4000 && compactness > 0.35) return "building";
  if (area > 1500 && compactness < 0.4) return "water";
  return area < 4000 ? "building" : null;
}

/**
 * Unsupervised classifier for an untagged open way (line): treat as road if
 * it has a reasonable length and modest sinuosity; otherwise ignore.
 */
function classifyUntaggedOpenWay(pts: LatLng[]): RoadClass | null {
  if (pts.length < 2) return null;
  const len = polylineLengthM(pts);
  if (len < 15) return null;
  const straight = haversineM(pts[0], pts[pts.length - 1]) || 1;
  const sinuosity = len / straight;
  if (sinuosity > 4) return null; // too jagged to be a road
  if (len > 400) return "tertiary";
  if (len > 120) return "residential";
  return "service";
}

// ---------- Classification of Overpass payload into geometry ----------

function classify(elements: any[]): { result: ResidentialMaskResult; featureGeometry: FeatureGeometry } {
  const buildings: BuildingFeature[] = [];
  const roads: RoadFeature[] = [];
  const waterways: WaterwayFeature[] = [];
  const residentialLanduse: LatLng[][] = [];

  // ----- First pass: tagged features -----
  for (const el of elements) {
    const tags = el.tags ?? {};
    const geom: { lat: number; lon: number }[] | undefined = el.geometry;
    if (!geom || geom.length === 0) continue;
    const ring: LatLng[] = geom.map((g) => ({ lat: g.lat, lng: g.lon }));

    if (tags.building) {
      // Treat ALL buildings uniformly (no residential/non-residential split).
      const closed = ringIsClosed(ring) ? ring : [...ring, ring[0]];
      const area = polygonAreaM2(closed);
      buildings.push({
        ring: closed,
        center: ringCentroid(closed),
        areaM2: area,
        name: tags.name ?? tags["addr:housename"] ?? undefined,
        sizeClass: "medium", // filled in by k-means below
        inferred: false,
      });
      continue;
    }

    if (tags.highway) {
      const cls = classifyRoadFromTag(String(tags.highway));
      if (cls === "path") continue; // skip pure pedestrian paths
      roads.push({
        points: ring,
        name: tags.name ?? undefined,
        ref: tags.ref ?? undefined,
        cls,
        bufferM: ROAD_BUFFERS[cls],
        inferred: false,
      });
      continue;
    }

    if (tags.waterway) {
      const cls = classifyWaterFromTag(String(tags.waterway));
      const buf = cls === "river" ? 25 : cls === "canal" ? 18 : cls === "stream" ? 10 : 5;
      waterways.push({ points: ring, name: tags.name ?? undefined, cls, bufferM: buf, isPolygon: false });
      continue;
    }

    if (tags.natural === "water") {
      const closed = ringIsClosed(ring) ? ring : [...ring, ring[0]];
      waterways.push({ points: closed, name: tags.name ?? undefined, cls: "water", bufferM: 20, isPolygon: true });
      continue;
    }

    if (tags.landuse === "residential") {
      residentialLanduse.push(ring);
    }
  }

  // ----- Second pass: unsupervised classification of untagged geometries -----
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (tags.building || tags.highway || tags.waterway || tags.natural === "water" || tags.landuse) continue;
    const geom: { lat: number; lon: number }[] | undefined = el.geometry;
    if (!geom || geom.length < 2) continue;
    const ring: LatLng[] = geom.map((g) => ({ lat: g.lat, lng: g.lon }));

    if (ringIsClosed(ring) || (ring.length > 3 && haversineM(ring[0], ring[ring.length - 1]) < 8)) {
      const closed = ringIsClosed(ring) ? ring : [...ring, ring[0]];
      const guess = classifyUntaggedClosedWay(closed);
      if (guess === "building") {
        buildings.push({
          ring: closed,
          center: ringCentroid(closed),
          areaM2: polygonAreaM2(closed),
          sizeClass: "medium",
          inferred: true,
        });
      } else if (guess === "water") {
        waterways.push({ points: closed, cls: "water", bufferM: 15, isPolygon: true });
      }
    } else {
      const cls = classifyUntaggedOpenWay(ring);
      if (cls) {
        roads.push({
          points: ring,
          cls,
          bufferM: ROAD_BUFFERS[cls],
          inferred: true,
        });
      }
    }
  }

  // ----- Unsupervised k-means: bucket buildings by footprint area -----
  if (buildings.length > 0) {
    const labels = kmeans1D(buildings.map((b) => Math.log(Math.max(b.areaM2, 1))), 3);
    const sizeMap: Array<"small" | "medium" | "large"> = ["small", "medium", "large"];
    buildings.forEach((b, i) => { b.sizeClass = sizeMap[labels[i] ?? 1]; });
  }

  // ----- Build legacy point-buffer arrays for the existing exclusion API -----
  const roadPts: ExclusionPoint[] = roads.map((r) => ({
    ...ringCentroid(r.points),
    bufferM: r.bufferM,
  }));
  const waterPts: ExclusionPoint[] = waterways.map((w) => ({
    ...ringCentroid(w.points),
    bufferM: w.bufferM,
  }));

  const result: ResidentialMaskResult = {
    residentialBuildings: buildings.map((b) => b.center),
    exclusionZones: { roads: roadPts, waterways: waterPts, nonResidential: [] },
    featureGeometry: { buildings, roads, waterways },
    source: "osm-overpass",
    fetchedAt: Date.now(),
  };
  return { result, featureGeometry: result.featureGeometry };
}

/**
 * Get OSM-derived map features (buildings + roads + waterways) for the given
 * perimeter. Returns an empty (but valid) result on network failure.
 */
export async function getResidentialMask(
  perimeter: LatLng[],
  opts?: { signal?: AbortSignal },
): Promise<ResidentialMaskResult> {
  if (perimeter.length < 3) {
    return {
      residentialBuildings: [],
      exclusionZones: { roads: [], waterways: [], nonResidential: [] },
      featureGeometry: { buildings: [], roads: [], waterways: [] },
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
  const { result } = classify(data.elements ?? []);
  memCache.set(key, result);
  writePersisted(key, result);
  return result;
}

/**
 * Reject points within `bufferM` of any road or waterway centroid. Buildings
 * are no longer treated as exclusions (every building counts uniformly).
 */
export function isOnExcludedFeature(pt: LatLng, mask: ResidentialMaskResult): boolean {
  const all = [...mask.exclusionZones.roads, ...mask.exclusionZones.waterways];
  for (const ex of all) {
    if (haversineM(pt, ex) <= ex.bufferM) return true;
  }
  return false;
}

/**
 * Snap a point to the nearest building centroid (within maxM, else returns original).
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
