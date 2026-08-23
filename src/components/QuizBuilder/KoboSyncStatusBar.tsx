/**
 * Visible sync status strip for KoboToolbox-linked quizzes.
 * Shows live/loading state, submission count, last sync time and errors.
 */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Radio, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function timeAgo(d: Date | null): string {
  if (!d) return "never";
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleString();
}

interface Props {
  formTitle?: string | null;
  loading: boolean;
  live: boolean;
  error: string | null;
  submissionCount: number;
  lastSyncedAt: Date | null;
  lastEventAt: Date | null;
  onRefresh: () => void;
}

export function KoboSyncStatusBar({
  formTitle, loading, live, error, submissionCount, lastSyncedAt, lastEventAt, onRefresh,
}: Props) {
  const tone = error
    ? "border-destructive/40 bg-destructive/5"
    : loading
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-emerald-500/40 bg-emerald-500/5";

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 ${tone}`}>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {error ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        {error ? "Kobo sync error" : loading ? "Syncing KoboToolbox…" : "KoboToolbox synced"}
      </span>

      {formTitle && <span className="text-xs text-muted-foreground truncate max-w-[16rem]">{formTitle}</span>}

      <Badge variant="secondary" className="text-[11px]">{submissionCount} submissions</Badge>

      <Badge variant="outline" className="gap-1 text-[11px]">
        {live ? <Radio className="h-3 w-3 text-emerald-600" /> : <WifiOff className="h-3 w-3 text-muted-foreground" />}
        {live ? "Realtime on" : "Realtime off"}
      </Badge>

      <span className="text-xs text-muted-foreground">
        Last sync: {timeAgo(lastSyncedAt)}
        {lastEventAt && ` · last change ${timeAgo(lastEventAt)}`}
      </span>

      {error && <span className="w-full text-xs text-destructive">{error}</span>}

      <Button
        size="sm" variant="ghost" onClick={onRefresh} disabled={loading}
        className="ml-auto h-7 gap-1 text-xs"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
      </Button>
    </div>
  );
}
