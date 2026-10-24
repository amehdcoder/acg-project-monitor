import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Tablet, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyDeviceFit, fitEnabled } from "@/lib/deviceFit";

const DEVICES = [
  { key: "desktop", label: "Desktop", w: 1366, h: 820, icon: Monitor },
  { key: "tablet", label: "Tablet", w: 820, h: 1180, icon: Tablet },
  { key: "android", label: "Android", w: 412, h: 915, icon: Smartphone },
  { key: "ios", label: "iOS", w: 390, h: 844, icon: Smartphone },
] as const;

export default function DevicePreviewDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId?: string }) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[2]);
  const [fit, setFit] = useState(fitEnabled());
  const [scale, setScale] = useState(1);
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = box.current; if (!el) return;
      setScale(Math.min(1, (el.clientWidth - 24) / device.w, (el.clientHeight - 24) / device.h));
    };
    measure();
    const ro = new ResizeObserver(measure); if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [open, device]);

  const toggleFit = () => { const next = !fit; setFit(next); applyDeviceFit(next); setNonce((n) => n + 1); };
  const src = `/?tab=records${projectId ? `&project=${projectId}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] max-w-[96vw] flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle>Device preview</DialogTitle>
          <DialogDescription>See the records workspace as it appears on each device, then fit it to every screen in one click.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {DEVICES.map((d) => (
            <Button key={d.key} size="sm" variant={device.key === d.key ? "default" : "outline"} className="gap-1.5" onClick={() => setDevice(d)}>
              <d.icon className="h-4 w-4" /> {d.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">{device.w}×{device.h} · {Math.round(scale * 100)}%</span>
          <Button size="sm" onClick={toggleFit} className={cn("ml-auto gap-1.5", fit && "bg-health-teal text-primary-foreground hover:bg-health-teal/90")}>
            {fit ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {fit ? "Fitted to all devices" : "Fit to all devices"}
          </Button>
        </div>
        <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-muted">
          <div className="absolute left-1/2 top-3 origin-top overflow-hidden rounded-[28px] border-[10px] border-foreground/80 bg-background shadow-card"
            style={{ width: device.w, height: device.h, transform: `translateX(-50%) scale(${scale})`, borderRadius: device.key === "desktop" ? 12 : 28 }}>
            <iframe key={`${device.key}-${nonce}`} title={`${device.label} preview`} src={src} className="h-full w-full border-0" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Fit to all devices makes text follow each phone's own font size setting, keeps buttons easy to tap and stops anything spilling off the screen.</p>
      </DialogContent>
    </Dialog>
  );
}
