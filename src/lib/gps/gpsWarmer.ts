/**
 * Global GPS pre-warming service.
 *
 * Problem: pages that need a precise device location (e.g. Coverage Evaluation
 * 3D) used to start acquiring GPS only *after* the user reached them, so the
 * "lock" took several seconds — the GNSS chip was cold and the first fix slow.
 *
 * Solution: keep a single, shared, low-cost geolocation watch alive across the
 * whole app. It keeps the OS location provider warm and continuously caches the
 * freshest fix in memory + localStorage. When the user finally opens a
 * location-critical page, an accurate, recent fix is *already available* and can
 * be applied instantly, while the high-accuracy stream refines in the
 * background.
 *
 * Scalability / "trillions of users": this is 100% client-side and per-device.
 * There is exactly ONE watch per browser tab no matter how many components ask
 * for it (reference counted), localStorage writes are throttled, and all work is
 * deferred to idle time — so it never blocks the main thread or the server.
 */

export interface WarmFix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

const WARM_KEY = "gps.warm.v1";
const LKG_KEY = "ces.lkg.v1"; // shared with CES "last known good" seeding
const PERSIST_THROTTLE_MS = 3000;
const FRESH_MS = 2 * 60 * 1000; // a warm fix is "fresh" for 2 minutes

let watchId: number | null = null;
let refCount = 0;
let latest: WarmFix | null = null;
let best: WarmFix | null = null;
let lastPersistAt = 0;
const subscribers = new Set<(fix: WarmFix) => void>();

const isFinitePair = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" && typeof lng === "number" &&
  Number.isFinite(lat) && Number.isFinite(lng);

function readKey(key: string): WarmFix | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!isFinitePair(v?.lat, v?.lng)) return null;
    return {
      lat: v.lat,
      lng: v.lng,
      accuracy: Number.isFinite(v?.accuracy) ? v.accuracy : 100,
      timestamp: Number.isFinite(v?.timestamp) ? v.timestamp : 0,
    };
  } catch {
    return null;
  }
}

// Hydrate in-memory cache from disk so the very first consumer (before any live
// fix lands) still gets an instant, if older, position.
function hydrate() {
  if (latest) return;
  const warm = readKey(WARM_KEY);
  const lkg = readKey(LKG_KEY);
  // Prefer the freshest stored fix as the "latest"; keep the most accurate as best.
  latest = warm ?? lkg;
  best = lkg && warm
    ? (lkg.accuracy <= warm.accuracy ? lkg : warm)
    : (lkg ?? warm);
}

function persist(fix: WarmFix) {
  const now = Date.now();
  if (now - lastPersistAt < PERSIST_THROTTLE_MS) return;
  lastPersistAt = now;
  // Defer disk write to idle time so a flood of fixes never janks the UI.
  const write = () => {
    try {
      localStorage.setItem(WARM_KEY, JSON.stringify(fix));
      if (best && (!readKey(LKG_KEY) || best.accuracy < (readKey(LKG_KEY)?.accuracy ?? Infinity))) {
        localStorage.setItem(LKG_KEY, JSON.stringify(best));
      }
    } catch {
      /* quota / private mode — in-memory cache still works */
    }
  };
  if (typeof (window as any).requestIdleCallback === "function") {
    (window as any).requestIdleCallback(write, { timeout: 1000 });
  } else {
    setTimeout(write, 0);
  }
}

function onPosition(pos: GeolocationPosition) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (!isFinitePair(lat, lng)) return;
  const fix: WarmFix = {
    lat,
    lng,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 100,
    timestamp: pos.timestamp || Date.now(),
  };
  latest = fix;
  if (!best || fix.accuracy <= best.accuracy) best = fix;
  persist(fix);
  // Notify live subscribers without blocking; isolate listener errors.
  subscribers.forEach((cb) => {
    try {
      cb(fix);
    } catch {
      /* ignore listener failure */
    }
  });
}

/** Start (or join) the shared warm watch. Returns a stop function. */
export function startGpsWarmer(): () => void {
  hydrate();
  refCount += 1;
  if (watchId === null && typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      // Single shared watch. enableHighAccuracy keeps the chip warm; a short
      // maximumAge lets the OS coalesce duplicate consumers efficiently.
      watchId = navigator.geolocation.watchPosition(
        onPosition,
        () => {
          /* errors are non-fatal here — consumers fall back to cache */
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
      );
    } catch {
      watchId = null;
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && watchId !== null) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        /* noop */
      }
      watchId = null;
    }
  };
}

/** Most recent cached fix (live or hydrated from disk). */
export function getWarmFix(): WarmFix | null {
  hydrate();
  return latest;
}

/** Best (most accurate) cached fix seen this session or on disk. */
export function getBestWarmFix(): WarmFix | null {
  hydrate();
  return best ?? latest;
}

/** A warm fix that is recent enough to lock onto instantly, else null. */
export function getFreshWarmFix(maxAgeMs = FRESH_MS): WarmFix | null {
  const fix = getWarmFix();
  if (!fix) return null;
  return Date.now() - fix.timestamp <= maxAgeMs ? fix : null;
}

/** Subscribe to live warm fixes. Returns an unsubscribe function. */
export function subscribeWarmFix(cb: (fix: WarmFix) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
