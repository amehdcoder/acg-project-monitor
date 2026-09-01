/**
 * Shared realtime sync engine.
 *
 * This is the same latency design proven on the Integrated Supervisory
 * Checklist Dashboard, factored out so every admin surface (microplans,
 * grantees, submissions) syncs with the same guarantees:
 *
 *  - LEADING edge fire: the first event refreshes immediately (no waiting).
 *  - Trailing coalesce window so a burst of rows collapses into ONE extra run.
 *  - In-flight lock + dirty flag: events during a refresh queue exactly one
 *    follow-up run (never a tight loop, never a stampede).
 *  - Catch-up refresh on (re)subscribe, on tab focus and on network recovery,
 *    so nothing is silently missed while the socket was down.
 *  - Fallback polling when the websocket is not connected.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimeTableSpec {
  table: string;
  /** postgres_changes event; defaults to "*". */
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  /** PostgREST filter, e.g. `project_id=eq.<id>`. */
  filter?: string;
  /** Optional predicate — return false to ignore the payload. */
  accept?: (payload: any) => boolean;
}

export interface RealtimeTablesOptions {
  enabled?: boolean;
  /** Trailing coalesce window (ms). */
  debounceMs?: number;
  /** Fallback poll while the socket is connected (ms). 0 disables. */
  pollMs?: number;
  /** Fallback poll while the socket is down (ms). 0 disables. */
  offlinePollMs?: number;
  /** Refresh when the tab regains focus. */
  refreshOnFocus?: boolean;
  /** Channel name prefix (debugging only). */
  name?: string;
}

export function useRealtimeTables(
  specs: RealtimeTableSpec[],
  onChange: () => void | Promise<void>,
  {
    enabled = true,
    debounceMs = 250,
    pollMs = 45_000,
    offlinePollMs = 12_000,
    refreshOnFocus = true,
    name = "rt",
  }: RealtimeTablesOptions = {},
) {
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);

  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  // Specs are re-created on every render by callers; key on their shape so the
  // subscription is only rebuilt when it actually changes.
  const specKey = JSON.stringify(
    specs.map((s) => [s.table, s.event ?? "*", s.filter ?? ""]),
  );
  const specsRef = useRef(specs);
  specsRef.current = specs;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let running = false;
    let pending = 0;
    let latestEvent: Date | null = null;
    let subscribedOnce = false;
    let cancelled = false;
    let socketUp = false;

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
      catch { /* refresh errors surface in the calling view */ }
      finally {
        running = false;
        if (pending > 0 && !cancelled && !timer) {
          timer = setTimeout(() => { timer = null; flushEventState(); void run(); }, debounceMs);
        }
      }
    };

    const trigger = () => {
      pending += 1;
      latestEvent = new Date();
      if (timer || running) return; // burst merges into the queued run
      flushEventState();
      void run();
      timer = setTimeout(() => {
        timer = null;
        flushEventState();
        if (pending > 0) void run();
      }, debounceMs);
    };

    const schedulePoll = () => {
      if (poll) { clearInterval(poll); poll = null; }
      const every = socketUp ? pollMs : offlinePollMs;
      if (!every) return;
      poll = setInterval(() => { if (!document.hidden) void run(); }, every);
    };

    // Unique channel name per mount — avoids "cannot add postgres_changes
    // callbacks after subscribe()" on StrictMode double-mounts / HMR.
    const channel = supabase.channel(`${name}-${Math.random().toString(36).slice(2, 10)}`);

    for (const spec of specsRef.current) {
      channel.on(
        "postgres_changes" as any,
        {
          event: spec.event ?? "*",
          schema: "public",
          table: spec.table,
          ...(spec.filter ? { filter: spec.filter } : {}),
        },
        (payload: any) => {
          const idx = specsRef.current.findIndex(
            (s) => s.table === spec.table && (s.filter ?? "") === (spec.filter ?? ""),
          );
          const accept = (idx >= 0 ? specsRef.current[idx] : spec).accept;
          if (accept && !accept(payload)) return;
          trigger();
        },
      );
    }

    channel.subscribe((status) => {
      const up = status === "SUBSCRIBED";
      socketUp = up;
      setConnected(up);
      schedulePoll();
      if (up) {
        if (subscribedOnce) void run(); // catch up on anything missed
        subscribedOnce = true;
      }
    });

    schedulePoll();

    const onFocus = () => { if (refreshOnFocus && !document.hidden) void run(); };
    const onOnline = () => void run();
    if (refreshOnFocus) document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (refreshOnFocus) document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, debounceMs, pollMs, offlinePollMs, refreshOnFocus, name, specKey]);

  return { lastEventAt, connected };
}

export default useRealtimeTables;
