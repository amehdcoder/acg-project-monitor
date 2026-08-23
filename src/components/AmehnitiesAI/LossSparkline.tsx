/**
 * Training-loss sparkline (canvas, no chart library) — cheap enough to update
 * four times a second forever.
 */
import { useEffect, useRef } from "react";

export default function LossSparkline({ history, height = 110 }: { history: number[]; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;
    const root = getComputedStyle(document.documentElement);
    const primary = root.getPropertyValue("--primary").trim() || "215 90% 55%";
    const min = Math.min(...history), max = Math.max(...history);
    const span = Math.max(max - min, 1e-4);
    const px = (i: number) => (i / (history.length - 1)) * w;
    const py = (v: number) => h - 6 - ((v - min) / span) * (h - 16);

    ctx.beginPath(); ctx.moveTo(px(0), h);
    history.forEach((v, i) => ctx.lineTo(px(i), py(v)));
    ctx.lineTo(px(history.length - 1), h); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${primary} / 0.35)`);
    g.addColorStop(1, `hsl(${primary} / 0)`);
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    history.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = `hsl(${primary})`; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  }, [history]);
  return <canvas ref={ref} className="w-full" style={{ height, display: "block" }} />;
}
