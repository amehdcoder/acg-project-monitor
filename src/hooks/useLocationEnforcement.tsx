/**
 * Global Location Enforcement Hook
 *
 * Implements the policy:
 *  - Block any form open until device location services are enabled with
 *    high-accuracy permission (re-checks every 5s while gated).
 *  - Silently capture GPS the moment a form opens via getCurrentPosition w/
 *    enableHighAccuracy: true. Stores under form_metadata.auto_gps.
 *  - Toast "Location secured" when accuracy < 30m. Block form if GPS fails twice.
 *  - Watch for mid-form permission revoke / disable → block submission.
 *  - Reverse-geocodes admin chain offline using cached GRID3 dataset.
 *
 * Uses Capacitor Geolocation (falls back to web Geolocation API on browser).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Geolocation, type Position, type PermissionStatus } from "@capacitor/geolocation";
import { toast } from "@/hooks/use-toast";
import {
  preloadOfflineGeocoder,
  reverseGeocode,
  type ReverseGeocodeResult,
} from "@/lib/locationEnforcement/reverseGeocoder";

export type GateStatus =
  | "checking"            // initial permission probe
  | "permission_denied"   // user denied → show modal w/ settings link
  | "services_off"        // OS/browser location off → show modal
  | "capturing"           // permission OK, getting first fix
  | "ready"               // we have a usable fix
  | "failed"              // 2 attempts exhausted → block form
  | "stale";              // permission revoked mid-form

export interface AutoGpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface FormLocationMetadata {
  auto_gps: AutoGpsFix | null;
  auto_gps_used: boolean;
  gps_question_used: boolean;
  final_admin_levels_source: "auto_gps" | "gps_question" | "none";
  gps_accuracy_m: number | null;
  location_capture_timestamp: string | null;
  resolved_admin: ReverseGeocodeResult | null;
}

const ACCURACY_GOOD_M = 30;
const ACCURACY_HARD_LIMIT_M = 100;
const RECHECK_INTERVAL_MS = 5000;
const CAPTURE_TIMEOUT_MS = 30000;        // hard ceiling on a single attempt
const MAX_CAPTURE_ATTEMPTS = 2;

// === Convergence sampler tuning ===
// The first fix from any device almost always comes from coarse network/cell
// providers (often ±500–2000m). True GNSS satellite locks take 5–15s of cold
// start. We MUST sample over a window and pick the best fix instead of
// blindly accepting the first one.
const CONVERGE_MIN_WINDOW_MS = 8000;     // always wait at least this long
const CONVERGE_MAX_WINDOW_MS = 22000;    // give up waiting after this
const CONVERGE_TARGET_ACCURACY_M = 20;   // stop early once we hit ≤20m
const CONVERGE_ACCEPTABLE_M = 50;        // acceptable early-stop after min window
const STALE_FIX_REJECT_AGE_MS = 8000;    // ignore Capacitor cached fixes older than this
const MIN_IMPROVEMENT_M = 5;             // require ≥5m better OR fresher than 30s to replace

/**
 * Probe current permission state. Capacitor returns "granted" | "denied" | "prompt".
 * Web fallback uses navigator.permissions when available.
 */
async function probePermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  try {
    // @ts-ignore Capacitor exposes checkPermissions on both web + native
    const status: PermissionStatus = await Geolocation.checkPermissions();
    const v = (status as any).location || (status as any).coarseLocation;
    if (v === "granted") return "granted";
    if (v === "denied") return "denied";
    if (v === "prompt" || v === "prompt-with-rationale") return "prompt";
  } catch (_) {
    // fall through
  }
  if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
    try {
      const res = await (navigator as any).permissions.query({ name: "geolocation" });
      return res.state as any;
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}

/**
 * Request a high-accuracy fix. Resolves with Position or rejects with code.
 * Uses Capacitor Geolocation.getCurrentPosition (works on web + native).
 */
async function getHighAccuracyFix(): Promise<Position> {
  return await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: CAPTURE_TIMEOUT_MS,
    maximumAge: 0,
  });
}

