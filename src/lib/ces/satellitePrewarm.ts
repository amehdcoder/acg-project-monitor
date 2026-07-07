/**
 * Background satellite tile pre-warmer for Coverage Evaluation 3D (CES).
 *
 * Problem: when a supervisor opens the Household Coverage Survey module inside
 * the Integrated MDA Supervisory Checklist and taps a community, the CES
 * satellite map had to fetch imagery tiles from scratch — a visible freeze while
 * the basemap loaded.
 *
 * Solution: as soon as the checklist captures a GPS fix (and again as the device
 * moves), quietly prime the browser HTTP cache with the ArcGIS World Imagery
 * tiles that surround the current location, at the zoom levels CES uses. By the
 * time CES opens, the tiles are already cached and the satellite view locks
 * instantly.
 *
 * Design constraints (must NOT slow the app):
 *  - All work is deferred to idle time (requestIdleCallback) and heavily capped.
 *  - Tiles are deduped so we never refetch, and requests are low-priority.
 *  - Movement-based refinement only fires after the device moves a meaningful
 *    distance, and is debounced. It is 100% client-side and per-device.
 */

const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// CES-relevant zoom levels (village / rooftop scale). Kept small on purpose.
const ZOOM_LEVELS = [16, 17, 18];
// Ring radius in tiles around the centre tile per zoom (3x3, 3x3, 5x5-ish).
const RING_BY_ZOOM: Record<number, number> = { 16: 1, 17: 1, 18: 2 };
// Hard cap on tiles primed per pre-warm burst so we never hammer the network.
const MAX_TILES_PER_BURST = 60;
// Only re-warm once the device has moved at least this far (metres).
const MIN_MOVE_METERS = 120;
// Debounce movement-triggered warms.
const MOVE_DEBOUNCE_MS = 8000;

const primed = new Set<string>();
let lastWarmLat: number | null = null;
let lastWarmLng: number | null = null;
let lastWarmAt = 0;

function lngToTileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function idle(fn: () => void, timeout = 1500) {
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout });
  else setTimeout(fn, 0);
}

function fetchTile(url: string) {
  // Prime the browser HTTP cache without touching the DOM. `no-cors` is fine —
  // we only care that the response lands in cache for the <img> tiles later.
  try {
    fetch(url, { mode: "no-cors", cache: "force-cache", priority: "low" as any }).catch(() => {
      /* offline / blocked — CES will fetch normally later */
    });
  } catch {
    /* noop */
  }
}

/**
 * Pre-warm satellite tiles around a coordinate. Safe to call frequently — it is
 * deduped, capped and idle-scheduled, so it never blocks the UI.
 */
export function prewarmSatelliteAround(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (typeof window === "undefined") return;

  idle(() => {
    let count = 0;
    for (const z of ZOOM_LEVELS) {
      const cx = lngToTileX(lng, z);
      const cy = latToTileY(lat, z);
      const r = RING_BY_ZOOM[z] ?? 1;
      const maxTile = 2 ** z - 1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (count >= MAX_TILES_PER_BURST) return;
          const x = Math.min(maxTile, Math.max(0, cx + dx));
          const y = Math.min(maxTile, Math.max(0, cy + dy));
          const key = `${z}/${x}/${y}`;
          if (primed.has(key)) continue;
          primed.add(key);
          const url = SATELLITE_TILE_URL
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y));
          fetchTile(url);
          count++;
        }
      }
    }
  });

  lastWarmLat = lat;
  lastWarmLng = lng;
  lastWarmAt = Date.now();
}

/**
 * Movement-aware variant. Only re-warms once the device has moved far enough
 * and enough time has elapsed, so continuous GPS updates stay cheap.
 */
export function prewarmSatelliteOnMove(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const now = Date.now();
  if (lastWarmLat != null && lastWarmLng != null) {
    const moved = haversine(lastWarmLat, lastWarmLng, lat, lng);
    if (moved < MIN_MOVE_METERS && now - lastWarmAt < MOVE_DEBOUNCE_MS) return;
    if (now - lastWarmAt < MOVE_DEBOUNCE_MS) return;
  }
  prewarmSatelliteAround(lat, lng);
}
