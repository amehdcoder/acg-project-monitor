/**
 * Training Control Panel — hyper-parameters, safe restart and checkpoint I/O
 * for the Amehnities AI Transformer.
 */
import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, SlidersHorizontal, Check, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Telemetry } from "@/hooks/useAmehnitiesBrain";

const LR_STOPS = [1e-4, 3e-4, 5e-4, 1e-3, 2e-3, 3e-3, 5e-3, 8e-3, 1.2e-2, 2e-2];
const CTX_STOPS = [16, 24, 32, 48, 64, 96, 128];
const nearestIndex = (stops: number[], v: number) =>
  stops.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(stops[best] - v) ? i : best), 0);

function Row({ label, value, hint, children }: { label: string; value: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="font-mono text-xs tabular-nums text-primary">{value}</span>
      </div>
      {children}
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function TrainingControlPanel({
  telemetry, budget, exportCheckpoint, importCheckpoint, applyConfig,
}: {
  telemetry: Telemetry | null;
  budget: number;
  exportCheckpoint: (includeOptimizer?: boolean) => Promise<{ file: any; bytes: number }>;
  importCheckpoint: (file: File) => Promise<any>;
  applyConfig: (
    patch: { lr?: number; batch?: number; ctx?: number; budgetMs?: number },
    opts?: { fresh?: boolean },
  ) => Promise<void>;
}) {
  const cfg = telemetry?.cfg;
  const [lrIdx, setLrIdx] = useState(() => nearestIndex(LR_STOPS, 3e-3));
  const [batch, setBatch] = useState(1);
  const [ctxIdx, setCtxIdx] = useState(() => nearestIndex(CTX_STOPS, 32));
  const [budgetMs, setBudgetMs] = useState(budget);
  const [withOptimizer, setWithOptimizer] = useState(true);
  const [busy, setBusy] = useState<null | "export" | "apply" | "restart" | "import">(null);
  const synced = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // adopt the live config once the model reports in
  useEffect(() => {
    if (!cfg || synced.current) return;
    synced.current = true;
    setLrIdx(nearestIndex(LR_STOPS, cfg.lr));
    setBatch(cfg.batch ?? 1);
    setCtxIdx(nearestIndex(CTX_STOPS, cfg.ctx));
  }, [cfg]);
  useEffect(() => setBudgetMs(budget), [budget]);

  const lr = LR_STOPS[lrIdx];
  const ctx = CTX_STOPS[ctxIdx];
  const dirty = !!cfg && (lr !== cfg.lr || batch !== (cfg.batch ?? 1) || ctx !== cfg.ctx || budgetMs !== budget);
  const needsRebuild = !!cfg && ctx !== cfg.ctx;

  const apply = async (fresh: boolean) => {
    setBusy(fresh ? "restart" : "apply");
    try {
      await applyConfig({ lr, batch, ctx, budgetMs }, { fresh });
      toast.success(fresh ? "Training restarted with fresh weights" : "Hyper-parameters applied", {
        description: `lr ${lr} · batch ${batch} · context ${ctx} · ${budgetMs}ms/tick`,
      });
    } catch (e: any) {
      toast.error("Could not apply settings", { description: e?.message });
    } finally { setBusy(null); }
  };

  const doExport = async () => {
    setBusy("export");
    try {
      const { file, bytes } = await exportCheckpoint(withOptimizer);
      toast.success("Checkpoint downloaded", {
        description: `step ${file.training.step} · ${file.training.paramCount.toLocaleString()} params · ${(bytes / 1048576).toFixed(2)} MB`,
      });
    } catch (e: any) {
      toast.error("Checkpoint export failed", { description: e?.message });
    } finally { setBusy(null); }
  };

  const doImport = async (f?: File | null) => {
    if (!f) return;
    setBusy("import");
    try {
      const file = await importCheckpoint(f);
      toast.success("Checkpoint restored", { description: `step ${file.training.step} · loss ${file.training.loss.toFixed(3)}` });
      synced.current = false;
    } catch (e: any) {
      toast.error("Could not load checkpoint", { description: e?.message });
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Training control</h3>
        {dirty && <Badge variant="outline" className="ml-auto border-amber-500/50 text-amber-600 dark:text-amber-400">unapplied</Badge>}
      </div>

      <div className="space-y-4">
        <Row label="Learning rate" value={lr.toExponential(1)} hint="Adam step size. Lower = steadier convergence, higher = faster but noisier.">
          <Slider value={[lrIdx]} min={0} max={LR_STOPS.length - 1} step={1} onValueChange={(v) => setLrIdx(v[0])} />
        </Row>

        <Row label="Batch size" value={`${batch} seq`} hint="Sequences accumulated per optimiser step — larger batches smooth the gradient.">
          <Slider value={[batch]} min={1} max={16} step={1} onValueChange={(v) => setBatch(v[0])} />
        </Row>

        <Row label="Context length" value={`${ctx} tokens`} hint="How far back the model attends. Changing this rebuilds the positional table (weights are warm-started).">
          <Slider value={[ctxIdx]} min={0} max={CTX_STOPS.length - 1} step={1} onValueChange={(v) => setCtxIdx(v[0])} />
        </Row>

        <Row label="Worker budget" value={`${budgetMs} ms / tick`} hint="Hard compute ceiling per tick inside the Web Worker — keeps the rest of Amehnities responsive.">
          <Slider value={[budgetMs]} min={2} max={40} step={1} onValueChange={(v) => setBudgetMs(v[0])} />
        </Row>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" disabled={!dirty || !!busy} onClick={() => apply(false)} className="gap-1.5">
          {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Apply safely
        </Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => apply(true)} className="gap-1.5">
          {busy === "restart" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restart fresh
        </Button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        {needsRebuild
          ? "Applying pauses training, rebuilds the model at the new context length while warm-starting matching weights, then resumes."
          : "Applying pauses the loop, updates the optimiser, then resumes — no step is left half-finished. “Restart fresh” re-initialises all weights and counters."}
      </p>

      <div className="mt-4 border-t border-border/60 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Checkpoints</h4>
          <div className="flex items-center gap-2">
            <Label htmlFor="ckpt-opt" className="text-[11px] text-muted-foreground">Adam state</Label>
            <Switch id="ckpt-opt" checked={withOptimizer} onCheckedChange={setWithOptimizer} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" disabled={!telemetry || !!busy} onClick={doExport} className="gap-1.5">
            {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export weights
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()} className="gap-1.5">
            {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Restore
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => doImport(e.target.files?.[0])} />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Downloads a portable <span className="font-mono">.amz.json</span> holding the architecture, every weight
          {withOptimizer ? ", the Adam moments" : ""}, the vocabulary and the full training state
          {telemetry ? ` (step ${telemetry.step.toLocaleString()}, ${telemetry.params.toLocaleString()} params)` : ""}.
        </p>
      </div>
    </Card>
  );
}
