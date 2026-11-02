import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { savedEyeRows, syncEyeRows, type EyeTable, type SyncRow } from "./incrementalData";

export function useEyeDataset<T extends SyncRow>(userId: string, projectId: string, table: EyeTable) {
  const scope = `${userId}:${projectId}:${table}`;
  const [state, setState] = useState({ scope, rows: [] as T[], loading: true, refreshing: false, fromCache: false, unavailable: false, checkedAt: null as number | null });
  const refreshRef = useRef<(reconcile?: boolean) => Promise<void>>(async () => {});
  const refresh = useCallback((reconcile = false) => refreshRef.current(reconcile), []);
  useEffect(() => {
    let active = true, running = false, trailing = false, force = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    setState({ scope, rows: [], loading: true, refreshing: false, fromCache: false, unavailable: false, checkedAt: null });
    const load = async (reconcile = false) => {
      force ||= reconcile;
      if (running) { trailing = true; return; }
      running = true;
      do {
        trailing = false;
        const reconcileNow = force; force = false;
        if (active) setState(s => ({ ...s, refreshing: true }));
        try {
          const result = await syncEyeRows<T>(userId, projectId, table, reconcileNow);
          if (active) setState(s => ({ ...s, ...result, checkedAt: result.checkedAt ?? s.checkedAt, loading: false, refreshing: false }));
        } catch {
          if (active) setState(s => ({ ...s, fromCache: true, loading: false, refreshing: false, unavailable: s.loading && !s.rows.length }));
        }
      } while (active && trailing);
      running = false;
    };
    refreshRef.current = load;
    const schedule = (reconcile = false) => {
      force ||= reconcile;
      clearTimeout(debounce);
      debounce = setTimeout(() => { if (active) void load(); }, 350);
    };
    const start = async () => {
      const rows = await savedEyeRows<T>(userId, projectId, table);
      if (!active) return;
      if (rows !== null) setState(s => ({ ...s, rows, loading: false, fromCache: true }));
      void load(true);
    };
    void start();
    const channel = supabase.channel(`eye-live:${scope}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `project_id=eq.${projectId}` }, () => schedule())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `project_id=eq.${projectId}` }, () => schedule())
      // Deletes cannot reliably be project-filtered; use only the ID to reconcile our own authorized dataset.
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, () => schedule(true))
      .subscribe(status => { if (status === "SUBSCRIBED") schedule(true); });
    const reconnect = () => schedule(true);
    const focus = () => { if (navigator.onLine && document.visibilityState === "visible") schedule(true); };
    const local = async () => {
      const rows = await savedEyeRows<T>(userId, projectId, table);
      if (active && rows !== null) setState(s => ({ ...s, rows }));
      if (navigator.onLine) schedule();
    };
    const offline = () => setState(s => ({ ...s, fromCache: true }));
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("programme-module-queue", local);
    window.addEventListener("eye-report-saved", local);
    const timer = setInterval(() => { if (navigator.onLine && document.visibilityState === "visible") schedule(); }, 60_000);
    return () => {
      active = false; clearTimeout(debounce); clearInterval(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener("online", reconnect); window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("programme-module-queue", local); window.removeEventListener("eye-report-saved", local);
    };
  }, [scope, userId, projectId, table]);
  return { ...(state.scope === scope ? state : { rows: [] as T[], loading: true, refreshing: false, fromCache: false, unavailable: false, checkedAt: null }), refresh };
}