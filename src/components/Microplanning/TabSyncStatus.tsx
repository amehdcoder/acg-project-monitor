import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, WifiOff, Clock, RefreshCw } from "lucide-react";

/**
 * Per-tab live sync indicator. Subscribes to a table's postgres_changes AND
 * matching `kobo_sync_events` broadcasts for the given project, and displays
 * a badge + a human-readable "Last synced" timestamp that updates as soon
 * as a realtime event lands. If `onResync` is provided, renders a manual
 * "Resync" button that triggers a fresh fetch and updates the indicator.
 */
export interface TabSyncStatusProps {
  projectId: string | null | undefined;
  table: "microplan_entries" | "microplan_coverage" | "microplan_reconciliation";
  syncEventStatus: "microplan_sync" | "coverage_sync" | "reconciliation_sync";
  label?: string;
  onResync?: () => void | Promise<void>;
}

function formatRelative(ts: number | null): string {
  if (!ts) return "not yet";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function TabSyncStatus({ projectId, table, syncEventStatus, label, onResync }: TabSyncStatusProps) {
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [resyncing, setResyncing] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!projectId) { setStatus("offline"); return; }
    const channel = supabase
      .channel(`tab-sync-${table}-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` },
        () => setLastSyncedAt(Date.now()),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kobo_sync_events", filter: `project_id=eq.${projectId}` },
        (payload: { new?: { status?: string } }) => {
          if (payload?.new?.status === syncEventStatus) setLastSyncedAt(Date.now());
        },
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
      });
    return () => { supabase.removeChannel(channel); };
  }, [projectId, table, syncEventStatus]);

  // Tick every 15s so the relative time stays fresh.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const handleResync = useCallback(async () => {
    if (!onResync || resyncing) return;
    setResyncing(true);
    try {
      await onResync();
      setLastSyncedAt(Date.now());
    } finally {
      setResyncing(false);
    }
  }, [onResync, resyncing]);

  const Icon = status === "live" ? Radio : status === "connecting" ? Clock : WifiOff;
  const tone =
    status === "live" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300" :
    status === "connecting" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300" :
    "bg-muted text-muted-foreground";

  return (
    <div
      data-testid={`tab-sync-${table}`}
      className="inline-flex items-center gap-2 text-[11px]"
    >
      <Badge variant="outline" className={`gap-1 ${tone}`}>
        <Icon className="h-3 w-3" />
        <span data-testid="tab-sync-status">{status}</span>
      </Badge>
      <span className="text-muted-foreground">
        {label ?? "Last synced"}:{" "}
        <span data-testid="tab-sync-last" className="font-medium tabular-nums text-foreground">
          {formatRelative(lastSyncedAt)}
        </span>
      </span>
      {onResync && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 gap-1 text-[11px]"
          onClick={handleResync}
          disabled={resyncing}
          data-testid={`tab-sync-resync-${table}`}
          aria-label="Resync"
        >
          <RefreshCw className={`h-3 w-3 ${resyncing ? "animate-spin" : ""}`} />
          {resyncing ? "Resyncing…" : "Resync"}
        </Button>
      )}
    </div>
  );
}

export default TabSyncStatus;
