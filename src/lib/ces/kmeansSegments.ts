// k-means clustering on lat/lng + Voronoi-ish polygon assignment
// Returns equal-density segments labelled S1..SN with high-contrast colors.

export interface LatLng { lat: number; lng: number }
export interface Segment {
  label: string;
  centroid: LatLng;
  polygon: LatLng[]; // convex hull of cluster points
  color: string;
  count: number;
  members: LatLng[];
}

const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed",
  "#0891b2", "#db2777", "#ca8a04", "#0d9488", "#9333ea",
  "#65a30d", "#e11d48", "#0284c7", "#a16207", "#4f46e5",
];

function distSq(a: LatLng, b: LatLng) {
  const dy = a.lat - b.lat, dx = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + dy * dy;
}

// Convex hull (Andrew monotone chain) on lat/lng treated as planar
function convexHull(pts: LatLng[]): LatLng[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower: LatLng[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: LatLng[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function kmeansSegments(points: LatLng[], k: number, seed = 42): Segment[] {
  if (k < 1) k = 1;
  if (points.length === 0) return [];
  k = Math.min(k, points.length);

  // Seeded PRNG
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  // k-means++ init
  const centroids: LatLng[] = [points[Math.floor(rng() * points.length)]];
  while (centroids.length < k) {
    const dists = points.map((p) => Math.min(...centroids.map((c) => distSq(p, c))));
    const sum = dists.reduce((a, b) => a + b, 0);
    let r = rng() * sum;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { idx = i; break; }
    }
    centroids.push(points[idx]);
  }

  const assign = new Array(points.length).fill(0);
  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = distSq(points[i], centroids[c]);
        if (d < bd) { bd = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    // recompute
    const sums = centroids.map(() => ({ lat: 0, lng: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const a = assign[i];
      sums[a].lat += points[i].lat;
      sums[a].lng += points[i].lng;
      sums[a].n++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n > 0) centroids[c] = { lat: sums[c].lat / sums[c].n, lng: sums[c].lng / sums[c].n };
    }
    if (!changed) break;
  }

  const segments: Segment[] = centroids.map((c, i) => ({
    label: `S${i + 1}`,
    centroid: c,
    polygon: [],
    color: PALETTE[i % PALETTE.length],
    count: 0,
    members: [],
  }));
  for (let i = 0; i < points.length; i++) {
    segments[assign[i]].members.push(points[i]);
    segments[assign[i]].count++;
  }
  for (const seg of segments) seg.polygon = convexHull(seg.members);
  return segments;
}

// Generate synthetic building centroids inside a perimeter (jitter around centroid)
export function syntheticHouseholds(perimeter: LatLng[], n: number): LatLng[] {
  if (perimeter.length === 0 || n <= 0) return [];
  const cLat = perimeter.reduce((a, b) => a + b.lat, 0) / perimeter.length;
  const cLng = perimeter.reduce((a, b) => a + b.lng, 0) / perimeter.length;
  const lats = perimeter.map((p) => p.lat);
  const lngs = perimeter.map((p) => p.lng);
  const dLat = (Math.max(...lats) - Math.min(...lats)) / 2 || 0.001;
  const dLng = (Math.max(...lngs) - Math.min(...lngs)) / 2 || 0.001;
  let s = 1234;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ lat: cLat + (rng() - 0.5) * 2 * dLat * 0.9, lng: cLng + (rng() - 0.5) * 2 * dLng * 0.9 });
  }
  return out;
}

export function pickRandomSegmentIndex(usedIdx: number[], total: number, seed?: number): number {
  const remaining = Array.from({ length: total }, (_, i) => i).filter((i) => !usedIdx.includes(i));
  if (remaining.length === 0) return -1;
  const r = (seed ?? Date.now()) % remaining.length;
  return remaining[Math.abs(r) % remaining.length];
}
