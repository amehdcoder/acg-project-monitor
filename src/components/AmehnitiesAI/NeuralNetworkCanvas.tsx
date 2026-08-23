/**
 * Live, GPU-cheap 2.5D visualisation of the Amehnities AI Transformer.
 *
 * Draws the real architecture reported by the worker: token + positional
 * embeddings → N pre-LN blocks (multi-head causal attention + GELU FFN) →
 * final LayerNorm → vocabulary head. Node brightness follows the measured
 * per-layer activation energy and weight norms, so what you see is the model
 * actually training, not a decorative loop.
 *
 * Performance guards: capped DPR, capped node count, 30fps throttle, animation
 * suspended when the canvas is offscreen or the tab is hidden.
 */
import { useEffect, useRef } from "react";
import type { Telemetry } from "@/hooks/useAmehnitiesBrain";

interface Props { telemetry: Telemetry | null; running: boolean; height?: number }

function cssHsl(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
}
function cssHsla(name: string, alpha: number, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw} / ${alpha})` : fallback;
}

const MAX_NODES_PER_COLUMN = 14;

export default function NeuralNetworkCanvas({ telemetry, running, height = 420 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const telRef = useRef<Telemetry | null>(telemetry);
  const visibleRef = useRef(true);
  telRef.current = telemetry;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0, last = 0, t = 0;
    const io = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(canvas);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visibleRef.current || document.hidden) return;
      if (now - last < 33) return; // 30fps ceiling
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (running) t += dt;

      const tel = telRef.current;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);

      const primary = cssHsl("--primary", "hsl(215 90% 55%)");
      const accentLine = cssHsla("--primary", 0.16, "rgba(80,140,255,.16)");
      const muted = cssHsla("--muted-foreground", 0.55, "rgba(140,150,170,.55)");
      const fg = cssHsl("--foreground", "#e8ecf5");

      const nLayers = tel?.cfg.nLayers ?? 4;
      const nHeads = tel?.cfg.nHeads ?? 4;
      const columns = nLayers * 2 + 2; // embed + (attn, ffn) * L + head
      const padX = 46, padY = 34;
      const colW = (W - padX * 2) / Math.max(columns - 1, 1);
      const energy = tel?.layerEnergy ?? [];
      const norms = tel?.weightNorms ?? [];
      const maxE = Math.max(1e-3, ...energy);

      type Node = { x: number; y: number; r: number; a: number };
      const cols: Node[][] = [];
      const colMeta: { label: string; kind: "embed" | "attn" | "ffn" | "head" }[] = [];

      const makeCol = (index: number, count: number, intensity: number, kind: any, label: string) => {
        const n = Math.min(count, MAX_NODES_PER_COLUMN);
        const nodes: Node[] = [];
        const usable = H - padY * 2;
        for (let i = 0; i < n; i++) {
          const y = padY + (n === 1 ? usable / 2 : (usable * i) / (n - 1));
          const wave = 0.5 + 0.5 * Math.sin(t * 1.6 + index * 0.7 + i * 0.55);
          nodes.push({ x: padX + index * colW, y, r: 3.4 + intensity * 3.2 + wave * 1.4, a: 0.35 + intensity * 0.5 + wave * 0.15 });
        }
        cols.push(nodes);
        colMeta.push({ kind, label });
      };

      makeCol(0, 10, 0.6, "embed", "embed");
      for (let l = 0; l < nLayers; l++) {
        const e = Math.min(1, (energy[l] ?? 0) / maxE);
        const nf = Math.min(1, (norms[l]?.ff ?? 0.02) * 25);
        makeCol(1 + l * 2, nHeads, e, "attn", `attn ${l + 1}`);
        makeCol(2 + l * 2, 8, nf, "ffn", `ffn ${l + 1}`);
      }
      makeCol(columns - 1, 6, 0.7, "head", "head");

      // ---- connections
      ctx.lineWidth = 1;
      for (let c = 0; c < cols.length - 1; c++) {
        const a = cols[c], b = cols[c + 1];
        ctx.strokeStyle = accentLine;
        ctx.beginPath();
        for (const p of a) for (const q of b) {
          ctx.moveTo(p.x, p.y);
          ctx.bezierCurveTo(p.x + colW * 0.45, p.y, q.x - colW * 0.45, q.y, q.x, q.y);
        }
        ctx.stroke();
      }

      // ---- travelling activations (bounded: one pulse per column pair)
      if (running) {
        for (let c = 0; c < cols.length - 1; c++) {
          const a = cols[c], b = cols[c + 1];
          const phase = (t * 0.55 + c * 0.12) % 1;
          const p = a[(c * 3) % a.length], q = b[(c * 5) % b.length];
          const mt = phase;
          const x = (1 - mt) ** 3 * p.x + 3 * (1 - mt) ** 2 * mt * (p.x + colW * 0.45) + 3 * (1 - mt) * mt ** 2 * (q.x - colW * 0.45) + mt ** 3 * q.x;
          const y = (1 - mt) ** 3 * p.y + 3 * (1 - mt) ** 2 * mt * p.y + 3 * (1 - mt) * mt ** 2 * q.y + mt ** 3 * q.y;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
          g.addColorStop(0, primary);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ---- nodes
      for (let c = 0; c < cols.length; c++) {
        const meta = colMeta[c];
        for (const n of cols[c]) {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.6);
          glow.addColorStop(0, cssHsla("--primary", Math.min(0.4, n.a), "rgba(90,150,255,.4)"));
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.6, 0, Math.PI * 2); ctx.fill();

          ctx.fillStyle = meta.kind === "attn" ? primary : cssHsla("--foreground", Math.min(1, n.a + 0.2), fg);
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = muted;
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(meta.label, cols[c][0].x, H - 10);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); };
  }, [running]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl"
      style={{ height, display: "block" }}
      aria-label="Live Transformer architecture visualisation"
      role="img"
    />
  );
}
