import { useState } from "react";
import { Smartphone, Tablet, Monitor, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import FormPreview from "@/components/FormBuilder/FormPreview";

export type PreviewDevice = "android" | "iphone" | "ipad" | "desktop";

export interface DeviceSpec {
  key: PreviewDevice;
  label: string;
  width: number;
  height: number;
  icon: React.ReactNode;
  /** Corner radius of the device frame in px. */
  radius: number;
}

// Portrait logical CSS dimensions (device-independent pixels) for common
// reference devices. Desktop is rendered borderless / full-bleed.
export const DEVICE_SPECS: Record<PreviewDevice, DeviceSpec> = {
  android: { key: "android", label: "Android", width: 412, height: 892, icon: <Smartphone className="h-4 w-4" />, radius: 36 },
  iphone: { key: "iphone", label: "iPhone", width: 390, height: 844, icon: <Smartphone className="h-4 w-4" />, radius: 48 },
  ipad: { key: "ipad", label: "iPad", width: 820, height: 1080, icon: <Tablet className="h-4 w-4" />, radius: 28 },
  desktop: { key: "desktop", label: "Desktop", width: 1280, height: 800, icon: <Monitor className="h-4 w-4" />, radius: 12 },
};

export const DEVICE_ORDER: PreviewDevice[] = ["android", "iphone", "ipad", "desktop"];

interface AdminDevicePreviewerProps {
  device: PreviewDevice;
  formName: string;
  formDescription?: string;
  questions: any[];
  groups?: any[];
  geofence?: any;
  settings?: any;
  onDeviceChange: (d: PreviewDevice) => void;
  onClose: () => void;
}

/**
 * Full-screen device previewer that renders the real production FormFiller
 * (via FormPreview) inside an accurately-sized device frame. Super Admins can
 * hot-swap between Android / iPhone / iPad / Desktop without any manual device
 * setup. The preview performs no side effects (no DB writes, no tracking).
 */
const AdminDevicePreviewer = ({
  device,
  formName,
  formDescription,
  questions,
  groups,
  geofence,
  settings,
  onDeviceChange,
  onClose,
}: AdminDevicePreviewerProps) => {
  const spec = DEVICE_SPECS[device] ?? DEVICE_SPECS.android;
  const isDesktop = device === "desktop";
  // Remount the FormFiller when device changes so it re-measures cleanly.
  const [renderKey, setRenderKey] = useState(0);
  const reload = () => setRenderKey((k) => k + 1);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-neutral-900/95 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{formName || "Untitled Form"}</p>
          <p className="text-[11px] text-white/50">
            Quick Preview · {spec.label} · {spec.width}×{spec.height}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1">
          {DEVICE_ORDER.map((d) => {
            const s = DEVICE_SPECS[d];
            const active = d === device;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDeviceChange(d)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-white text-neutral-900 shadow" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                {s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={reload} className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white" title="Reload preview">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white" title="Close preview">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        <div
          className={cn(
            "relative bg-background shadow-2xl transition-all duration-300",
            isDesktop ? "border border-white/10" : "border-[10px] border-neutral-800 ring-1 ring-black/40"
          )}
          style={{
            width: spec.width,
            height: spec.height,
            maxWidth: "100%",
            maxHeight: "100%",
            borderRadius: spec.radius,
          }}
        >
          <div className="h-full w-full overflow-hidden" style={{ borderRadius: Math.max(spec.radius - 10, 0) }}>
            <FormPreview
              key={`${device}-${renderKey}`}
              formName={formName}
              formDescription={formDescription || ""}
              questions={questions}
              groups={groups}
              geofence={geofence}
              settings={settings}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDevicePreviewer;
