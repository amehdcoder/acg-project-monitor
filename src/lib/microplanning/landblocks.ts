// ESPEN/Crosscut-style "landblocks": each mapped community owns the area
// closest to it (Voronoi), limited to a settlement radius and clipped to the
// State boundary. Density = community population / landblock area.
import { Delaunay } from "d3-delaunay";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { geometryContains } from "./heatmaps";

type Geom = { type: string; coordinates: unknown };
export interface Landblock { index: number; rings: MultiPolygon; areaKm2: number; density: number }

export const SETTLEMENT_RADIUS_KM = 5;

function circle(lat: number, lng: number, km: number, n = 24): [number, number][] {
  const dLat = km / 110.57, dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)] as [number, number]; });
}

/** Sutherland–Hodgman: clip a polygon by a convex, counter-clockwise clip polygon. */
export function clipConvex(subject: [number, number][], clip: [number, number][]) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const [ax, ay] = clip[i], [bx, by] = clip[(i + 1) % clip.length];
    const inside = (p: [number, number]) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) >= 0;
    const cross = (p: [number, number], q: [number, number]): [number, number] => {
      const a1 = by - ay, b1 = ax - bx, c1 = a1 * ax + b1 * ay;
      const a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1];
      const det = a1 * b2 - a2 * b1;
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
    };
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cross(prev, cur));
    }
  }
  return out;
}

export function areaKm2(mp: MultiPolygon) {
  let total = 0;
  for (const poly of mp) poly.forEach((ring, ri) => {
    if (!ring.length) return;
    const lat0 = ring[0][1], kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
    let s = 0;
    for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; s += x1 * kx * y2 * ky - x2 * kx * y1 * ky; }
    total += (ri === 0 ? 1 : -1) * Math.abs(s / 2);
  });
  return total;
}

const toMulti = (g: Geom): MultiPolygon => (g.type === "Polygon" ? [g.coordinates as Polygon] : g.type === "MultiPolygon" ? (g.coordinates as MultiPolygon) : []);

export function buildLandblocks(points: { lat: number; lng: number; pop: number }[], stateShapes: Geom[], radiusKm = SETTLEMENT_RADIUS_KM): Landblock[] {
  if (!points.length) return [];
  // Merge co-located points so Voronoi never receives duplicates.
  const lngs = points.map((p) => p.lng), lats = points.map((p) => p.lat);
  const pad = 0.5;
  const box: [number, number, number, number] = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
  const jitter = new Map<string, number>();
  const coords = points.map((p) => { const k = `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`; const n = jitter.get(k) ?? 0; jitter.set(k, n + 1); return [p.lng + n * 1e-5, p.lat + n * 1e-5] as [number, number]; });
  const vor = Delaunay.from(coords).voronoi(box);
  const state: MultiPolygon = stateShapes.flatMap(toMulti);
  const inState = (lat: number, lng: number) => !stateShapes.length || stateShapes.some((s) => geometryContains(s, lat, lng));
  const out: Landblock[] = [];
  points.forEach((p, i) => {
    const cell = vor.cellPolygon(i) as [number, number][] | null;
    if (!cell) return;
    let ring = clipConvex(cell.slice(0, -1), circle(p.lat, p.lng, radiusKm));
    if (ring.length < 3) return;
    ring = [...ring, ring[0]];
    let mp: MultiPolygon = [[ring]];
    if (state.length && ring.some(([x, y]) => !inState(y, x))) {
      try { mp = polygonClipping.intersection(mp, state); } catch { /* keep unclipped */ }
    }
    const a = areaKm2(mp);
    if (a <= 0) return;
    out.push({ index: i, rings: mp, areaKm2: a, density: p.pop / a });
  });
  return out;
}
