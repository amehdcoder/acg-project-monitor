/**
 * Per-layer causal attention heat maps (mean over heads), rendered on tiny
 * canvases so adding layers never costs DOM nodes.
 */
import { useEffect, useRef } from "react";

function HeatMap({ map, size = 96 }: { map: number[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const n = Math.max(1, Math.round(Math.sqrt(map.length)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "215 90% 55%";
    let max = 1e-6; for (const v of map) if (v > max) max = v;
    const cell = size / n;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = (map[i * n + j] || 0) / max;
      ctx.fillStyle = `hsl(${raw} / ${Math.min(1, v * 1.15).toFixed(3)})`;
      ctx.fillRect(j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }, [map, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-md border border-border/60 bg-muted/30" />;
}

export default function AttentionMaps({ attention, headEntropy, nHeads }: { attention: number[][]; headEntropy: number[]; nHeads: number }) {
  if (!attention.length) {
    return <p className="text-sm text-muted-foreground">Waiting for the first forward pass…</p>;
  }
  return (
    <div className="flex flex-wrap gap-4">
      {attention.map((map, l) => {
        const ents = headEntropy.slice(l * nHeads, (l + 1) * nHeads);
        const avg = ents.length ? ents.reduce((a, b) => a + b, 0) / ents.length : 0;
        return (
          <div key={l} className="space-y-1.5">
            <HeatMap map={map} />
            <div className="text-[11px] leading-tight text-muted-foreground">
              <div className="font-medium text-foreground">Block {l + 1}</div>
              <div>entropy {avg.toFixed(2)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
