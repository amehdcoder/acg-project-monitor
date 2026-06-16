/**
 * useLocationTracking — opt-in, infinite background path tracking for the
 * current user (device).
 *
 * Behaviour:
 *  - Uses navigator.geolocation.watchPosition for a continuous GPS stream that
 *    keeps running until the user explicitly stops it.
 *  - Every fix is appended to a local IndexedDB path (so trails survive offline)
 *    and broadcast over the Supabase Realtime channel `live-tracking` for smooth
 *    live movement on the admin dashboard.
 *  - Fixes are persisted to the `locations` table (throttled). When offline they
 *    are queued in IndexedDB and flushed automatically when connectivity returns.
 *  - Works fully offline: GPS keeps tracing and the local path keeps growing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  appendToPath,
  queuePoint,
  getQueuedPoints,
  removeQueuedPoints,
  type LocationPoint,
} from "@/lib/locationOfflineQueue";

const DB_PERSIST_INTERVAL_MS = 5000; // align with the 5s live-update cadence
const CHANNEL = "live-tracking";

interface BatteryManagerLike {
  level: number;
  addEventListener?: (t: string, cb: () => void) => void;
}

async function readBattery(): Promise<number | null> {
  try {
    const navAny = navigator as any;
    if (typeof navAny.getBattery === "function") {
      const b: BatteryManagerLike = await navAny.getBattery();
      return Math.round((b.level ?? 0) * 100);
    }
  } catch {
    /* unsupported */
  }
  return null;
}

export function useLocationTracking(userId: string | undefined) {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [pointCount, setPointCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastPersistRef = useRef(0);
  const batteryRef = useRef<number | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Flush any queued offline points to Supabase.
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const queued = await getQueuedPoints();
      if (!queued.length) return;
      const rows = queued.map(({ id, ...rest }) => rest);
      const { error: insErr } = await supabase.from("locations").insert(rows as any);
      if (!insErr) {
        await removeQueuedPoints(queued.map((q) => q.id));
      }
    } catch (e) {
      console.warn("Location queue flush failed", e);
    }
  }, []);

  const handleFix = useCallback(
    async (pos: GeolocationPosition) => {
      const uid = userIdRef.current;
      if (!uid) return;
      const nowIso = new Date(pos.timestamp || Date.now()).toISOString();
      const point: LocationPoint = {
        user_id: uid,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        altitude: pos.coords.altitude ?? null,
        battery_level: batteryRef.current,
        recorded_at: nowIso,
      };

      setLastFixAt(Date.now());
      setPointCount((c) => c + 1);

      // 1) Always trace locally (offline-safe path).
      await appendToPath(uid, point.latitude, point.longitude, nowIso);

      // 2) Broadcast live for smooth admin animation (best-effort).
      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "position",
          payload: point,
        });
      } catch {
        /* offline / not subscribed */
      }

      // 3) Persist (throttled) — online insert or offline queue.
      const now = Date.now();
      if (now - lastPersistRef.current >= DB_PERSIST_INTERVAL_MS) {
        lastPersistRef.current = now;
        if (navigator.onLine) {
          const { error: insErr } = await supabase.from("locations").insert(point as any);
          if (insErr) await queuePoint(point);
        } else {
          await queuePoint(point);
        }
      }
    },
    []
  );

  const start = useCallback(async () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }
    const uid = userIdRef.current;
    if (!uid) return;

    setError(null);
    batteryRef.current = await readBattery();

    // Persist opt-in flag.
    await supabase.from("profiles").update({ location_tracking_enabled: true } as any).eq("user_id", uid);

    // Subscribe to broadcast channel for live emission.
    if (!channelRef.current) {
      channelRef.current = supabase.channel(CHANNEL, { config: { broadcast: { ack: false } } });
      channelRef.current.subscribe();
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleFix(pos),
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    setIsTracking(true);
    flushQueue();
  }, [handleFix, flushQueue]);

  const stop = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsTracking(false);
    const uid = userIdRef.current;
    if (uid) {
      await supabase.from("profiles").update({ location_tracking_enabled: false } as any).eq("user_id", uid);
    }
  }, []);

  // Auto-flush queued points whenever we regain connectivity.
  useEffect(() => {
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  // Cleanup on unmount (without flipping the opt-in flag).
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  return { isTracking, error, lastFixAt, pointCount, start, stop };
}

export default useLocationTracking;
