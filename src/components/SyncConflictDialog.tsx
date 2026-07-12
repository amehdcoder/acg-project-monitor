import { useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, Laptop, Server } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  detectFieldConflicts,
  resolveConflict,
  type ConflictStrategy,
  type FieldDiff,
} from "@/lib/syncConflict";

interface SyncConflictDialogProps {
  open: boolean;
  /** Human label for the record being reconciled (e.g. form + respondent). */
  recordLabel?: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  /** Optional map of raw field keys → friendly labels. */
  fieldLabels?: Record<string, string>;
  onResolve: (strategy: ConflictStrategy, payload: Record<string, unknown>) => void;
  onCancel: () => void;
}

const prettify = (v: unknown): string => {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const humanizeKey = (key: string): string =>
  key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const SyncConflictDialog = ({
  open,
  recordLabel,
  localData,
  serverData,
  fieldLabels,
  onResolve,
  onCancel,
}: SyncConflictDialogProps) => {
  const diffs: FieldDiff[] = useMemo(
    () => detectFieldConflicts(localData || {}, serverData || {}),
    [localData, serverData],
  );

  // Per-field pick used only in "Merge Both" mode. Defaults to local (mine).
  const [mergeMode, setMergeMode] = useState(false);
  const [picks, setPicks] = useState<Record<string, "local" | "server">>({});

  const labelFor = (key: string) => fieldLabels?.[key] || humanizeKey(key);

  const apply = (strategy: ConflictStrategy) => {
    const payload = resolveConflict(strategy, localData || {}, serverData || {}, picks);
    onResolve(strategy, payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-border bg-amber-500/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            Sync Conflict Detected
          </DialogTitle>
          <DialogDescription>
            {recordLabel ? <span className="font-medium text-foreground">{recordLabel}</span> : "This record"}{" "}
            was changed on the server while you were offline. Choose how to resolve the
            {" "}
            {diffs.length} conflicting {diffs.length === 1 ? "field" : "fields"}.
          </DialogDescription>
        </DialogHeader>

        {/* Side-by-side diff */}
        <div className="max-h-[45vh] overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Laptop className="h-3.5 w-3.5" /> Local changes
            </div>
            <div className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" /> Server version
            </div>
          </div>

          <div className="space-y-2">
            {diffs.map((d) => {
              const pick = picks[d.key] || "local";
              return (
                <div key={d.key} className="rounded-lg border border-border p-2">
                  <div className="mb-1 text-xs font-semibold text-foreground">{labelFor(d.key)}</div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                    <button
                      type="button"
                      disabled={!mergeMode}
                      onClick={() => setPicks((p) => ({ ...p, [d.key]: "local" }))}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        mergeMode && pick === "local"
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-muted/30",
                        !mergeMode && "cursor-default",
                      )}
                    >
                      <span className="block break-words">{prettify(d.localValue)}</span>
                      {mergeMode && pick === "local" && (
                        <Check className="mt-1 h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!mergeMode}
                      onClick={() => setPicks((p) => ({ ...p, [d.key]: "server" }))}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        mergeMode && pick === "server"
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-muted/30",
                        !mergeMode && "cursor-default",
                      )}
                    >
                      <span className="block break-words">{prettify(d.serverValue)}</span>
                      {mergeMode && pick === "server" && (
                        <Check className="mt-1 h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            {diffs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No field-level differences — safe to keep either version.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:justify-between">
          {!mergeMode ? (
            <>
              <Button variant="outline" onClick={() => setMergeMode(true)} className="gap-1.5">
                <GitMerge className="h-4 w-4" /> Merge Both
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => apply("accept-server")}>
                  Accept Server Version
                </Button>
                <Button variant="acg" onClick={() => apply("keep-mine")}>
                  Keep My Version
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setMergeMode(false)}>
                Back
              </Button>
              <Button variant="acg" onClick={() => apply("merge-both")} className="gap-1.5">
                <Check className="h-4 w-4" /> Apply Merged Result
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncConflictDialog;
