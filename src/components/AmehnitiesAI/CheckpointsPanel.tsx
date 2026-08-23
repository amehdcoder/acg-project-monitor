/**
 * Checkpoints panel — drag-and-drop restore with full validation (format,
 * version, architecture, tensor shapes) plus a session history of captured
 * checkpoints that can be re-downloaded at any time.
 */
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UploadCloud, Download, Loader2, AlertTriangle, CheckCircle2, History, FileJson } from "lucide-react";
import type { CheckpointFile, CheckpointIssue } from "@/lib/amehnitiesAi/checkpoint";
import type { CheckpointRecord } from "@/hooks/useAmehnitiesBrain";

export default function CheckpointsPanel({
  checkpoints, downloadSavedCheckpoint, inspectCheckpoint, importCheckpoint,
}: {
  checkpoints: CheckpointRecord[];
  downloadSavedCheckpoint: (id: string) => number;
  inspectCheckpoint: (f: File) => Promise<{ file: CheckpointFile; issues: CheckpointIssue[] }>;
  importCheckpoint: (f: File) => Promise<CheckpointFile>;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<CheckpointIssue[]>([]);
  const [pending, setPending] = useState<{ file: File; parsed: CheckpointFile } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inspect = async (f?: File | null) => {
    if (!f) return;
    setBusy(true); setIssues([]); setPending(null);
    try {
      const { file, issues: found } = await inspectCheckpoint(f);
      setIssues(found);
      if (!found.some((i) => i.level === "error")) setPending({ file: f, parsed: file });
    } catch (e: any) {
      setIssues([{ level: "error", title: "Could not read checkpoint", detail: e?.message || "Unknown error" }]);
    } finally { setBusy(false); }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const file = await importCheckpoint(pending.file);
      toast.success("Checkpoint restored", {
        description: `step ${file.training.step.toLocaleString()} · loss ${file.training.loss.toFixed(3)} · ${file.training.paramCount.toLocaleString()} params`,
      });
      setPending(null); setIssues([]);
    } catch (e: any) {
      toast.error("Restore failed", { description: e?.message });
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Checkpoints</h3>
        {checkpoints.length > 0 && <Badge variant="secondary" className="ml-auto">{checkpoints.length} this session</Badge>}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); inspect(e.dataTransfer.files?.[0]); }}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-border/70 bg-background/40 hover:border-primary/50"
        }`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <UploadCloud className="h-5 w-5 text-primary" />}
        <p className="mt-2 text-xs font-medium">Drop an <span className="font-mono">.amz.json</span> checkpoint here</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Validated against the running architecture before anything is loaded.</p>
      </div>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => inspect(e.target.files?.[0])} />

      {issues.length > 0 && (
        <div className="mt-3 space-y-2">
          {issues.map((i, k) => (
            <div key={k} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug ${
              i.level === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold">{i.title}. </span>{i.detail}</span>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start gap-2 text-[11px]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Valid checkpoint · step {pending.parsed.training.step.toLocaleString()} ·{" "}
              {pending.parsed.training.paramCount.toLocaleString()} params · d={pending.parsed.model.dModel},{" "}
              {pending.parsed.model.nLayers} blocks, ctx {pending.parsed.model.ctx}
              {pending.parsed.optimizer ? " · Adam state included" : ""}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={restore} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />} Load into model
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setPending(null); setIssues([]); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Saved this session</h4>
        {checkpoints.length === 0 && <p className="text-xs text-muted-foreground">No checkpoints captured yet — export one from Training control.</p>}
        {checkpoints.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">step {c.step.toLocaleString()} · loss {c.loss.toFixed(3)}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()} · {(c.bytes / 1048576).toFixed(2)} MB
                {c.withOptimizer ? " · Adam" : ""}
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={() => { downloadSavedCheckpoint(c.id); toast.success("Checkpoint downloaded"); }}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
