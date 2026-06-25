import { useState, useCallback, useEffect, useRef } from "react";

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface GeolocationState {
  position: GeolocationPosition | null;
  error: string | null;
  isLoading: boolean;
  isWatching: boolean;
}

/**
 * Geolocation hook tuned for INSTANT + ACCURATE acquisition in every
 * environment (indoors, outdoors, online, offline, desktop or mobile).
 *
 * Strategy when getCurrentPosition() is called:
 *  1. INSTANT: immediately request a cached fix (maximumAge = ∞, timeout ~1s).
 *     The browser returns the last known position with zero hardware wait, so
 *     the UI shows coordinates instantly even offline / indoors.
 *  2. REFINE: in parallel open a high-accuracy watchPosition that streams GNSS
 *     fixes. Each fix that is MORE accurate than the current one is committed,
 *     so the displayed position keeps sharpening toward the true location.
 *  3. SETTLE: once we reach GOOD_ACCURACY_M (≤25m) or REFINE_WINDOW_MS elapses
 *     after the first fix, we stop refining to save battery — keeping whatever
 *     best fix we have. We never block waiting for perfect accuracy.
 *  4. FALLBACK: if nothing at all arrives within COARSE_WINDOW_MS, fire a
 *     coarse (network/WiFi) request so we always surface something fast.
 *  5. Hard ceiling at TOTAL_TIMEOUT_MS. Only then do we surface an error.
 */

const COARSE_WINDOW_MS = 2500; // if no fix yet, try coarse/network position
const REFINE_WINDOW_MS = 8000; // keep sharpening up to 8s after first fix
const TOTAL_TIMEOUT_MS = 30000;
const GOOD_ACCURACY_M = 25; // stop refining once this good
const INSTANT_MAX_AGE_MS = 10 * 60 * 1000; // accept cached fixes up to 10 min old

export const useGeolocation = (options?: PositionOptions) => {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    isLoading: false,
    isWatching: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const acquisitionRef = useRef<{
    watchId: number | null;
    timers: ReturnType<typeof setTimeout>[];
    settled: boolean;
  } | null>(null);

  const commitPosition = useCallback((p: globalThis.GeolocationPosition) => {
    setState((prev) => ({
      ...prev,
      position: {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        altitude: p.coords.altitude,
        timestamp: p.timestamp,
      },
      error: null,
      isLoading: false,
    }));
  }, []);

  const cleanupAcquisition = useCallback(() => {
    const a = acquisitionRef.current;
    if (!a) return;
    if (a.watchId !== null) {
      try {
        navigator.geolocation.clearWatch(a.watchId);
      } catch {
        /* noop */
      }
    }
    a.timers.forEach((t) => clearTimeout(t));
    acquisitionRef.current = null;
  }, []);

  const settle = useCallback(
    (result:
      | { ok: true; pos: globalThis.GeolocationPosition }
      | { ok: false; error: string }) => {
      const a = acquisitionRef.current;
      if (!a || a.settled) return;
      a.settled = true;
      cleanupAcquisition();
      if (result.ok === true) {
        commitPosition(result.pos);
      } else {
        const msg = result.error;
        setState((prev) => ({ ...prev, error: msg, isLoading: false }));
      }
    },
    [cleanupAcquisition, commitPosition]
  );

  const errorMessage = (err: GeolocationPositionError): string => {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return "Location permission denied. Please enable location access in your browser/OS settings.";
      case err.POSITION_UNAVAILABLE:
        return "Location unavailable. Move outdoors or near a window and try again.";
      case err.TIMEOUT:
        return "Could not get a GPS fix. If you're on a desktop or indoors, accuracy may be limited — try again outside.";
      default:
        return "Unable to retrieve location.";
    }
  };

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
        isLoading: false,
      }));
      return;
    }

    // Cancel any in-flight acquisition
    cleanupAcquisition();
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const acq: { watchId: number | null; timers: ReturnType<typeof setTimeout>[]; settled: boolean } = {
      watchId: null,
      timers: [],
      settled: false,
    };
    acquisitionRef.current = acq;

    const highAccOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: TOTAL_TIMEOUT_MS,
      maximumAge: 0,
      ...options,
    };

    // 1) Watch for the FIRST fix to arrive — much faster than waiting for the
    //    requested accuracy with getCurrentPosition.
    try {
      acq.watchId = navigator.geolocation.watchPosition(
        (pos) => settle({ ok: true, pos }),
        () => {
          /* swallow — fallback path will handle */
        },
        highAccOptions
      );
    } catch {
      /* noop */
    }

    // 2) Parallel one-shot in case the watch is slow to fire on this platform
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => settle({ ok: true, pos }),
        () => {
          /* fallback below handles */
        },
        highAccOptions
      );
    } catch {
      /* noop */
    }

    // 3) After HIGH_ACC_WINDOW_MS without a fix, kick off a coarse/cached fallback
    const fallbackTimer = setTimeout(() => {
      if (acq.settled) return;
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => settle({ ok: true, pos }),
          (err) => {
            if (acq.settled) return;
            settle({ ok: false, error: errorMessage(err) });
          },
          {
            enableHighAccuracy: false,
            timeout: FALLBACK_TIMEOUT_MS,
            maximumAge: FALLBACK_MAX_AGE_MS,
          }
        );
      } catch {
        settle({ ok: false, error: "Unable to retrieve location." });
      }
    }, HIGH_ACC_WINDOW_MS);
    acq.timers.push(fallbackTimer);

    // 4) Hard ceiling
    const hardTimer = setTimeout(() => {
      if (acq.settled) return;
      settle({
        ok: false,
        error:
          "Could not get a GPS fix in time. If you're on desktop, your device may not have GPS hardware — try on a mobile device outdoors.",
      });
    }, TOTAL_TIMEOUT_MS);
    acq.timers.push(hardTimer);
  }, [cleanupAcquisition, options, settle]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: "Geolocation is not supported by your browser",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isWatching: true, error: null }));
    watchIdRef.current = navigator.geolocation.watchPosition(
      commitPosition,
      (err) => {
        setState((prev) => ({ ...prev, error: errorMessage(err) }));
      },
      {
        enableHighAccuracy: true,
        timeout: TOTAL_TIMEOUT_MS,
        maximumAge: 0,
        ...options,
      }
    );
  }, [commitPosition, options]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, isWatching: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      cleanupAcquisition();
    };
  }, [cleanupAcquisition]);

  return {
    ...state,
    getCurrentPosition,
    startWatching,
    stopWatching,
  };
};

export default useGeolocation;
