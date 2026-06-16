/**
 * BackgroundLocationTracker
 *
 * Mounted once at the app shell level so that, once a user opts in, their device
 * keeps tracing its GPS path continuously across tab navigation — "infinitely
 * till stopped by the same user". It reacts to the user's
 * `location_tracking_enabled` flag (including live changes from the consent
 * toggle) and starts/stops the watcher accordingly. Renders nothing.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocationTracking } from "@/hooks/useLocationTracking";

interface Props {
  userId: string | undefined;
  initialEnabled?: boolean;
}

const BackgroundLocationTracker = ({ userId, initialEnabled }: Props) => {
  const [enabled, setEnabled] = useState(!!initialEnabled);
  const { isTracking, start, stop } = useLocationTracking(userId);

  // Load + live-subscribe to the opt-in flag.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from("profiles")
      .select("location_tracking_enabled")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setEnabled(!!(data as any).location_tracking_enabled);
      });

    const channel = supabase
      .channel(`loc-consent-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          setEnabled(!!payload.new?.location_tracking_enabled);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Reconcile watcher with the flag.
  useEffect(() => {
    if (!userId) return;
    if (enabled && !isTracking) start();
    if (!enabled && isTracking) stop();
  }, [enabled, isTracking, userId, start, stop]);

  return null;
};

export default BackgroundLocationTracker;
