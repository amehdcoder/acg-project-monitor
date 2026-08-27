/**
 * Live learning chart — cross-entropy loss and gradient norm on a shared time
 * axis, drawn on canvas so it can refresh continuously without chart-library
 * overhead. Loss uses the left scale, gradient norm the right scale.
 */
import { useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "lucide-react";
import type { MetricSample } from "@/hooks/useAmehnitiesBrain";

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export default function LiveLearningChart({
  metrics, running, height = 220, windowSize = 240,
}: { metrics: MetricSample[]; running: boolean; height?: number; windowSize?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const data = useMemo(() => metrics.slice(-windowSize), [metrics, windowSize]);
  const latest = data[data.length - 1];
  const spanMs = data.length > 1 ? data[data.length - 1].at - data[0].at : 0;

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;

    const primary = cssVar("--primary", "215 90% 55%");
    const border = cssVar("--border", "220 13% 88%");
    const grad = "25 95% 53%"; // warm orange for the backward-pass signal

    const padL = 44, padR = 46, padT = 12, padB = 20;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);

    const loss = data.map((d) => d.loss || 0);
    const gn = data.map((d) => d.gradNorm || 0);
    const range = (a: number[]) => {
      const min = Math.min(...a), max = Math.max(...a);
      const span = Math.max(max - min, 1e-6);
      return { min: min - span * 0.08, max: max + span * 0.08 };
    };
    const rL = range(loss), rG = range(gn);
    const px = (i: number) => padL + (i / (data.length - 1)) * plotW;
    const py = (v: number, r: { min: number; max: number }) =>
      padT + plotH - ((v - r.min) / (r.max - r.min)) * plotH;

    // grid + axis labels
    ctx.strokeStyle = `hsl(${border} / 0.7)`;
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH / 4) * g;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const lv = rL.max - ((rL.max - rL.min) / 4) * g;
      const gv = rG.max - ((rG.max - rG.min) / 4) * g;
      ctx.fillStyle = `hsl(${primary} / 0.85)`;
      ctx.textAlign = "right"; ctx.fillText(lv.toFixed(2), padL - 6, y);
      ctx.fillStyle = `hsl(${grad} / 0.85)`;
      ctx.textAlign = "left"; ctx.fillText(gv.toFixed(2), padL + plotW + 6, y);
    }

    // loss area + line
    ctx.beginPath(); ctx.moveTo(px(0), padT + plotH);
    loss.forEach((v, i) => ctx.lineTo(px(i), py(v, rL)));
    ctx.lineTo(px(loss.length - 1), padT + plotH); ctx.closePath();
    const fill = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    fill.addColorStop(0, `hsl(${primary} / 0.28)`);
    fill.addColorStop(1, `hsl(${primary} / 0)`);
    ctx.fillStyle = fill; ctx.fill();

    ctx.beginPath();
    loss.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v, rL)) : ctx.moveTo(px(i), py(v, rL))));
    ctx.strokeStyle = `hsl(${primary})`; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();

    // gradient norm line (dashed, right axis)
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    gn.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v, rG)) : ctx.moveTo(px(i), py(v, rG))));
    ctx.strokeStyle = `hsl(${grad} / 0.9)`; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();

    // head markers
    ctx.beginPath();
    ctx.arc(px(loss.length - 1), py(loss[loss.length - 1], rL), 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${primary})`; ctx.fill();
    ctx.beginPath();
    ctx.arc(px(gn.length - 1), py(gn[gn.length - 1], rG), 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${grad})`; ctx.fill();
  }, [data]);

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LineChart className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Live learning curve</h3>
        <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
          {running ? "learning" : "paused"}
        </Badge>
        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-primary" />
            loss {latest ? latest.loss.toFixed(4) : "—"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-[hsl(25_95%_53%)]" />
            ∇ {latest ? latest.gradNorm.toFixed(3) : "—"}
          </span>
        </div>
      </div>

      {data.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Collecting the first training samples…</p>
      ) : (
        <canvas ref={ref} className="w-full" style={{ height, display: "block" }} />
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Cross-entropy loss (left axis, filled) against gradient L2 norm (right axis, dashed) over the last{" "}
        {data.length} samples{spanMs > 0 ? ` · ${Math.round(spanMs / 1000)}s` : ""}. Falling loss with a stable
        gradient norm means backpropagation is converging smoothly.
      </p>
    </Card>
  );
}
