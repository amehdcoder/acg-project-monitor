/**
 * Real-time bridge: KoboToolbox → Integrated Supervisory Checklist dashboard.
 *
 * The Kobo webhook writes a row into `kobo_sync_events` for every inbound
 * submission (the same signal the Geo-enabled Microplanning dashboard uses).
 * Subscribing to those inserts lets the checklist dashboard refresh itself the
 * instant a submission lands, without polling.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  /** Disable the subscription (e.g. user lacks permission). */
  enabled?: boolean;
  /** Debounce window so a burst of submissions triggers a single refresh. */
  debounceMs?: number;
}

export function useRealtimeKoboChecklist(
  onChange: () => void | Promise<void>,
  { enabled = true, debounceMs = 1500 }: Options = {},
) {
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const trigger = () => {
      setLastEventAt(new Date());
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void cbRef.current?.(); }, debounceMs);
    };

    // Unique name per mount — avoids "cannot add postgres_changes callbacks
    // after subscribe()" on StrictMode double-mounts / HMR.
    const channel = supabase.channel(`isc-kobo-${Math.random().toString(36).slice(2, 10)}`);
    channel
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "kobo_sync_events" }, trigger)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, debounceMs]);

  return { lastEventAt, connected };
}

export default useRealtimeKoboChecklist;
