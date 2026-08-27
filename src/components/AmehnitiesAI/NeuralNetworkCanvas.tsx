/**
 * Live, GPU-cheap 2.5D visualisation of the Amehnities AI Transformer.
 *
 * Draws the real architecture reported by the worker: token + positional
 * embeddings → N pre-LN blocks (multi-head causal attention + GELU FFN) →
 * final LayerNorm → vocabulary head. Node brightness follows the measured
 * per-layer activation energy and weight norms, so what you see is the model
 * actually training, not a decorative loop.
 *
 * The structure itself is live: when the network grows (neurogenesis) new
 * blocks and heads fade in, the layout eases into its new shape, and a growth
 * ripple sweeps the canvas — all driven by the telemetry stream, so the picture
 * always matches the model that exists right now.
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
const fmt = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

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
    // eased structure so growth animates instead of snapping
    let easedColumns = 0;
    const birth = new Map<string, number>();
    let lastParams = 0;
    let growthPulse = -1;      // seconds since the last structural change
    let displayParams = 0;     // parameter counter ticks up smoothly

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
      t += dt; // structural animation continues even while training is paused

      const tel = telRef.current;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);

      const primary = cssHsl("--primary", "hsl(215 90% 55%)");
      const accentLine = cssHsla("--primary", 0.16, "rgba(80,140,255,.16)");
      const muted = cssHsla("--muted-foreground", 0.55, "rgba(140,150,170,.55)");
      const fg = cssHsl("--foreground", "#e8ecf5");

      const nLayers = tel?.cfg.nLayers ?? 4;
      const nHeads = tel?.cfg.nHeads ?? 4;
      const params = tel?.params ?? 0;

      // ---- detect growth and start the ripple
      if (params !== lastParams) {
        if (lastParams && params > lastParams) growthPulse = 0;
        lastParams = params;
      }
      if (growthPulse >= 0) growthPulse += dt;
      if (growthPulse > 2.2) growthPulse = -1;
      displayParams += (params - displayParams) * Math.min(1, dt * 3);

      const columns = nLayers * 2 + 2; // embed + (attn, ffn) * L + head
      easedColumns = easedColumns === 0 ? columns : easedColumns + (columns - easedColumns) * Math.min(1, dt * 4);

      const padX = 46, padY = 40;
      const colW = (W - padX * 2) / Math.max(easedColumns - 1, 1);
      const energy = tel?.layerEnergy ?? [];
      const norms = tel?.weightNorms ?? [];
      const maxE = Math.max(1e-3, ...energy);

      // ---- measured backpropagation signal (∂L/∂W per stage)
      const flow = tel?.gradFlow ?? null;
      const gradPerColumn: number[] = new Array(columns).fill(0);
      if (flow) {
        gradPerColumn[0] = flow.embed;
        for (let l = 0; l < nLayers; l++) {
          gradPerColumn[1 + l * 2] = flow.blocks[l]?.attn ?? 0;
          gradPerColumn[2 + l * 2] = flow.blocks[l]?.ffn ?? 0;
        }
        gradPerColumn[columns - 1] = flow.head;
      }
      const maxG = Math.max(1e-6, ...gradPerColumn);
      const gradAt = (c: number) => Math.min(1, (gradPerColumn[c] ?? 0) / maxG);

      // Forward pass then backward pass, in alternating sweeps, so the picture
      // shows the real training loop: activations flow →, gradients flow ←.
      const CYCLE = 3.0;
      const phaseT = running ? t % CYCLE : 0;
      const backward = running && phaseT >= CYCLE / 2;
      const sweep = running ? ((phaseT % (CYCLE / 2)) / (CYCLE / 2)) : 0;

      type Node = { x: number; y: number; r: number; a: number };
      const cols: Node[][] = [];
      const colMeta: { label: string; kind: "embed" | "attn" | "ffn" | "head"; fresh: number }[] = [];

      const makeCol = (index: number, count: number, intensity: number, kind: any, label: string) => {
        const n = Math.min(count, MAX_NODES_PER_COLUMN);
        // fade newly created structure in
        const key = `${label}:${n}`;
        if (!birth.has(key)) birth.set(key, t);
        const age = t - (birth.get(key) ?? t);
        const fresh = Math.min(1, age / 0.9);

        const nodes: Node[] = [];
        const usable = H - padY * 2;
        for (let i = 0; i < n; i++) {
          const y = padY + (n === 1 ? usable / 2 : (usable * i) / (n - 1));
          const wave = 0.5 + 0.5 * Math.sin(t * 1.6 + index * 0.7 + i * 0.55);
          nodes.push({
            x: padX + index * colW,
            y,
            r: (3.4 + intensity * 3.2 + wave * 1.4) * (0.35 + 0.65 * fresh),
            a: (0.35 + intensity * 0.5 + wave * 0.15) * fresh,
          });
        }
        cols.push(nodes);
        colMeta.push({ kind, label, fresh });
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
        if (!a.length || !b.length) continue;
        ctx.strokeStyle = accentLine;
        ctx.beginPath();
        for (const p of a) for (const q of b) {
          ctx.moveTo(p.x, p.y);
          ctx.bezierCurveTo(p.x + colW * 0.45, p.y, q.x - colW * 0.45, q.y, q.x, q.y);
        }
        ctx.stroke();
      }

      // ---- travelling signal pulses (one per column pair)
      // Forward phase: activations sweep left → right in the primary colour.
      // Backward phase: gradients sweep right → left in a contrasting colour,
      // with pulse brightness scaled by the measured ∂L/∂W of that stage, so
      // the layers actually learning glow the hardest during backprop.
      if (running) {
        const gradHue = "hsl(18 95% 58%)"; // warm orange = gradient descent
        for (let c = 0; c < cols.length - 1; c++) {
          const a = cols[c], b = cols[c + 1];
          if (!a.length || !b.length) continue;
          const phase = (t * 0.55 + c * 0.12) % 1;
          // during backprop the pulse travels from the deeper column back
          const p = backward ? b[(c * 5) % b.length] : a[(c * 3) % a.length];
          const q = backward ? a[(c * 3) % a.length] : b[(c * 5) % b.length];
          const mt = phase;
          const x = (1 - mt) ** 3 * p.x + 3 * (1 - mt) ** 2 * mt * (p.x + colW * 0.45) + 3 * (1 - mt) * mt ** 2 * (q.x - colW * 0.45) + mt ** 3 * q.x;
          const y = (1 - mt) ** 3 * p.y + 3 * (1 - mt) ** 2 * mt * p.y + 3 * (1 - mt) * mt ** 2 * q.y + mt ** 3 * q.y;
          const intensity = backward ? 0.25 + 0.75 * Math.max(gradAt(c), gradAt(c + 1)) : 1;
          const size = backward ? 8 + 8 * intensity : 12;
          ctx.globalAlpha = intensity;
          const g = ctx.createRadialGradient(x, y, 0, x, y, size);
          g.addColorStop(0, backward ? gradHue : primary);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }

        // gradient-magnitude underlay on edges during backprop: edges feeding
        // high-gradient stages brighten so the "learning heat" is structural
        if (backward) {
          for (let c = 0; c < cols.length - 1; c++) {
            const gi = gradAt(c);
            if (gi < 0.05) continue;
            const a = cols[c], b = cols[c + 1];
            if (!a.length || !b.length) continue;
            ctx.strokeStyle = `hsl(18 95% 58% / ${(0.05 + gi * 0.3).toFixed(3)})`;
            ctx.beginPath();
            for (const p of a) for (const q of b) {
              ctx.moveTo(p.x, p.y);
              ctx.bezierCurveTo(p.x + colW * 0.45, p.y, q.x - colW * 0.45, q.y, q.x, q.y);
            }
            ctx.stroke();
          }
        }
      }

      // ---- nodes
      for (let c = 0; c < cols.length; c++) {
        const meta = colMeta[c];
        if (!cols[c].length) continue;
        for (const n of cols[c]) {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.6);
          glow.addColorStop(0, cssHsla("--primary", Math.min(0.4, n.a), "rgba(90,150,255,.4)"));
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.6, 0, Math.PI * 2); ctx.fill();

          ctx.fillStyle = meta.kind === "attn" ? primary : cssHsla("--foreground", Math.min(1, n.a + 0.2), fg);
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = meta.fresh;
        ctx.fillStyle = muted;
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(meta.label, cols[c][0].x, H - 10);
        ctx.globalAlpha = 1;
      }

      // ---- growth ripple sweeping across the network
      if (growthPulse >= 0) {
        const p = growthPulse / 2.2;
        const x = padX + p * (W - padX * 2);
        const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.5, cssHsla("--primary", 0.35 * (1 - p), "rgba(90,150,255,.3)"));
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(x - 60, 0, 120, H);
      }

      // ---- live parameter HUD
      ctx.textAlign = "left";
      ctx.font = "600 12px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = cssHsla("--foreground", 0.9, fg);
      ctx.fillText(`${fmt(Math.round(displayParams))} params`, 12, 18);
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = muted;
      ctx.fillText(`${nLayers} blocks · ${nHeads} heads · d${tel?.cfg.dModel ?? 0} · ctx ${tel?.cfg.ctx ?? 0}`, 12, 32);

      // ---- optimisation HUD: real gradient-descent telemetry
      const upd = tel?.updateNorm ?? 0;
      const clip = tel?.clipScale ?? 1;
      const lr = tel?.lr ?? 0;
      const gTot = gradPerColumn.reduce((s, v) => s + v, 0);
      ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = muted;
      ctx.fillText(
        `∇L ${gTot.toFixed(2)} · lr ${lr.toExponential(1)} · Δw ${upd.toFixed(3)}${clip < 0.999 ? ` · clip ×${clip.toFixed(2)}` : ""}`,
        12, 46,
      );
      // phase indicator: FORWARD (activations) / BACKPROP (gradients)
      ctx.textAlign = "right";
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      if (running) {
        ctx.fillStyle = backward ? "hsl(18 95% 58%)" : primary;
        ctx.fillText(backward ? "← BACKPROP · gradient descent" : "FORWARD → activations", W - 12, 32);
      } else {
        ctx.fillStyle = muted;
        ctx.fillText("PAUSED", W - 12, 32);
      }
      if (growthPulse >= 0) {
        ctx.fillStyle = primary;
        ctx.fillText("NEUROGENESIS — capacity added", W - 12, 18);
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
