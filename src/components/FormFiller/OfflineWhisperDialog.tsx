/**
 * OfflineWhisperDialog
 *
 * One-time download / language picker for the in-browser Whisper STT engine.
 * Surfaces realistic accuracy expectations per language (no "98%" claims) and
 * shows download progress for the ~250MB whisper-small model.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, Download, Wifi, AlertCircle, Languages, Sparkles } from "lucide-react";
import type {
  WhisperLanguage,
  WhisperProgress,
  WhisperStatus,
} from "@/hooks/useOfflineWhisper";

export interface WhisperLanguageOption {
  value: WhisperLanguage;
  label: string;
  /** Honest, qualitative accuracy band shown to users. */
  accuracy: "Strong" | "Good" | "Beta";
  note?: string;
}

const LANGUAGES: WhisperLanguageOption[] = [
  { value: "en", label: "English (incl. Nigerian)", accuracy: "Strong" },
  { value: "yo", label: "Yoruba", accuracy: "Good" },
  { value: "ha", label: "Hausa", accuracy: "Beta", note: "Lower-resource — accuracy varies." },
  { value: "ig", label: "Igbo", accuracy: "Beta", note: "Lower-resource — accuracy varies." },
  { value: "fr", label: "French", accuracy: "Strong" },
  { value: "ar", label: "Arabic", accuracy: "Good" },
  { value: "auto", label: "Auto-detect", accuracy: "Good", note: "Slower, may misdetect short clips." },
];

const ACCURACY_TONE: Record<WhisperLanguageOption["accuracy"], string> = {
  Strong: "border-green-500/40 text-green-700 dark:text-green-400",
  Good: "border-yellow-500/40 text-yellow-700 dark:text-yellow-400",
  Beta: "border-orange-500/40 text-orange-700 dark:text-orange-400",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** User picked a language and (if needed) the model is loaded. */
  onReady: (language: WhisperLanguage) => void;
  /** Whisper hook lifecycle. */
  status: WhisperStatus;
  progress: WhisperProgress;
  error: string | null;
  isSupported: boolean;
  onLoadModel: () => Promise<void>;
  /** Pre-selected language (sticky from last session). */
  initialLanguage?: WhisperLanguage;
}

export const OfflineWhisperDialog = ({
  open,
  onClose,
  onReady,
  status,
  progress,
  error,
  isSupported,
  onLoadModel,
  initialLanguage = "en",
}: Props) => {
  const [language, setLanguage] = useState<WhisperLanguage>(initialLanguage);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (status === "ready" && downloading) {
      setDownloading(false);
      onReady(language);
      onClose();
    }
  }, [status, downloading, language, onReady, onClose]);

  const handleEnable = async () => {
    if (!isSupported) return;
    if (status === "ready") {
      onReady(language);
      onClose();
      return;
    }
    setDownloading(true);
    try {
      await onLoadModel();
    } catch {
      setDownloading(false);
    }
  };

  const pct = Math.round((progress.progress || 0) * 100);
  const selected = LANGUAGES.find((l) => l.value === language) || LANGUAGES[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" />
            Offline speech recognition
          </DialogTitle>
          <DialogDescription>
            Use an on-device Whisper model for offline, multilingual voice input.
            Works without internet after the first download. No AI credits used.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Language picker */}
          <div className="space-y-2">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5" /> Primary language
            </label>
            <Select value={language} onValueChange={(v) => setLanguage(v as WhisperLanguage)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <div className="flex items-center gap-2">
                      <span>{l.label}</span>
                      <Badge variant="outline" className={`text-[10px] ${ACCURACY_TONE[l.accuracy]}`}>
                        {l.accuracy}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected.note && (
              <p className="text-[11px] text-muted-foreground">{selected.note}</p>
            )}
          </div>

          {/* Honest accuracy box */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-medium">What to expect</p>
            <p className="text-muted-foreground">
              Whisper-small runs entirely on your device. Accuracy is{" "}
              <span className="font-medium">strong for English</span>, good for Yoruba, and{" "}
              <span className="font-medium">beta for Hausa/Igbo</span>. Background noise and
              heavy accents reduce accuracy — speak clearly and review transcripts.
            </p>
          </div>

          {/* Download UI */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Whisper-small (multilingual)</p>
                {status === "idle" && isSupported && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-0.5">
                    <Download className="h-3 w-3" />
                    First-time download ~250 MB, cached for offline use afterwards.
                  </p>
                )}
                {status === "ready" && (
                  <p className="text-[11px] text-green-600 dark:text-green-400">
                    ✓ Model ready — works offline.
                  </p>
                )}
              </div>
            </div>

            {(status === "loading" || downloading) && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{progress.text || "Downloading…"}</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Wifi className="h-3 w-3" /> Use Wi-Fi for the first download.
                </p>
              </div>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {error || "Failed to load Whisper. Falling back to browser speech if available."}
                </AlertDescription>
              </Alert>
            )}

            {!isSupported && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Your browser doesn't support WebAssembly. Offline speech is unavailable —
                  the app will use the browser's built-in speech recognition instead.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="sm:flex-1">
            Use browser speech
          </Button>
          <Button
            onClick={handleEnable}
            disabled={!isSupported || status === "loading" || downloading}
            className="sm:flex-1"
          >
            {status === "loading" || downloading ? (
              <>
                <Download className="h-4 w-4 mr-2 animate-pulse" />
                Loading model…
              </>
            ) : status === "ready" ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Use offline speech
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Enable offline speech
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfflineWhisperDialog;
