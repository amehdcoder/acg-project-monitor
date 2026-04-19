/**
 * ConversationalVoiceDialog
 *
 * Shown the first time a user enables TTS on a form whose admin opted into
 * "Conversational Voice (in-app SLM)". Lets the enumerator either:
 *   - Download/use the on-device Phi-3-mini model and speak full sentences, or
 *   - Continue with standard one-question-at-a-time voice mode.
 *
 * Handles WebGPU detection, download progress, and graceful errors.
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
import { Brain, Download, Mic, Sparkles, AlertCircle, Wifi } from "lucide-react";
import type { SLMStatus, SLMProgress } from "@/hooks/useConversationalSLM";

export type VoiceModeChoice = "conversational" | "field_by_field";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Receives the user's choice — engine wires this back into voice mode. */
  onChoose: (choice: VoiceModeChoice) => void;
  /** SLM lifecycle from useConversationalSLM. */
  status: SLMStatus;
  progress: SLMProgress;
  error: string | null;
  isSupported: boolean;
  /** Triggers the model download / load. */
  onLoadModel: () => Promise<void>;
}

export const ConversationalVoiceDialog = ({
  open,
  onClose,
  onChoose,
  status,
  progress,
  error,
  isSupported,
  onLoadModel,
}: Props) => {
  const [downloading, setDownloading] = useState(false);

  // Auto-close once model is ready and the user picked conversational.
  useEffect(() => {
    if (status === "ready" && downloading) {
      setDownloading(false);
      onChoose("conversational");
      onClose();
    }
  }, [status, downloading, onChoose, onClose]);

  const handleConversational = async () => {
    if (!isSupported) return;
    if (status === "ready") {
      onChoose("conversational");
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

  const handleFallback = () => {
    onChoose("field_by_field");
    onClose();
  };

  const pct = Math.round((progress.progress || 0) * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" />
            Speak naturally?
          </DialogTitle>
          <DialogDescription>
            This form supports conversational voice mode. You can describe several
            answers in one sentence — an on-device AI model will fill the matching
            fields automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Conversational option */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">Conversational mode</p>
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                    No credits
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    On-device
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Say e.g. <em>"My name is Aisha, I'm 32, I live in Damaturu and I have
                  three children."</em> — all four fields are filled at once.
                </p>
                {status === "idle" && isSupported && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                    <Download className="h-3 w-3" />
                    First-time download ~2 GB, cached for offline use afterwards.
                  </p>
                )}
              </div>
            </div>

            {/* Download progress */}
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
                  {error || "Failed to load model. Please try again or use standard mode."}
                </AlertDescription>
              </Alert>
            )}

            {!isSupported && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Your browser doesn't support WebGPU, which is required for the on-device
                  AI model. Standard one-question-at-a-time voice mode will still work.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Standard fallback */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <Mic className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-sm">Standard mode</p>
                <p className="text-xs text-muted-foreground">
                  Answer one question at a time. No download required.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleFallback} className="sm:flex-1">
            <Mic className="h-4 w-4 mr-2" />
            Use standard mode
          </Button>
          <Button
            onClick={handleConversational}
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
                Start conversational mode
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Enable conversational mode
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConversationalVoiceDialog;
