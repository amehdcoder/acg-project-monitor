// Divide a perimeter polygon into N equal pie-sector segments around its centroid.
// Each sector is clipped against the perimeter so segment boundaries are visible
// straight lines that radiate from the community centre.
//
// Buildings are then assigned to whichever sector contains them (by angle), so
// segment.count reflects real households inside each slice.

import type { Segment, LatLng } from "./kmeansSegments";

interface XY { x: number; y: number }

const COS = (lat: number) => Math.cos((lat * Math.PI) / 180);

function toXY(p: LatLng, refLat: number): XY {
  return { x: p.lng * COS(refLat), y: p.lat };
}
function toLL(p: XY, refLat: number): LatLng {
  return { lat: p.y, lng: p.x / COS(refLat) };
}

function polygonCentroidXY(ring: XY[]): XY {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j].x * ring[i].y - ring[i].x * ring[j].y;
    a += cross;
    cx += (ring[j].x + ring[i].x) * cross;
    cy += (ring[j].y + ring[i].y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    // degenerate — fall back to mean
    const n = ring.length || 1;
    const mx = ring.reduce((s, p) => s + p.x, 0) / n;
    const my = ring.reduce((s, p) => s + p.y, 0) / n;
    return { x: mx, y: my };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Sutherland–Hodgman polygon clipping against a single half-plane defined
// by line through point P with outward normal n (keep points where dot >= 0).
function clipHalfPlane(poly: XY[], P: XY, n: XY): XY[] {
  const out: XY[] = [];
  if (poly.length === 0) return out;
  const inside = (q: XY) => (q.x - P.x) * n.x + (q.y - P.y) * n.y >= -1e-12;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % poly.length];
    const Ain = inside(A);
    const Bin = inside(B);
    if (Ain) out.push(A);
    if (Ain !== Bin) {
      // intersect AB with the line
      const dx = B.x - A.x, dy = B.y - A.y;
      const denom = dx * n.x + dy * n.y;
      if (Math.abs(denom) > 1e-15) {
        const t = ((P.x - A.x) * n.x + (P.y - A.y) * n.y) / denom;
        out.push({ x: A.x + t * dx, y: A.y + t * dy });
      }
    }
  }
  return out;
}

/**
 * Equal-angle pie segmentation. Buildings is optional — if provided we set
 * segment.count to the number of buildings inside each sector.
 */
export function equalPerimeterSegments(
  perimeter: LatLng[],
  n: number,
  buildings: LatLng[] = [],
  startAngle = -Math.PI / 2, // start at "top" (north)
): Segment[] {
  if (perimeter.length < 3 || n < 1) return [];
  n = Math.max(1, Math.floor(n));
  const refLat = perimeter.reduce((s, p) => s + p.lat, 0) / perimeter.length;
  const ringXY = perimeter.map((p) => toXY(p, refLat));
  const C = polygonCentroidXY(ringXY);

  // bounding-radius — used to project rays well beyond the perimeter for clipping
  let R = 0;
  for (const p of ringXY) {
    const d = Math.hypot(p.x - C.x, p.y - C.y);
    if (d > R) R = d;
  }
  R *= 4;

  const segments: Segment[] = [];
  const buildingXY = buildings.map((b) => ({ ll: b, xy: toXY(b, refLat) }));

  for (let i = 0; i < n; i++) {
    const a0 = startAngle + (i * 2 * Math.PI) / n;
    const a1 = startAngle + ((i + 1) * 2 * Math.PI) / n;

    // Build a triangular wedge from C extending outward by R, then clip against perimeter.
    const Pa = { x: C.x + R * Math.cos(a0), y: C.y + R * Math.sin(a0) };
    const Pb = { x: C.x + R * Math.cos(a1), y: C.y + R * Math.sin(a1) };

    // For very wide sectors (>180°) the triangle would wrap; cap at 179° per slice.
    let wedge: XY[];
    if (n === 1) {
      wedge = ringXY.slice();
    } else {
      // Use two half-planes through C: keep "ccw of ray a0" and "cw of ray a1"
      // (ie inside the angular wedge [a0, a1]).
      const n0 = { x: -Math.sin(a0), y: Math.cos(a0) };          // left of ray a0
      const n1 = { x: Math.sin(a1), y: -Math.cos(a1) };          // right of ray a1
      let clipped = ringXY.slice();
      clipped = clipHalfPlane(clipped, C, n0);
      clipped = clipHalfPlane(clipped, C, n1);
      wedge = clipped;
    }

    if (wedge.length < 3) continue;

    const polyLL = wedge.map((p) => toLL(p, refLat));
    // Centroid of the slice (for label placement)
    const centSlice = polygonCentroidXY(wedge);
    const centroidLL = toLL(centSlice, refLat);

    // Assign buildings by angle from C — robust regardless of slice clipping.
    const norm = (x: number) => {
      let v = x;
      while (v < startAngle) v += 2 * Math.PI;
      while (v >= startAngle + 2 * Math.PI) v -= 2 * Math.PI;
      return v;
    };
    const lo = norm(a0), hi = norm(a1);
    const members: LatLng[] = [];
    for (const b of buildingXY) {
      const ang = norm(Math.atan2(b.xy.y - C.y, b.xy.x - C.x));
      const inSlice = lo <= hi ? (ang >= lo && ang < hi) : (ang >= lo || ang < hi);
      if (inSlice) members.push(b.ll);
    }

    segments.push({
      label: `S${i + 1}`,
      centroid: centroidLL,
      polygon: polyLL,
      color: "#7d1d1d", // oxblood default; renderer overrides for selected
      count: members.length,
      members,
    });
  }
  return segments;
}