interface Options {
  /** Set false on the gate's first mount until user explicitly opens the form */
  enabled?: boolean;
}

export function useLocationEnforcement(opts: Options = {}) {
  const enabled = opts.enabled !== false;

  const [status, setStatus] = useState<GateStatus>("checking");
  const [autoGps, setAutoGps] = useState<AutoGpsFix | null>(null);
  const [resolved, setResolved] = useState<ReverseGeocodeResult | null>(null);
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const securedToastShown = useRef(false);
  const watchIdRef = useRef<string | null>(null);
  const recheckTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-cache GRID3 dataset on mount so the SW stores it for offline reuse.
  useEffect(() => {
    preloadOfflineGeocoder();
  }, []);

  /** Run a single fix attempt; returns true if a usable fix was obtained. */
  const tryCapture = useCallback(async (): Promise<boolean> => {
    setStatus("capturing");
    try {
      const pos = await getHighAccuracyFix();
      const fix: AutoGpsFix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 9999,
        altitude: pos.coords.altitude ?? null,
        timestamp: pos.timestamp || Date.now(),
      };
      setAutoGps(fix);
      // Resolve admin chain offline
      try {
        const r = await reverseGeocode(fix.lat, fix.lng);
        setResolved(r);
      } catch (e) {
        console.warn("[locationEnforcement] reverseGeocode failed", e);
      }
      setStatus("ready");
      if (!securedToastShown.current && fix.accuracy <= ACCURACY_GOOD_M) {
        securedToastShown.current = true;
        toast({
          title: "📍 Location secured",
          description: `Accuracy ±${Math.round(fix.accuracy)}m`,
        });
      }
      return true;
    } catch (err: any) {
      console.warn("[locationEnforcement] capture failed", err);
      const code = err?.code;
      if (code === 1 /* PERMISSION_DENIED */ || /denied/i.test(String(err?.message))) {
        setStatus("permission_denied");
        return false;
      }
      // Position unavailable / timeout
      return false;
    }
  }, []);

  /** Full enforcement pipeline: permission → capture (up to 2 attempts) */
  const runEnforcement = useCallback(async () => {
    const perm = await probePermission();
    if (perm === "denied") {
      setStatus("permission_denied");
      return;
    }
    if (perm === "unsupported") {
      setStatus("services_off");
      return;
    }

    // 1st attempt
    const ok1 = await tryCapture();
    if (ok1) return;
    setCaptureAttempts(1);

    // 2nd attempt
    const ok2 = await tryCapture();
    if (ok2) return;
    setCaptureAttempts(2);
    setStatus("failed");
    toast({
      title: "GPS unavailable",
      description: "Could not get a precise fix after 2 attempts. Move outdoors and reopen the form.",
      variant: "destructive",
    });
  }, [tryCapture]);

  // Kick off enforcement once enabled.
  useEffect(() => {
    if (!enabled) return;
    runEnforcement();
  }, [enabled, runEnforcement]);

  // While gated (denied / services_off), re-check every 5s so that as soon as the
  // user enables location in OS settings + returns to the app the form unlocks.
  useEffect(() => {
    if (!enabled) return;
    if (status !== "permission_denied" && status !== "services_off") {
      if (recheckTimer.current) {
        clearInterval(recheckTimer.current);
        recheckTimer.current = null;
      }
      return;
    }
    if (recheckTimer.current) return;
    recheckTimer.current = setInterval(async () => {
      const perm = await probePermission();
      if (perm === "granted" || perm === "prompt") {
        runEnforcement();
      }
    }, RECHECK_INTERVAL_MS);
    return () => {
      if (recheckTimer.current) {
        clearInterval(recheckTimer.current);
        recheckTimer.current = null;
      }
    };
  }, [enabled, status, runEnforcement]);

  // Watch for permission revoke mid-form. We poll permissions every 10s once ready.
  useEffect(() => {
    if (!enabled || status !== "ready") return;
    const id = setInterval(async () => {
      const perm = await probePermission();
      if (perm === "denied") {
        setStatus("stale");
        toast({
          title: "Location disabled",
          description: "You disabled location during this form. Submission is now blocked until re-enabled.",
          variant: "destructive",
        });
      }
    }, 10000);
    return () => clearInterval(id);
  }, [enabled, status]);

  // Continuous high-accuracy watch to keep autoGps fresh while the form is open.
  useEffect(() => {
    if (!enabled || status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 },
          (pos, err) => {
            if (cancelled || !pos) return;
            const fix: AutoGpsFix = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? 9999,
              altitude: pos.coords.altitude ?? null,
              timestamp: pos.timestamp || Date.now(),
            };
            // Only replace if accuracy is same-or-better, or older than 30s
            setAutoGps((prev) =>
              !prev || fix.accuracy <= prev.accuracy || Date.now() - prev.timestamp > 30000
                ? fix
                : prev
            );
          }
        );
        watchIdRef.current = id;
      } catch (e) {
        console.warn("[locationEnforcement] watchPosition failed", e);
      }
    })();
    return () => {
      cancelled = true;
      if (watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {});
        watchIdRef.current = null;
      }
    };
  }, [enabled, status]);

  /**
   * Build the metadata payload to attach to a form submission.
   *
   * `gpsQuestionPos` is the coordinate the user captured via a geopoint
   * question (if the form has one). When present it OVERRIDES auto_gps for
   * downstream admin-level resolution — the user-captured point wins.
   */
  const buildMetadata = useCallback(
    async (gpsQuestionPos: { lat: number; lng: number; accuracy?: number } | null): Promise<FormLocationMetadata> => {
      const useQuestion = !!gpsQuestionPos;
      let resolvedFinal: ReverseGeocodeResult | null = resolved;
      if (useQuestion) {
        try {
          resolvedFinal = await reverseGeocode(gpsQuestionPos!.lat, gpsQuestionPos!.lng);
        } catch (e) {
          console.warn("[locationEnforcement] question-pos reverseGeocode failed", e);
        }
      }
      const accuracy = useQuestion ? (gpsQuestionPos?.accuracy ?? null) : autoGps?.accuracy ?? null;
      return {
        auto_gps: autoGps,
        auto_gps_used: !useQuestion,
        gps_question_used: useQuestion,
        final_admin_levels_source: useQuestion ? "gps_question" : autoGps ? "auto_gps" : "none",
        gps_accuracy_m: typeof accuracy === "number" ? Math.round(accuracy) : null,
        location_capture_timestamp: new Date().toISOString(),
        resolved_admin: resolvedFinal,
      };
    },
    [autoGps, resolved]
  );

  /** Re-resolve admin chain from a freshly-captured geopoint answer. */
  const resolveFromQuestion = useCallback(async (lat: number, lng: number) => {
    try {
      const r = await reverseGeocode(lat, lng);
      setResolved(r);
      return r;
    } catch {
      return null;
    }
  }, []);

  const canSubmit =
    status === "ready" &&
    !!autoGps &&
    autoGps.accuracy <= ACCURACY_HARD_LIMIT_M;

  const blockReason: string | null = (() => {
    if (status === "stale") return "Location was disabled during this form. Re-enable to submit.";
    if (status === "permission_denied" || status === "services_off")
      return "Device location must be enabled to submit.";
    if (status === "failed") return "GPS could not be acquired. Move outdoors and reopen the form.";
    if (!autoGps) return "Waiting for first GPS fix.";
    if (autoGps.accuracy > ACCURACY_HARD_LIMIT_M)
      return `GPS accuracy too low (±${Math.round(autoGps.accuracy)}m). Required: ±${ACCURACY_HARD_LIMIT_M}m or better.`;
    return null;
  })();

  return {
    status,
    autoGps,
    resolved,
    captureAttempts,
    canSubmit,
    blockReason,
    buildMetadata,
    resolveFromQuestion,
    retry: runEnforcement,
  };
}

export const ACCURACY_GOOD_THRESHOLD = ACCURACY_GOOD_M;
export const ACCURACY_HARD_LIMIT = ACCURACY_HARD_LIMIT_M;
