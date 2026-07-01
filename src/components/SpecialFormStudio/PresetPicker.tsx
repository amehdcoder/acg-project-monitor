import { ChevronLeft, Sparkles, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STUDIO_PRESETS, type StudioPreset } from "@/lib/specialStudio/presets";

interface Props {
  onPick: (preset: StudioPreset) => void;
  onClose: () => void;
}

export default function PresetPicker({ onPick, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Exit
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Choose a starter</div>
            <div className="text-[11px] text-muted-foreground">Presets come with a linked dashboard pre-wired</div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto grid max-w-4xl gap-3 p-4 sm:grid-cols-2">
          {STUDIO_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPick(p)}
              className="group flex flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ borderTopColor: p.accent, borderTopWidth: 3 }}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ background: p.accent }}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold">{p.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{p.subtitle}</p>
              {p.key !== "blank" && (
                <span
                  className="mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: `${p.accent}1a`, color: p.accent }}
                >
                  Dashboard pre-wired
                </span>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
