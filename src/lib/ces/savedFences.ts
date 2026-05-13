/**
 * Saved fenced areas — persisted to localStorage so a surveyor can capture
 * several communities in a single session and reuse any of them in Step 2
 * without redrawing.
 */

export type LatLng = { lat: number; lng: number };

export interface SavedFence {
  id: string;
  name: string;
  /** Closed ring (last point === first point). */
  polygon: LatLng[];
  center: LatLng;
  /** Origin of the fence so reviewers know how it was captured. */
  source: "walk" | "auto-fence" | "manual-draw" | "edited";
  /** Optional radius for circular auto-fences (metres). */
  radiusM?: number;
  perimeterM: number;
  areaM2: number;
  createdAt: number;
  /** Optional administrative context to help the surveyor pick the right one. */
  state?: string;
  lga?: string;
  ward?: string;
  community?: string;
}

const KEY = "ces.savedFences.v1";
const MAX_FENCES = 50;

export function loadSavedFences(): SavedFence[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFence[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && Array.isArray(f.polygon) && f.polygon.length >= 3);
  } catch {
    return [];
  }
}

export function saveFence(fence: Omit<SavedFence, "id" | "createdAt"> & { id?: string }): SavedFence {
  const all = loadSavedFences();
  const record: SavedFence = {
    ...fence,
    id: fence.id ?? `fence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const next = [record, ...all].slice(0, MAX_FENCES);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return record;
}

export function deleteSavedFence(id: string): SavedFence[] {
  const next = loadSavedFences().filter((f) => f.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export function renameSavedFence(id: string, name: string): SavedFence[] {
  const next = loadSavedFences().map((f) => f.id === id ? { ...f, name } : f);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export function polygonCenter(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) return { lat: 0, lng: 0 };
  const ring = polygon.length > 1
    && Math.abs(polygon[0].lat - polygon[polygon.length - 1].lat) < 1e-9
    && Math.abs(polygon[0].lng - polygon[polygon.length - 1].lng) < 1e-9
    ? polygon.slice(0, -1)
    : polygon;
  let lat = 0, lng = 0;
  for (const p of ring) { lat += p.lat; lng += p.lng; }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

export function polygonPerimeterM(polygon: LatLng[]): number {
  if (polygon.length < 2) return 0;
  const R = 6371000;
  let total = 0;
  for (let i = 1; i < polygon.length; i++) {
    const a = polygon[i - 1], b = polygon[i];
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const latMid = ((a.lat + b.lat) / 2) * Math.PI / 180;
    total += R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));
  }
  return total;
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

export function formatRelative(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
