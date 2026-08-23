/**
 * Ask the model — runs the trained Transformer forward from the tail of the
 * live activity stream and shows the predicted next events with confidence
 * and the attention evidence that produced them.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, MessagesSquare, Eye } from "lucide-react";
import type { QueryResult } from "@/hooks/useAmehnitiesBrain";

const confidenceTone = (p: number) =>
  p >= 0.6 ? "text-emerald-600 dark:text-emerald-400" : p >= 0.3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";

export default function AskModelPanel({
  askModel, vocab,
}: {
  askModel: (steps?: number) => Promise<QueryResult>;
  vocab: string[];
}) {
  const [steps, setSteps] = useState(6);
  const [busy, setBusy] = useState<null | "predict" | "summary">(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [mode, setMode] = useState<"predict" | "summary">("predict");
  const [error, setError] = useState<string | null>(null);

  const name = (id: number) => vocab[id] ?? `token#${id}`;

  const run = async (m: "predict" | "summary") => {
    setBusy(m); setError(null); setMode(m);
    try { setResult(await askModel(m === "summary" ? Math.max(10, steps) : steps)); }
    catch (e: any) { setError(e?.message || "Inference failed"); setResult(null); }
    finally { setBusy(null); }
  };

  const summary = result
    ? (() => {
        const conf = result.predictions.reduce((a, p) => a + p.p, 0) / Math.max(1, result.predictions.length);
        const chain = result.predictions.map((p) => name(p.id)).join(" → ");
        const driver = result.evidence[0] ? name(result.evidence[0].token) : "recent activity";
        return `Based on the last ${result.prompt.length} tokens of live activity, the network expects: ${chain}. Its attention leans most on “${driver}”, and the average confidence across the horizon is ${(conf * 100).toFixed(1)}% at training step ${result.step.toLocaleString()} (loss ${result.loss.toFixed(3)}).`;
      })()
    : null;

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Ask the model</h3>
        {result && <Badge variant="outline" className="ml-auto font-mono text-[10px]">step {result.step.toLocaleString()}</Badge>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label className="text-xs font-medium">Prediction horizon</Label>
          <span className="font-mono text-xs tabular-nums text-primary">{steps} events</span>
        </div>
        <Slider value={[steps]} min={1} max={16} step={1} onValueChange={(v) => setSteps(v[0])} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" disabled={!!busy} onClick={() => run("predict")} className="gap-1.5">
          {busy === "predict" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Next events
        </Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("summary")} className="gap-1.5">
          {busy === "summary" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Activity summary
        </Button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {result && mode === "summary" && summary && (
        <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed">{summary}</p>
      )}

      {result && (
        <div className="mt-3 space-y-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Predicted sequence</h4>
          {result.predictions.map((p, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-foreground">#{i + 1} · {name(p.id)}</span>
                <span className={`tabular-nums ${confidenceTone(p.p)}`}>{(p.p * 100).toFixed(1)}%</span>
              </div>
              <Progress value={p.p * 100} className="mt-1.5 h-1.5" />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.alternatives.slice(1).map((a) => (
                  <Badge key={a.id} variant="secondary" className="font-mono text-[10px]">
                    {name(a.id)} {(a.p * 100).toFixed(0)}%
                  </Badge>
                ))}
                <Badge variant="outline" className="font-mono text-[10px]">entropy {p.entropy.toFixed(2)}</Badge>
              </div>
            </div>
          ))}

          <h4 className="pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Attention evidence</h4>
          <div className="space-y-1.5">
            {result.evidence.map((e, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-mono">{name(e.token)}</span>
                  <span className="tabular-nums text-muted-foreground">{(e.weight * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, e.weight * 100)}%` }} />
                </div>
              </div>
            ))}
            {!result.evidence.length && <p className="text-xs text-muted-foreground">No attention evidence available yet.</p>}
          </div>
        </div>
      )}

      {!result && !error && (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Inference runs in the same worker as training, so the answer always reflects the current weights.
        </p>
      )}
    </Card>
  );
}
