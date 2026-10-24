import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Tablet, Sparkles, Check, X, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyDeviceFit, fitEnabled } from "@/lib/deviceFit";

const DEVICES = [
  { key: "desktop", label: "Desktop", w: 1366, h: 820, icon: Monitor },
  { key: "tablet", label: "Tablet", w: 820, h: 1180, icon: Tablet },
  { key: "android", label: "Android", w: 412, h: 915, icon: Smartphone },
  { key: "ios", label: "iOS", w: 390, h: 844, icon: Smartphone },
] as const;
type Device = (typeof DEVICES)[number];

/**
 * Live device preview of the whole records workspace. The preview frame is
 * loaded in the background as soon as the workspace opens and stays mounted,
 * so opening the preview or switching devices is instant (only its size changes).
 */
export default function DevicePreviewDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId?: string }) {
  const [device, setDevice] = useState<Device>(DEVICES[2]);
  const [fit, setFit] = useState(fitEnabled());
  const [scale, setScale] = useState(1);
  const [preload, setPreload] = useState(false);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const embedded = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lbrEmbed");
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  // Warm the frame shortly after the workspace loads (or immediately when opened).
  useEffect(() => {
    if (embedded) return;
    if (open) { setPreload(true); return; }
    const t = setTimeout(() => setPreload(true), 1500);
    return () => clearTimeout(t);
  }, [open, embedded]);

  // Mirror device + fit into the framed app (same origin) without reloading it.
  const sync = useCallback(() => {
    const root = frame.current?.contentDocument?.documentElement;
    if (!root) return;
    root.dataset.lbrDevice = device.key;
    root.dataset.lbrFit = fit ? "on" : "off";
  }, [device, fit]);
  useEffect(sync, [sync, ready]);

  // Consider the frame ready once the records workspace has actually rendered.
  useEffect(() => {
    if (!preload) return;
    setReady(false);
    const t = setInterval(() => {
      const doc = frame.current?.contentDocument;
      if ((doc?.body?.innerText?.trim().length ?? 0) > 120) { setReady(true); clearInterval(t); }
    }, 150);
    return () => clearInterval(t);
  }, [preload, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = box.current; if (!el) return;
      setScale(Math.min(1, (el.clientWidth - 24) / device.w, (el.clientHeight - 24) / device.h));
    };
    measure();
    const ro = new ResizeObserver(measure); if (box.current) ro.observe(box.current);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", esc);
    return () => { ro.disconnect(); window.removeEventListener("keydown", esc); };
  }, [open, device, onOpenChange]);

  const toggleFit = () => { const next = !fit; setFit(next); applyDeviceFit(next); };
  const src = `/?tab=records${projectId ? `&project=${projectId}` : ""}&lbrEmbed=1`;

  if (!preload || embedded) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Device preview" aria-hidden={!open}
      className={cn("fixed inset-0 z-[2147483000] flex items-center justify-center bg-foreground/60 p-2 sm:p-4", !open && "pointer-events-none invisible")}>
      <div className="flex h-[94dvh] w-[96vw] flex-col gap-3 rounded-xl bg-background p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Device preview</h2>
            <p className="text-sm text-muted-foreground">The full Longitudinal Beneficiary Records workspace, live, on each device. Fit it to every screen in one click.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close preview" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DEVICES.map((d) => (
            <Button key={d.key} size="sm" variant={device.key === d.key ? "default" : "outline"} className="gap-1.5" onClick={() => setDevice(d)}>
              <d.icon className="h-4 w-4" /> {d.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">{device.w}×{device.h} · {Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" aria-label="Reload preview" onClick={() => setReloadKey((k) => k + 1)}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={toggleFit} className={cn("ml-auto gap-1.5", fit && "bg-health-teal text-primary-foreground hover:bg-health-teal/90")}>
            {fit ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {fit ? "Fitted to all devices" : "Fit to all devices"}
          </Button>
        </div>
        <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-muted">
          <div className="absolute left-1/2 top-3 origin-top overflow-hidden border-[10px] border-foreground/80 bg-background shadow-card transition-[width,height] duration-200"
            style={{ width: device.w, height: device.h, transform: `translateX(-50%) scale(${scale})`, borderRadius: device.key === "desktop" ? 12 : 28 }}>
            <iframe ref={frame} key={reloadKey} title="Records device preview" src={src} onLoad={sync} className="h-full w-full border-0" />
            {!ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Preparing the records workspace…</p>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Fit to all devices makes text follow each phone's own font size setting, keeps buttons easy to tap and stops anything spilling off the screen.</p>
      </div>
    </div>,
    document.body,
  );
}
