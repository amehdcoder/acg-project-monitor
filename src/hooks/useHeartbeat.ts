import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 60_000; // 1 minute

/**
 * Periodically updates the current user's `last_seen_at` in profiles
 * so the supervisor dashboard can determine real online/offline status.
 */
export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() } as any)
        .eq("user_id", user.id);
    };

    // Fire immediately on mount, then every minute
    beat();
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
