// Geo-correction for SAIRF report GPS markers on the Kano LGA map.
//
// Field-captured GPS coordinates are frequently imprecise (low-accuracy fixes,
// manual entry, swapped lat/lng, or captured just outside a coarse LGA polygon).
// This module authoritatively places every marker INSIDE the LGA the report was
// filed for, using the report's `lga` name as the source of truth:
//
//   1. Build an index of every Kano LGA polygon from the bundled GeoJSON.
//   2. For a report point, find its LGA polygon by (fuzzy) name.
//   3. If the raw GPS point already falls inside that polygon → keep it.
//   4. Otherwise (outside the polygon, outside Kano, or swapped/blank) →
//      relocate the marker to a guaranteed-interior point of the correct LGA
//      (its pole-of-inaccessibility) with a small deterministic jitter so
//      multiple reports from the same LGA don't perfectly overlap.

export type LngLat = [number, number]; // [lng, lat]

type Ring = LngLat[];
type PolygonRings = Ring[]; // [outer, ...holes]

export interface LgaShape {
  name: string;
  polygons: PolygonRings[]; // one entry per polygon (MultiPolygon-aware)
  interior: LngLat; // guaranteed-inside representative point
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface LgaIndex {
  byName: Map<string, LgaShape>;
  shapes: LgaShape[];
  stateBbox: [number, number, number, number];
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Ray-casting point-in-ring test. pt & ring are [lng, lat]. */
function pointInRing(pt: LngLat, ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Point inside a polygon (outer ring minus holes). */
function pointInPolygon(pt: LngLat, rings: PolygonRings): boolean {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) if (pointInRing(pt, rings[h])) return false;
  return true;
}

/** Point inside any polygon of an LGA shape. */
export function pointInShape(pt: LngLat, shape: LgaShape): boolean {
  return shape.polygons.some((poly) => pointInPolygon(pt, poly));
}

function ringBbox(rings: PolygonRings[]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const poly of rings) for (const [lng, lat] of poly[0]) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Approximate the "pole of inaccessibility" (the interior point furthest from
 * any edge) via a coarse grid search over the bounding box. This yields a point
 * that is robustly inside even for concave/L-shaped LGA polygons — far better
 * than a naive centroid which can land outside.
 */
function representativePoint(polygons: PolygonRings[], bbox: [number, number, number, number]): LngLat {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const inside = (pt: LngLat) => polygons.some((poly) => pointInPolygon(pt, poly));

  const distToEdges = (pt: LngLat): number => {
    let best = Infinity;
    for (const poly of polygons) for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        best = Math.min(best, distToSegment(pt, ring[j], ring[i]));
      }
    }
    return best;
  };

  const steps = 24;
  let bestPt: LngLat = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  let bestScore = -1;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const pt: LngLat = [
        minLng + ((maxLng - minLng) * i) / steps,
        minLat + ((maxLat - minLat) * j) / steps,
      ];
      if (!inside(pt)) continue;
      const score = distToEdges(pt);
      if (score > bestScore) { bestScore = score; bestPt = pt; }
    }
  }
  return bestPt;
}

function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Build the LGA lookup index from a Kano GeoJSON FeatureCollection. */
export function buildLgaIndex(geo: any): LgaIndex {
  const byName = new Map<string, LgaShape>();
  const shapes: LgaShape[] = [];
  let sMinLng = Infinity, sMinLat = Infinity, sMaxLng = -Infinity, sMaxLat = -Infinity;

  for (const f of geo?.features ?? []) {
    const name = f?.properties?.lga || f?.properties?.LGA || f?.properties?.name;
    const geom = f?.geometry;
    if (!name || !geom) continue;
    const polygons: PolygonRings[] =
      geom.type === "Polygon" ? [geom.coordinates as PolygonRings]
      : geom.type === "MultiPolygon" ? (geom.coordinates as PolygonRings[])
      : [];
    if (!polygons.length) continue;
    const bbox = ringBbox(polygons);
    const interior = representativePoint(polygons, bbox);
    const shape: LgaShape = { name, polygons, interior, bbox };
    byName.set(norm(name), shape);
    shapes.push(shape);
    sMinLng = Math.min(sMinLng, bbox[0]); sMinLat = Math.min(sMinLat, bbox[1]);
    sMaxLng = Math.max(sMaxLng, bbox[2]); sMaxLat = Math.max(sMaxLat, bbox[3]);
  }

  return { byName, shapes, stateBbox: [sMinLng, sMinLat, sMaxLng, sMaxLat] };
}

/** Fuzzy-match a report LGA name (full) to an indexed geojson LGA (abbreviated). */
export function findShape(index: LgaIndex, lgaName?: string | null): LgaShape | null {
  if (!lgaName) return null;
  const g = norm(lgaName);
  if (!g) return null;
  if (index.byName.has(g)) return index.byName.get(g)!;
  for (const [n, shape] of index.byName) {
    if (!n) continue;
    if (n === g) return shape;
    if (n.length >= 4 && (n.startsWith(g) || g.startsWith(n))) return shape;
  }
  return null;
}

// Deterministic pseudo-random in [-1, 1] from a string id (stable per report).
function hashUnit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

export interface RawPoint { id: string; lat: number; lng: number; reach: number; label: string; lga?: string | null }
export interface PlacedPoint extends RawPoint { corrected: boolean }

/**
 * Place every marker inside its correct LGA polygon. Keeps valid points as-is;
 * relocates invalid/outside points to the LGA interior with a small jitter.
 */
export function placePoints(points: RawPoint[], index: LgaIndex): PlacedPoint[] {
  const inState = (lng: number, lat: number) => {
    const [a, b, c, d] = index.stateBbox;
    return lng >= a && lng <= c && lat >= b && lat <= d;
  };

  return points.map((p): PlacedPoint => {
    const shape = findShape(index, p.lga);
    const lngOk = Number.isFinite(p.lng), latOk = Number.isFinite(p.lat);
    const rawInside = shape && lngOk && latOk && pointInShape([p.lng, p.lat], shape);

    if (rawInside) return { ...p, corrected: false };

    // Try swapped lat/lng (a common capture error) before relocating.
    if (shape && lngOk && latOk && pointInShape([p.lat, p.lng], shape)) {
      return { ...p, lat: p.lng, lng: p.lat, corrected: true };
    }

    if (shape) {
      const [iLng, iLat] = shape.interior;
      const jr = 0.012; // ~1.3km jitter so same-LGA markers fan out
      return {
        ...p,
        lng: iLng + hashUnit(p.id) * jr,
        lat: iLat + hashUnit(p.id + "y") * jr,
        corrected: true,
      };
    }

    // No LGA match at all: if the raw point sits inside Kano keep it, else drop
    // it to the state centroid so it never floats off-map.
    if (lngOk && latOk && inState(p.lng, p.lat)) return { ...p, corrected: false };
    const [a, b, c, d] = index.stateBbox;
    return { ...p, lng: (a + c) / 2 + hashUnit(p.id) * 0.05, lat: (b + d) / 2 + hashUnit(p.id + "y") * 0.05, corrected: true };
  });
}
