/**
 * useInstantLocation — instant, cross-platform, environment-agnostic GPS.
 *
 * Design goals (works online, offline, indoors, dense canopy, old Androids):
 *
 *  • ZERO loading delay: on mount the hook hydrates from a fast client-side
 *    cache (localStorage + the shared in-memory gpsWarmer) so a coordinate is
 *    available synchronously — even fully offline.
 *
 *  • Passive poll-caching: while the app is open it refreshes and caches the
 *    last-known coordinate every 3 minutes. The poll is best-effort, idle-timed
 *    and never blocks the UI, so it cannot freeze / slow / crash the app.
 *
 *  • Aggressive multi-tiered live acquisition on demand:
 *      Tier 1 — high accuracy hardware GNSS  (enableHighAccuracy, 4000ms)
 *      Tier 2 — low accuracy network / WiFi / cell triangulation (3000ms)
 *      Tier 3 — last cached device coordinate (or the caller-provided geo
 *               center fallback), so we ALWAYS surface something.
 *
 *  • Rolling average of the last 3 high-accuracy fixes to smooth GPS drift that
 *    is common on cold-start / older Android devices.
 *
 *  • Cross-platform permission grace: "Precise" and "Approximate" iOS/Android
 *    responses are both handled without throwing or blocking form interaction.
 *
 * Every path is type-safe and wrapped in try/catch — a geolocation failure can
 * never break the form.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBestWarmFix,
  getFreshWarmFix,
  startGpsWarmer,
  subscribeWarmFix,
} from "@/lib/gps/gpsWarmer";

export type LocationSource =
  | "cached" // instant hydrate from local device cache
  | "high" // high precision live hardware fix
  | "network" // approximate network / WiFi / cell fix
  | "fallback" // geographic center fallback (no device fix at all)
  | "none";

export interface InstantCoord {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  source: LocationSource;
}

export interface GeoCenterFallback {
  lat: number;
  lng: number;
}

const CACHE_KEY = "instantLoc.v1";
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const FRESH_MS = 2 * 60 * 1000;
const TIER1_TIMEOUT = 4000;
const TIER2_TIMEOUT = 3000;
const ROLLING_WINDOW = 3;

const isFiniteNum = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

const readCache = (): InstantCoord | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!isFiniteNum(v?.lat) || !isFiniteNum(v?.lng)) return null;
    return {
      lat: v.lat,
      lng: v.lng,
      accuracy: isFiniteNum(v?.accuracy) ? v.accuracy : 100,
      timestamp: isFiniteNum(v?.timestamp) ? v.timestamp : 0,
      source: "cached",
    };
  } catch {
    return null;
  }
};

const writeCache = (c: InstantCoord) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        timestamp: c.timestamp,
      }),
    );
  } catch {
    /* quota / private mode — in-memory state still works */
  }
};

const statusLabel = (source: LocationSource): string => {
  switch (source) {
    case "cached":
      return "Instant (Cached)";
    case "high":
      return "High Precision (Live)";
    case "network":
      return "Approximate (Network)";
    case "fallback":
      return "Area Center (Fallback)";
    default:
      return "Locating…";
  }
};

interface Options {
  /** Geographic center of the selected Ward/Community as a Tier-3 fallback. */
  geoCenter?: GeoCenterFallback | null;
  /** Auto-run a live refresh once on mount (default true). */
  autoRefresh?: boolean;
}

