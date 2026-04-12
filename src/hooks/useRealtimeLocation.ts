import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RealtimePosition {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface MovementTrail {
  positions: RealtimePosition[];
  totalDistance: number;
  startedAt: number;
}

export const useRealtimeLocation = (
  userId: string | undefined,
  options?: { enabled?: boolean; intervalMs?: number }
) => {
  const [position, setPosition] = useState<RealtimePosition | null>(null);
  const [trail, setTrail] = useState<MovementTrail>({
    positions: [],
    totalDistance: 0,
    startedAt: Date.now(),
  });
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const enabled = options?.enabled ?? true;

  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startTracking = useCallback(() => {
    if (!navigator.geolocation || !enabled) return;

    setIsTracking(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: RealtimePosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        };
        setPosition(newPos);

        setTrail((prev) => {
          const last = prev.positions[prev.positions.length - 1];
          let addedDist = 0;
          if (last) {
            addedDist = haversine(last.lat, last.lng, newPos.lat, newPos.lng);
            // Skip if barely moved (< 2m) to reduce noise
            if (addedDist < 2) return prev;
          }
          return {
            ...prev,
            positions: [...prev.positions.slice(-500), newPos], // Keep last 500 points
            totalDistance: prev.totalDistance + addedDist,
          };
        });

        // Persist to field_activity (throttled)
        if (userId) {
          persistLocation(userId, newPos);
        }
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [userId, enabled]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Throttled persistence - max every 30s
  const lastPersistRef = useRef(0);
  const persistLocation = useCallback(
    async (uid: string, pos: RealtimePosition) => {
      const now = Date.now();
      if (now - lastPersistRef.current < 30000) return;
      lastPersistRef.current = now;

      try {
        await supabase.from("field_activity").insert({
          user_id: uid,
          form_id: "00000000-0000-0000-0000-000000000000", // system tracker
          location: {
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            speed: pos.speed,
            heading: pos.heading,
          },
          started_at: new Date(pos.timestamp).toISOString(),
        });
      } catch (e) {
        console.warn("Failed to persist location:", e);
      }
    },
    []
  );

  useEffect(() => {
    if (enabled && userId) {
      startTracking();
    }
    return () => stopTracking();
  }, [enabled, userId]);

  return {
    position,
    trail,
    isTracking,
    error,
    startTracking,
    stopTracking,
  };
};

export default useRealtimeLocation;
