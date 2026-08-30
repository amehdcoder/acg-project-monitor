/**
 * Model versions — dated, immutable snapshots of the Amehnities SLM with
 * one-click rollback when a training run degrades results.
 */
import { useState } from "react";
import { History, RotateCcw, Download, Trash2, Loader2, Plus, GitBranch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { ModelVersionMeta } from "@/lib/amehnitiesAi/brainPersistence";

const TRIGGER_STYLE: Record<string, string> = {
  manual: "border-primary/50 text-primary",
  auto: "border-sky-500/50 text-sky-600 dark:text-sky-400",
  dataset: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  "pre-rollback": "border-amber-500/50 text-amber-600 dark:text-amber-400",
};

export default function ModelVersionsPanel({
  versions, createVersion, rollbackToVersion, removeVersion, downloadVersion, clearAllVersions,
}: {
  versions: ModelVersionMeta[];
  createVersion: (opts?: { label?: string }) => Promise<ModelVersionMeta>;
  rollbackToVersion: (id: string) => Promise<unknown>;
  removeVersion: (id: string) => Promise<void>;
  downloadVersion: (id: string) => Promise<number>;
  clearAllVersions: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ModelVersionMeta | null>(null);

  const save = async () => {
    setBusy("save");
    try {
      const v = await createVersion({ label: label.trim() || undefined });
      setLabel("");
      toast.success("Version saved", { description: `${v.label} · step ${v.step.toLocaleString()} · ${(v.bytes / 1048576).toFixed(2)} MB` });
    } catch (e: any) {
      toast.error("Could not save this version", { description: e?.message });
    } finally { setBusy(null); }
  };

  const rollback = async (v: ModelVersionMeta) => {
    setConfirm(null);
    setBusy(v.id);
    try {
      await rollbackToVersion(v.id);
      toast.success("Model rolled back", { description: `Now running ${v.label} (step ${v.step.toLocaleString()}, loss ${v.loss.toFixed(3)})` });
    } catch (e: any) {
      toast.error("Rollback failed", { description: e?.message });
    } finally { setBusy(null); }
  };

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Model versions</h3>
        <Badge variant="outline" className="ml-auto">{versions.length} snapshot{versions.length === 1 ? "" : "s"}</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name this version (optional)"
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8 gap-1.5" disabled={busy === "save"} onClick={save}>
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Save version
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        A rollback point is also cut automatically every 2,000 training steps, after every dataset run, and
        immediately before any rollback — so no state is ever lost.
      </p>

      <ScrollArea className="mt-3 max-h-72 pr-2">
        <div className="space-y-2">
          {versions.length === 0 && (
            <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
              No versions yet. Save one now to create a point you can always return to.
            </p>
          )}
          {versions.map((v) => (
            <div key={v.id} className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs font-medium">{v.label}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    step {v.step.toLocaleString()} · loss {v.loss.toFixed(4)}
                    {v.valLoss != null ? ` · val ${v.valLoss.toFixed(3)}` : ""}
                    {v.accuracy != null ? ` · acc ${(v.accuracy * 100).toFixed(1)}%` : ""}
                    {" · "}{v.params.toLocaleString()} params · {(v.bytes / 1048576).toFixed(2)} MB
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}{v.notes ? ` — ${v.notes}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${TRIGGER_STYLE[v.trigger] ?? ""}`}>{v.trigger}</Badge>
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-[11px]"
                  disabled={busy === v.id} onClick={() => setConfirm(v)}>
                  {busy === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Roll back
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]"
                  onClick={() => void downloadVersion(v.id).then(() => toast.success("Version downloaded"))}>
                  <Download className="h-3 w-3" /> Export
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => void removeVersion(v.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {versions.length > 1 && (
        <Button size="sm" variant="ghost" className="mt-2 h-7 w-full text-[11px] text-muted-foreground"
          onClick={() => void clearAllVersions().then(() => toast.success("Version history cleared"))}>
          Clear version history
        </Button>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to “{confirm?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The live model will be replaced with this snapshot (step {confirm?.step.toLocaleString()},
              loss {confirm?.loss.toFixed(4)}) and training continues from there. The current state is saved
              as a “Before rollback” version first, so this is fully reversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void rollback(confirm)}>Roll back</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
