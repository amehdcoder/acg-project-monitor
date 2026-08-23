/**
 * Training metrics dashboard — multi-series time charts (loss, gradient norm,
 * throughput, attention entropy, tokens processed) drawn on canvas so they can
 * refresh four times a second without any chart-library overhead.
 */
import { useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Gauge, Timer, Waves, Binary, TrendingDown } from "lucide-react";
import type { MetricSample } from "@/hooks/useAmehnitiesBrain";

type Series = { key: keyof MetricSample; label: string; unit: string; icon: any; hint: string; format: (v: number) => string };

const fmtNum = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(n < 10 ? 2 : 0);

const SERIES: Series[] = [
  { key: "loss", label: "Cross-entropy loss", unit: "nats", icon: TrendingDown, hint: "Lower is better — the model is compressing activity patterns.", format: (v) => v.toFixed(4) },
  { key: "gradNorm", label: "Gradient norm", unit: "L2", icon: Gauge, hint: "Stability of the optimisation. Spikes mean the learning rate is too hot.", format: (v) => v.toFixed(3) },
  { key: "tokensPerSec", label: "Throughput", unit: "tok/s", icon: Timer, hint: "Tokens consumed per second inside the worker budget.", format: (v) => fmtNum(v) },
  { key: "stepsPerSec", label: "Optimiser steps", unit: "step/s", icon: Activity, hint: "Adam updates per second at the current batch size.", format: (v) => v.toFixed(2) },
  { key: "entropy", label: "Attention entropy", unit: "nats", icon: Waves, hint: "How diffuse attention is. Falling entropy = heads are specialising.", format: (v) => v.toFixed(3) },
  { key: "tokensSeen", label: "Tokens processed", unit: "cumulative", icon: Binary, hint: "Total tokens the network has back-propagated through.", format: (v) => fmtNum(v) },
];

function SeriesChart({ data, height = 74, area }: { data: number[]; height?: number; area?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    const root = getComputedStyle(document.documentElement);
    const primary = root.getPropertyValue("--primary").trim() || "215 90% 55%";
    const border = root.getPropertyValue("--border").trim() || "220 13% 88%";
    const min = Math.min(...data), max = Math.max(...data);
    const span = Math.max(max - min, 1e-6);
    const px = (i: number) => (i / (data.length - 1)) * w;
    const py = (v: number) => h - 8 - ((v - min) / span) * (h - 18);

    ctx.strokeStyle = `hsl(${border} / 0.7)`; ctx.lineWidth = 1;
    for (let g = 1; g <= 2; g++) {
      const y = (h / 3) * g;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (area) {
      ctx.beginPath(); ctx.moveTo(px(0), h);
      data.forEach((v, i) => ctx.lineTo(px(i), py(v)));
      ctx.lineTo(px(data.length - 1), h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `hsl(${primary} / 0.30)`);
      g.addColorStop(1, `hsl(${primary} / 0)`);
      ctx.fillStyle = g; ctx.fill();
    }

    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = `hsl(${primary})`; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke();

    ctx.beginPath();
    ctx.arc(px(data.length - 1), py(data[data.length - 1]), 2.6, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${primary})`; ctx.fill();
  }, [data, area]);
  return <canvas ref={ref} className="w-full" style={{ height, display: "block" }} />;
}

export default function TrainingMetricsDashboard({
  metrics, running,
}: { metrics: MetricSample[]; running: boolean }) {
  const window = useMemo(() => metrics.slice(-180), [metrics]);
  const latest = window[window.length - 1];
  const spanMs = window.length > 1 ? window[window.length - 1].at - window[0].at : 0;

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Training telemetry</h3>
        <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
          {running ? "streaming" : "paused"}
        </Badge>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {window.length} samples{spanMs > 0 ? ` · last ${Math.round(spanMs / 1000)}s` : ""}
        </span>
      </div>

      {window.length < 2 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Collecting the first training samples…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SERIES.map((s) => {
            const data = window.map((m) => Number(m[s.key]) || 0);
            return (
              <div key={String(s.key)} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    <s.icon className="h-3.5 w-3.5 text-primary" />
                    {s.label}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {latest ? s.format(Number(latest[s.key]) || 0) : "—"}
                    <span className="ml-1 text-[10px] text-muted-foreground">{s.unit}</span>
                  </span>
                </div>
                <div className="mt-2"><SeriesChart data={data} area={s.key === "loss" || s.key === "tokensSeen"} /></div>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{s.hint}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
