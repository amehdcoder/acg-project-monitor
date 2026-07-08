/**
 * Background satellite tile pre-warmer for Coverage Evaluation 3D (CES).
 *
 * Problem: when a supervisor opens the Household Coverage Survey module inside
 * the Integrated MDA Supervisory Checklist and taps a community, the CES
 * satellite map had to fetch imagery tiles from scratch — a visible freeze while
 * the basemap loaded.
 *
 * Solution: as soon as the checklist captures a GPS fix (and again as the device
 * moves), quietly prime the browser HTTP + service-worker tile cache with the
 * ArcGIS World Imagery tiles (AND the Esri reference-label overlay) that
 * surround the current location, at the exact zoom levels CES uses. By the time
 * CES opens, the tiles are already cached and the satellite view locks
 * instantly. We also persist the latest warmed centre so CES/Household maps can
 * initialise on the correct coordinate immediately, before their own GPS
 * resolves.
 *
 * Design constraints (must NOT slow the app):
 *  - All work is deferred to idle time (requestIdleCallback) and heavily capped.
 *  - Tiles are deduped so we never refetch, and requests are low-priority.
 *  - It piggybacks on the single shared GPS warmer (no extra geolocation watch),
 *    so continuous location updates stay cheap and battery-friendly.
 *  - Movement-based refinement only fires after the device moves a meaningful
 *    distance, and is debounced. It is 100% client-side and per-device.
 */

import {
  startGpsWarmer,
  subscribeWarmFix,
  getWarmFix,
} from "@/lib/gps/gpsWarmer";

// Must match the URLs CES uses so the service-worker CacheFirst entry is reused.
const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// CES-relevant zoom levels (village / rooftop scale). Kept small on purpose.
const ZOOM_LEVELS = [16, 17, 18, 19];
// Ring radius in tiles around the centre tile per zoom.
const RING_BY_ZOOM: Record<number, number> = { 16: 1, 17: 1, 18: 2, 19: 2 };
// Hard cap on tiles primed per pre-warm burst so we never hammer the network.
const MAX_TILES_PER_BURST = 90;
// Only re-warm once the device has moved at least this far (metres).
const MIN_MOVE_METERS = 120;
// Debounce movement-triggered warms.
const MOVE_DEBOUNCE_MS = 8000;
// Persisted "last warmed centre" so maps can lock instantly on open.
const PREWARM_CENTER_KEY = "ces.prewarm.center.v1";

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
  // Prime the browser HTTP + service-worker cache without touching the DOM.
  // `no-cors` is fine — the CacheFirst service worker stores the opaque
  // response and replays it for the <img> tiles CES requests later.
  try {
    fetch(url, { mode: "no-cors", cache: "force-cache", priority: "low" as any }).catch(() => {
      /* offline / blocked — CES will fetch normally later */
    });
  } catch {
    /* noop */
  }
}

/** Persist the most recently warmed centre so maps can lock onto it instantly. */
export function getLastPrewarmCenter(): { lat: number; lng: number; ts: number } | null {
  if (lastWarmLat != null && lastWarmLng != null) {
    return { lat: lastWarmLat, lng: lastWarmLng, ts: lastWarmAt };
  }
  try {
    const raw = localStorage.getItem(PREWARM_CENTER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (Number.isFinite(v?.lat) && Number.isFinite(v?.lng)) {
      return { lat: v.lat, lng: v.lng, ts: Number.isFinite(v?.ts) ? v.ts : 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistCenter(lat: number, lng: number, ts: number) {
  idle(() => {
    try {
      localStorage.setItem(PREWARM_CENTER_KEY, JSON.stringify({ lat, lng, ts }));
    } catch {
      /* quota / private mode — in-memory value still works */
    }
  });
}

/**
 * Pre-warm satellite + label tiles around a coordinate. Safe to call frequently
 * — it is deduped, capped and idle-scheduled, so it never blocks the UI.
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
          const rep = (tpl: string) =>
            tpl
              .replace("{z}", String(z))
              .replace("{x}", String(x))
              .replace("{y}", String(y));
          // Imagery first, then the label overlay CES draws on top of it.
          fetchTile(rep(SATELLITE_TILE_URL));
          // Labels exist only up to z19 on Esri; guard just in case.
          if (z <= 19) fetchTile(rep(LABELS_TILE_URL));
          count++;
        }
      }
    }
  });

  lastWarmLat = lat;
  lastWarmLng = lng;
  lastWarmAt = Date.now();
  persistCenter(lat, lng, lastWarmAt);
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

/**
 * Attach the satellite pre-warmer to the single shared GPS warmer. Whenever the
 * device reports a fix (including the GPS captured while filling the MDA
 * checklist), the surrounding CES tiles are primed and refined as the device
 * moves — with NO extra geolocation watch of our own.
 *
 * Returns a stop function; call it on unmount to release the shared warmer.
 */
export function startSatellitePrewarmFromGps(): () => void {
  if (typeof window === "undefined") return () => {};
  // Keep the shared OS location provider warm (ref-counted, one watch app-wide).
  const stopWarmer = startGpsWarmer();
  // Prime immediately from any cached fix so CES is ready even before a new one.
  const cached = getWarmFix();
  if (cached) prewarmSatelliteAround(cached.lat, cached.lng);
  // Refine as the device moves.
  const unsub = subscribeWarmFix((fix) => prewarmSatelliteOnMove(fix.lat, fix.lng));
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try { unsub(); } catch { /* noop */ }
    try { stopWarmer(); } catch { /* noop */ }
  };
}
