import { useRef } from "react";
import { Ban, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BackgroundMode } from "@/hooks/useVirtualBackground";

import bgOffice from "@/assets/bg-office.jpg";
import bgBeach from "@/assets/bg-beach.jpg";
import bgLibrary from "@/assets/bg-library.jpg";
import bgAbstract from "@/assets/bg-abstract.jpg";

const PRESET_BACKGROUNDS = [
  { id: "office", label: "Office", src: bgOffice },
  { id: "beach", label: "Beach", src: bgBeach },
  { id: "library", label: "Library", src: bgLibrary },
  { id: "abstract", label: "Abstract", src: bgAbstract },
];

interface VirtualBackgroundPickerProps {
  mode: BackgroundMode;
  isProcessing: boolean;
  onBlur: () => void;
  onImage: (url: string) => void;
  onDisable: () => void;
  children: React.ReactNode;
}

export function VirtualBackgroundPicker({
  mode,
  isProcessing,
  onBlur,
  onImage,
  onDisable,
  children,
}: VirtualBackgroundPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onImage(url);
    e.target.value = "";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="top" align="center">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Virtual Background</h4>

          {isProcessing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing...
            </div>
          )}

          {/* Option row: None + Blur */}
          <div className="flex gap-2">
            <button
              onClick={onDisable}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors flex-1 ${
                mode === "none"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <Ban className="h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] text-foreground">None</span>
            </button>
            <button
              onClick={onBlur}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors flex-1 ${
                mode === "blur"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className="h-6 w-6 rounded bg-gradient-to-br from-muted to-muted-foreground/30 blur-[2px]" />
              <span className="text-[10px] text-foreground">Blur</span>
            </button>
          </div>

          {/* Preset images */}
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                onClick={() => onImage(bg.src)}
                className="rounded-md overflow-hidden border border-border hover:border-primary transition-colors aspect-video"
                title={bg.label}
              >
                <img
                  src={bg.src}
                  alt={bg.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>

          {/* Custom upload */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Custom
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