export function useInstantLocation(options?: Options) {
  const { geoCenter = null, autoRefresh = true } = options || {};

  const [coord, setCoord] = useState<InstantCoord | null>(() => {
    // Instant hydrate: prefer cache, then the shared warm fix (both sync).
    const cached = readCache();
    if (cached) return cached;
    const warm = getFreshWarmFix() || getBestWarmFix();
    if (warm) {
      return {
        lat: warm.lat,
        lng: warm.lng,
        accuracy: warm.accuracy,
        timestamp: warm.timestamp,
        source: "cached",
      };
    }
    return null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const rollingRef = useRef<InstantCoord[]>([]);
  const geoCenterRef = useRef<GeoCenterFallback | null>(geoCenter);
  geoCenterRef.current = geoCenter;
  const mountedRef = useRef(true);

  const commit = useCallback((next: InstantCoord, cache: boolean) => {
    if (!mountedRef.current) return;
    setCoord(next);
    if (cache) writeCache(next);
  }, []);

  // Rolling average of the last N high-accuracy fixes to smooth GPS drift.
  const pushRolling = useCallback((c: InstantCoord): InstantCoord => {
    try {
      const buf = rollingRef.current;
      buf.push(c);
      while (buf.length > ROLLING_WINDOW) buf.shift();
      if (buf.length < 2) return c;
      const n = buf.length;
      const avgLat = buf.reduce((s, p) => s + p.lat, 0) / n;
      const avgLng = buf.reduce((s, p) => s + p.lng, 0) / n;
      const bestAcc = Math.min(...buf.map((p) => p.accuracy));
      return { ...c, lat: avgLat, lng: avgLng, accuracy: bestAcc };
    } catch {
      return c;
    }
  }, []);

  /** Multi-tiered live acquisition. Never rejects — always resolves best-effort. */
  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // No geolocation API at all — fall to cache / geo center.
      const cached = readCache();
      if (cached) commit({ ...cached, source: "cached" }, false);
      else if (geoCenterRef.current) {
        commit(
          {
            lat: geoCenterRef.current.lat,
            lng: geoCenterRef.current.lng,
            accuracy: 5000,
            timestamp: Date.now(),
            source: "fallback",
          },
          false,
        );
      }
      return;
    }

    if (mountedRef.current) setIsRefreshing(true);

    const getFix = (opts: PositionOptions) =>
      new Promise<GeolocationPosition | null>((resolve) => {
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(null),
            opts,
          );
        } catch {
          resolve(null);
        }
      });

    try {
      // Tier 1: maximum hardware precision.
      let pos = await getFix({
        enableHighAccuracy: true,
        timeout: TIER1_TIMEOUT,
        maximumAge: 0,
      });
      let source: LocationSource = "high";

      // Tier 2: low accuracy network/WiFi/cell triangulation.
      if (!pos) {
        pos = await getFix({
          enableHighAccuracy: false,
          timeout: TIER2_TIMEOUT,
          maximumAge: FRESH_MS,
        });
        source = "network";
      }

      if (pos && isFiniteNum(pos.coords?.latitude) && isFiniteNum(pos.coords?.longitude)) {
        const raw: InstantCoord = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: isFiniteNum(pos.coords.accuracy) ? pos.coords.accuracy : 100,
          timestamp: pos.timestamp || Date.now(),
          source,
        };
        const smoothed = source === "high" ? pushRolling(raw) : raw;
        commit(smoothed, true);
        return;
      }

      // Tier 3: last cached device coordinate.
      const cached = readCache() || (() => {
        const w = getBestWarmFix();
        return w
          ? {
              lat: w.lat,
              lng: w.lng,
              accuracy: w.accuracy,
              timestamp: w.timestamp,
              source: "cached" as LocationSource,
            }
          : null;
      })();
      if (cached) {
        commit({ ...cached, source: "cached" }, false);
        return;
      }

      // Tier 3b: geographic center of the selected Ward/Community.
      if (geoCenterRef.current) {
        commit(
          {
            lat: geoCenterRef.current.lat,
            lng: geoCenterRef.current.lng,
            accuracy: 5000,
            timestamp: Date.now(),
            source: "fallback",
          },
          false,
        );
      }
    } catch {
      /* swallow — cache/fallback already handled */
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [commit, pushRolling]);

  // Keep the shared GPS provider warm + live-adopt any more accurate fix.
  useEffect(() => {
    mountedRef.current = true;
    const stopWarmer = startGpsWarmer();
    const unsub = subscribeWarmFix((fix) => {
      setCoord((prev) => {
        if (prev && prev.source === "high") return prev; // don't downgrade
        if (prev && fix.accuracy > prev.accuracy) return prev;
        return {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          timestamp: fix.timestamp,
          source: "cached",
        };
      });
    });
    return () => {
      mountedRef.current = false;
      try {
        unsub();
        stopWarmer();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Passive 3-minute poll-cache. Idle-timed & guarded so it never janks the UI.
  useEffect(() => {
    if (autoRefresh) {
      // defer the first live refresh so mount stays instant.
      const t = setTimeout(() => void refresh(), 300);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = setInterval(() => {
        try {
          const w = (window as any);
          if (typeof w.requestIdleCallback === "function") {
            w.requestIdleCallback(() => void refresh(), { timeout: 2000 });
          } else {
            void refresh();
          }
        } catch {
          /* noop */
        }
      }, POLL_INTERVAL_MS);
      return () => {
        clearTimeout(t);
        clearInterval(id);
      };
    }
  }, [autoRefresh, refresh]);

  return {
    coord,
    source: coord?.source ?? "none",
    statusLabel: statusLabel(coord?.source ?? "none"),
    accuracy: coord?.accuracy ?? null,
    isRefreshing,
    refresh,
  };
}

export default useInstantLocation;
