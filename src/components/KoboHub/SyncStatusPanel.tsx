/**
 * Universal Kobo Analytics — sync status panel.
 * Last sync time, live stage progress, schema-drift summary, failure details
 * and automatic retry with exponential backoff (plus manual controls).
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, CheckCircle2, Clock, GitCompareArrows, Loader2, RefreshCw, XCircle,
} from "lucide-react";
import type { SyncStage } from "@/lib/koboHub/client";
import type { SchemaDrift } from "@/lib/koboHub/schema";

const STAGES: { key: SyncStage; label: string }[] = [
  { key: "schema", label: "Schema" },
  { key: "normalizing", label: "Repeat groups" },
  { key: "widgets", label: "Widgets" },
  { key: "ready", label: "Ready" },
];

export interface SyncState {
  syncing: boolean;
  stage: SyncStage | null;
  detail: string;
  error: string | null;
  attempt: number;
  retryInSeconds: number | null;
  lastSyncAt: string | null;
  cadenceSeconds: number;
  recordCount: number;
}

interface Props {
  state: SyncState;
  drift?: SchemaDrift;
  autoRetry: boolean;
  onAutoRetryChange: (v: boolean) => void;
  onRetryNow: () => void;
  onCancelRetry: () => void;
}

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

export default function SyncStatusPanel({
  state, drift, autoRetry, onAutoRetryChange, onRetryNow, onCancelRetry,
}: Props) {
  const idx = state.stage ? STAGES.findIndex((s) => s.key === state.stage) : -1;
  const pct = state.syncing ? Math.max(8, ((idx + 1) / STAGES.length) * 100) : state.error ? 100 : 100;
  const failed = !!state.error && !state.syncing;

  return (
    <div className={`rounded-lg border p-3 ${failed ? "border-rose-500/40 bg-rose-500/5" : "border-slate-800 bg-slate-900/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {state.syncing
            ? <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            : failed ? <XCircle className="h-4 w-4 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {state.syncing ? "Syncing with KoboToolbox…" : failed ? "Kobo sync failed" : "Kobo sync healthy"}
            </h3>
            <p className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> Last sync {ago(state.lastSyncAt)}
              {state.lastSyncAt && ` · ${new Date(state.lastSyncAt).toLocaleTimeString()}`}
              {" · "}{state.recordCount.toLocaleString()} records
              {" · auto every "}{state.cadenceSeconds < 60 ? `${state.cadenceSeconds}s` : `${Math.round(state.cadenceSeconds / 60)} min`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Switch id="autoretry" checked={autoRetry} onCheckedChange={onAutoRetryChange} />
            <Label htmlFor="autoretry" className="text-[11px] text-slate-300">Auto-retry on failure</Label>
          </div>
          {state.retryInSeconds !== null && (
            <>
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                Retry in {state.retryInSeconds}s (attempt {state.attempt + 1})
              </Badge>
              <Button size="sm" variant="ghost" className="text-slate-400" onClick={onCancelRetry}>Cancel</Button>
            </>
          )}
          <Button size="sm" variant="outline" className="border-slate-700 text-slate-200"
            disabled={state.syncing} onClick={onRetryNow}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${state.syncing ? "animate-spin" : ""}`} />
            {failed ? "Retry now" : "Sync now"}
          </Button>
        </div>
      </div>

      {state.syncing && (
        <div className="mt-3 space-y-1.5">
          <Progress value={pct} className="h-1.5" />
          <div className="flex flex-wrap gap-3 text-[11px]">
            {STAGES.map((s, i) => (
              <span key={s.key} className={i < idx ? "text-emerald-400" : i === idx ? "text-cyan-300" : "text-slate-500"}>
                {i < idx ? "✓ " : ""}{s.label}
              </span>
            ))}
          </div>
          {state.detail && <p className="text-[11px] text-slate-500">{state.detail}</p>}
        </div>
      )}

      {failed && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {state.error}
            {state.attempt > 0 && ` · ${state.attempt} automatic retry attempt(s) made.`}
            {" Cached data is still shown below."}
          </span>
        </div>
      )}

      {drift?.changed && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <span className="inline-flex items-center gap-1 font-semibold">
            <GitCompareArrows className="h-3.5 w-3.5" /> Schema drift detected — dashboard adapted automatically.
          </span>
          <div className="mt-1 flex flex-wrap gap-3">
            {drift.added.length > 0 && <span>+{drift.added.length} field(s): {drift.added.slice(0, 5).map((f) => f.label).join(", ")}{drift.added.length > 5 ? "…" : ""}</span>}
            {drift.removed.length > 0 && <span>−{drift.removed.length} removed</span>}
            {drift.retyped.length > 0 && <span>{drift.retyped.length} retyped</span>}
            {drift.addedRepeats.length > 0 && <span>+{drift.addedRepeats.length} repeat group(s)</span>}
            {drift.removedRepeats.length > 0 && <span>−{drift.removedRepeats.length} repeat group(s)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
