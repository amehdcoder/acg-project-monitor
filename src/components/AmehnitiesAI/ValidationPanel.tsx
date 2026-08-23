/**
 * Amehnities AI — held-out evaluation & best-checkpoint auto-save.
 *
 * Scores the model on the 15% tail of the activity stream that training never
 * touches (loss, perplexity, top-1/top-5 accuracy, mean confidence), charts the
 * evaluation history, and manages the automatically retained best checkpoints
 * with one-click rollback and download.
 */
import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, FlaskConical, Play, RotateCcw, Trash2, Trophy } from "lucide-react";
import type { BestMetric, CheckpointRecord, EvalSample } from "@/hooks/useAmehnitiesBrain";

interface Props {
  evaluation: EvalSample | null;
  evalSeries: EvalSample[];
  evalEnabled: boolean;
  trainTokens: number;
  valTokens: number;
  setEvalEnabled: (v: boolean) => void;
  runEvaluation: (windows?: number) => void;
  guardEnabled: boolean;
  setGuardEnabled: (v: boolean) => void;
  bestCheckpoints: CheckpointRecord[];
  autoSave: boolean;
  setAutoSave: (v: boolean) => void;
  bestMetric: BestMetric;
  setBestMetric: (m: BestMetric) => void;
  autoSaving: boolean;
  rollbackTo: (id: string) => void;
  downloadBestCheckpoint: (id: string) => void;
  clearBestCheckpoints: () => void;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Two-series line chart (validation loss + accuracy) drawn on a canvas. */
function EvalChart({ series }: { series: EvalSample[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pts = series.slice(-90);
    if (pts.length < 2) {
      ctx.fillStyle = "rgba(148,163,184,0.6)";
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.fillText("Waiting for evaluations…", 10, h / 2);
      return;
    }

    // grid
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = (h / 3) * i + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const draw = (vals: number[], color: string, fill: boolean) => {
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = max - min || 1;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - 6 - ((v - min) / span) * (h - 14);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      if (fill) {
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, color.replace("rgb", "rgba").replace(")", ",0.22)"));
        g.addColorStop(1, color.replace("rgb", "rgba").replace(")", ",0)"));
        ctx.fillStyle = g; ctx.fill();
      }
    };

    draw(pts.map((p) => p.loss), "rgb(244,114,182)", true);
    draw(pts.map((p) => p.accuracy), "rgb(56,189,248)", false);
  }, [series]);

  return (
    <div className="relative">
      <canvas ref={ref} className="h-28 w-full" />
      <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><i className="h-1.5 w-4 rounded-full" style={{ background: "rgb(244,114,182)" }} /> val loss</span>
        <span className="flex items-center gap-1"><i className="h-1.5 w-4 rounded-full" style={{ background: "rgb(56,189,248)" }} /> top-1 accuracy</span>
      </div>
    </div>
  );
}

export default function ValidationPanel(p: Props) {
  const ev = p.evaluation;

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Evaluation & best checkpoints</h3>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {p.trainTokens.toLocaleString()} train / {p.valTokens.toLocaleString()} held-out tokens
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Val loss", value: ev ? ev.loss.toFixed(4) : "—" },
          { label: "Perplexity", value: ev ? ev.perplexity.toFixed(2) : "—" },
          { label: "Top-1 / Top-5", value: ev ? `${pct(ev.accuracy)} / ${pct(ev.top5)}` : "—" },
          { label: "Confidence", value: ev ? pct(ev.confidence) : "—" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border/60 bg-background/60 p-2.5">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{m.label}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <EvalChart series={p.evalSeries} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <Switch id="eval-on" checked={p.evalEnabled} onCheckedChange={p.setEvalEnabled} />
          <Label htmlFor="eval-on" className="text-xs">Continuous evaluation</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="guard-on" checked={p.guardEnabled} onCheckedChange={p.setGuardEnabled} />
          <Label htmlFor="guard-on" className="text-xs">Divergence guardrails</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="auto-save" checked={p.autoSave} onCheckedChange={p.setAutoSave} />
          <Label htmlFor="auto-save" className="text-xs">Auto-save best</Label>
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => p.runEvaluation(8)}>
          <Play className="h-3 w-3" /> Evaluate now
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium text-foreground">
            Best checkpoints {p.autoSaving && <span className="text-muted-foreground">(saving…)</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(["loss", "confidence"] as BestMetric[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={p.bestMetric === m ? "default" : "ghost"}
              className="h-6 px-2 text-[10px] capitalize"
              onClick={() => p.setBestMetric(m)}
            >
              {m === "loss" ? "Lowest loss" : "Highest confidence"}
            </Button>
          ))}
          {p.bestCheckpoints.length > 0 && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={p.clearBestCheckpoints}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {p.bestCheckpoints.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
            No auto-saved checkpoints yet — they appear as soon as the held-out score improves.
          </p>
        )}
        {p.bestCheckpoints.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
            <Badge variant={i === 0 ? "default" : "outline"} className="text-[10px]">#{i + 1}</Badge>
            <div className="min-w-[120px] flex-1">
              <div className="font-mono text-[11px] text-foreground">
                step {c.step.toLocaleString()} · val {(c.valLoss ?? c.loss).toFixed(4)} · conf {pct(c.confidence ?? 0)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()} · {(c.bytes / 1024).toFixed(0)} KB
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => p.rollbackTo(c.id)}>
              <RotateCcw className="h-3 w-3" /> Roll back
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[10px]" onClick={() => p.downloadBestCheckpoint(c.id)}>
              <Download className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
