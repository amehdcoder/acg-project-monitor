import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Radio, WifiOff, Clock } from "lucide-react";

/**
 * Per-tab live sync indicator. Subscribes to a table's postgres_changes AND
 * matching `kobo_sync_events` broadcasts for the given project, and displays
 * a badge + a human-readable "Last synced" timestamp that updates as soon
 * as a realtime event lands.
 */
export interface TabSyncStatusProps {
  projectId: string | null | undefined;
  table: "microplan_entries" | "microplan_coverage" | "microplan_reconciliation";
  syncEventStatus: "microplan_sync" | "coverage_sync" | "reconciliation_sync";
  label?: string;
}

function formatRelative(ts: number | null): string {
  if (!ts) return "not yet";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function TabSyncStatus({ projectId, table, syncEventStatus, label }: TabSyncStatusProps) {
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
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
    </div>
  );
}

export default TabSyncStatus;
