// Reusable photograph capture — patient portraits and clinical images.
//
// Uploads straight into the private beneficiary media store when a connection
// is available and falls back to keeping the picture on the device otherwise,
// so nothing is ever lost in the field.

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fileToDataUrl, uploadBeneficiaryMedia, useMediaUrl } from "@/lib/programmeModule/media";

interface Props {
  label: string;
  hint?: string;
  value?: string | null;
  projectId: string;
  beneficiaryId: string;
  /** Called with the stored path (online) or a data URL (offline). */
  onChange: (value: string | null, dataUrl: string | null) => void;
  className?: string;
}

const PhotoCaptureField = ({
  label, hint, value, projectId, beneficiaryId, onChange, className,
}: Props) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const remote = useMediaUrl(value);
  const preview = localPreview || remote;

  const pick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setLocalPreview(dataUrl);
      if (navigator.onLine) {
        try {
          const path = await uploadBeneficiaryMedia(file, projectId, beneficiaryId);
          onChange(path, dataUrl);
        } catch {
          onChange(dataUrl, dataUrl);
          toast({ title: "Picture kept on this device", description: "It will upload with the record." });
        }
      } else {
        onChange(dataUrl, dataUrl);
      }
    } catch (e) {
      toast({ title: "Could not read the picture", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="mt-1.5 flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {preview
            ? <img src={preview} alt={label} className="h-full w-full object-cover" />
            : <Camera className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1 h-3.5 w-3.5" />}
              {preview ? "Replace picture" : "Take / choose picture"}
            </Button>
            {preview && (
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => { setLocalPreview(null); onChange(null, null); }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {!navigator.onLine && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <CloudOff className="h-3 w-3" /> Saved on this device until you are back online.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoCaptureField;
