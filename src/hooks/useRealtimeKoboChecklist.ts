/**
 * Real-time bridge: KoboToolbox → Integrated Supervisory Checklist dashboard.
 *
 * The Kobo webhook writes a row into `kobo_sync_events` for every inbound
 * submission (the same signal the Geo-enabled Microplanning dashboard uses).
 * Subscribing to those changes lets the checklist dashboard refresh itself the
 * instant a submission lands, without polling.
 *
 * Latency design (sub-second):
 *  - LEADING edge fire: the first event refreshes immediately (no waiting).
 *  - Short trailing coalesce window so a burst of submissions collapses into a
 *    single extra refresh instead of hammering the feed.
 *  - In-flight lock with a "dirty" flag: events that arrive during a refresh
 *    queue exactly one follow-up run.
 *  - Catch-up refresh whenever the socket (re)subscribes after a drop, so no
 *    event is silently missed while the tab was asleep or offline.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  /** Disable the subscription (e.g. user lacks permission). */
  enabled?: boolean;
  /** Trailing coalesce window so a burst of submissions triggers one refresh. */
  debounceMs?: number;
}

export function useRealtimeKoboChecklist(
  onChange: () => void | Promise<void>,
  { enabled = true, debounceMs = 400 }: Options = {},
) {
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let pending = 0;              // events observed since the last refresh started
    let latestEvent: Date | null = null;
    let subscribedOnce = false;
    let cancelled = false;

    /** One React state update per coalesce window, not one per event. */
    const flushEventState = () => {
      if (cancelled || !latestEvent) return;
      const at = latestEvent;
      latestEvent = null;
      setLastEventAt(at);
    };

    const run = async () => {
      if (cancelled || running) return;
      running = true;
      pending = 0;
      try { await cbRef.current?.(); }
      catch { /* refresh errors surface in the view */ }
      finally {
        running = false;
        // Anything that landed mid-refresh merges into a single follow-up run
        // scheduled at the end of the current window (never a tight loop).
        if (pending > 0 && !cancelled && !timer) {
          timer = setTimeout(() => { timer = null; flushEventState(); void run(); }, debounceMs);
        }
      }
    };

    /** Leading-edge trigger + trailing coalesce of the whole burst. */
    const trigger = () => {
      pending += 1;
      latestEvent = new Date();
      if (timer || running) return; // burst merges into the pending/queued run
      flushEventState();
      void run();
      timer = setTimeout(() => {
        timer = null;
        flushEventState();
        if (pending > 0) void run(); // one merged refresh for the whole burst
      }, debounceMs);
    };

    // Unique name per mount — avoids "cannot add postgres_changes callbacks
    // after subscribe()" on StrictMode double-mounts / HMR.
    const channel = supabase.channel(`isc-kobo-${Math.random().toString(36).slice(2, 10)}`);
    channel
      // Any change to the sync ledger: new submission, edit, or deletion.
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "kobo_sync_events" }, trigger)
      .subscribe((status) => {
        const up = status === "SUBSCRIBED";
        setConnected(up);
        if (up) {
          // Catch up on anything missed while the socket was down.
          if (subscribedOnce) void run();
          subscribedOnce = true;
        }
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, debounceMs]);


  return { lastEventAt, connected };
}

export default useRealtimeKoboChecklist;
