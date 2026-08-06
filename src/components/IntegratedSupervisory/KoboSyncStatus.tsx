import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, Loader2, Radio, RefreshCw, WifiOff } from "lucide-react";

export type KoboSyncPhase = "idle" | "syncing" | "synced" | "error";

export interface KoboSyncStatusProps {
  phase: KoboSyncPhase;
  /** ISO string or Date of the last successful sync. */
  lastSyncedAt?: string | Date | null;
  /** Realtime channel connected (auto-sync will trigger on new submissions). */
  live: boolean;
  /** Time of the last realtime Kobo event received. */
  lastEventAt?: Date | null;
  recordCount?: number | null;
  error?: { message: string; hint?: string } | null;
  onRetry?: () => void;
}

function relative(ts: number | null): string {
  if (!ts) return "never";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Compact, always-visible sync health strip for the Kobo-linked dashboards:
 * realtime connection, in-progress state, last updated time and errors.
 */
export default function KoboSyncStatus({
  phase, lastSyncedAt, live, lastEventAt, recordCount, error, onRetry,
}: KoboSyncStatusProps) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const ts = lastSyncedAt ? new Date(lastSyncedAt).getTime() : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="kobo-sync-status">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={
                live
                  ? "gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "gap-1 border-muted text-muted-foreground"
              }
            >
              {live ? <Radio className="h-3 w-3 animate-pulse" /> : <WifiOff className="h-3 w-3" />}
              {live ? "Auto-sync live" : "Auto-sync offline"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            {live
              ? "Connected to the realtime channel — new KoboToolbox submissions refresh this dashboard automatically."
              : "Realtime channel unavailable. The dashboard still polls KoboToolbox in the background and on refocus."}
            {lastEventAt && <div className="mt-1 opacity-80">Last Kobo event: {lastEventAt.toLocaleTimeString()}</div>}
          </TooltipContent>
        </Tooltip>

        <Badge
          variant="outline"
          className={
            phase === "error"
              ? "gap-1 border-destructive/40 bg-destructive/10 text-destructive"
              : phase === "syncing"
              ? "gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              : "gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          }
          data-testid="kobo-sync-phase"
        >
          {phase === "syncing" ? <Loader2 className="h-3 w-3 animate-spin" />
            : phase === "error" ? <AlertTriangle className="h-3 w-3" />
            : <CheckCircle2 className="h-3 w-3" />}
          {phase === "syncing" ? "Syncing…" : phase === "error" ? "Sync error" : "Up to date"}
        </Badge>

        <span className="text-muted-foreground">
          Last updated:{" "}
          <span className="font-medium tabular-nums text-foreground" data-testid="kobo-last-updated">
            {relative(ts)}
          </span>
          {ts && <span className="ml-1 opacity-70">({new Date(ts).toLocaleString()})</span>}
          {typeof recordCount === "number" && (
            <span className="ml-1">· {recordCount.toLocaleString()} records</span>
          )}
        </span>

        {phase === "error" && error && (
          <span className="flex items-center gap-1 text-destructive">
            <span className="max-w-[420px] truncate" title={`${error.message}${error.hint ? ` — ${error.hint}` : ""}`}>
              {error.hint || error.message}
            </span>
            {onRetry && (
              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={onRetry}>
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            )}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
