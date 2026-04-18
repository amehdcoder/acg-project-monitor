import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Mic, MicOff, SkipForward, SkipBack, Volume2, VolumeX,
  HelpCircle, ListChecks, Send, X, Zap, Shield, Keyboard,
  ChevronLeft, ChevronRight, Eye
} from "lucide-react";
import { VoiceFormState, VoiceQuestion } from "@/hooks/useVoiceFormEngine";
import { ConfidenceResult, ConfirmationPolicy } from "@/hooks/useVoiceConfidence";

interface VoiceFormOverlayProps {
  isActive: boolean;
  state: VoiceFormState;
  currentIndex: number;
  totalQuestions: number;
  currentQuestion: VoiceQuestion | null;
  lastConfidence: ConfidenceResult | null;
  lastPolicy: ConfirmationPolicy | null;
  isSpellingMode: boolean;
  spellingBuffer: string;
  mode: "fast" | "careful";
  currentAnswer: any;
  /** Live interim transcript (gray). */
  interimTranscript?: string;
  /** Latest finalised transcript (black). */
  finalTranscript?: string;
  onStart: () => void;
  onStop: () => void;
  onSetMode: (mode: "fast" | "careful") => void;
}

const STATE_LABELS: Record<VoiceFormState, { label: string; color: string; icon: string }> = {
  idle: { label: "Ready", color: "bg-muted text-muted-foreground", icon: "⏸" },
  reading_question: { label: "Reading Question", color: "bg-primary/20 text-primary", icon: "🔊" },
  listening: { label: "Listening...", color: "bg-green-500/20 text-green-700 dark:text-green-400", icon: "🎙" },
  processing: { label: "Processing", color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400", icon: "⏳" },
  confirming: { label: "Confirming", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400", icon: "✓" },
  correcting: { label: "Correcting", color: "bg-orange-500/20 text-orange-700 dark:text-orange-400", icon: "✏️" },
  reviewing: { label: "Reviewing", color: "bg-purple-500/20 text-purple-700 dark:text-purple-400", icon: "📋" },
  submitting: { label: "Submitting", color: "bg-primary/20 text-primary", icon: "📤" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  very_high: "text-green-600 dark:text-green-400",
  high: "text-green-500 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-orange-500 dark:text-orange-400",
  very_low: "text-red-500 dark:text-red-400",
};

export const VoiceFormOverlay = ({
  isActive,
  state,
  currentIndex,
  totalQuestions,
  currentQuestion,
  lastConfidence,
  lastPolicy,
  isSpellingMode,
  spellingBuffer,
  mode,
  currentAnswer,
  interimTranscript,
  finalTranscript,
  onStart,
  onStop,
  onSetMode,
}: VoiceFormOverlayProps) => {
  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const stateInfo = STATE_LABELS[state];

  // Not active — show start button
  if (!isActive) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Voice Form Mode</p>
                <p className="text-xs text-muted-foreground">Complete forms using only your voice</p>
              </div>
            </div>
            <Button
              onClick={onStart}
              size="sm"
              className="gap-2"
              aria-label="Start Voice Form Mode"
            >
              <Mic className="h-4 w-4" /> Start Voice Mode
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-primary/40 bg-gradient-to-b from-primary/5 to-background shadow-lg"
      role="status"
      aria-live="polite"
      aria-label="Voice Form Mode active"
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: State + Mode + Stop */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={`${stateInfo.color} text-xs font-medium`}>
              {stateInfo.icon} {stateInfo.label}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs cursor-pointer"
              onClick={() => onSetMode(mode === "fast" ? "careful" : "fast")}
              aria-label={`Current mode: ${mode}. Click to switch.`}
            >
              {mode === "fast" ? (
                <><Zap className="h-3 w-3 mr-1" /> Fast</>
              ) : (
                <><Shield className="h-3 w-3 mr-1" /> Careful</>
              )}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            className="h-8 w-8"
            aria-label="Stop Voice Form Mode"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Question {currentIndex + 1} of {totalQuestions}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current Question */}
        {currentQuestion && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {currentIndex + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium leading-snug"
                  dangerouslySetInnerHTML={{ __html: currentQuestion.label }}
                />
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{currentQuestion.type}</Badge>
                  {currentQuestion.required && (
                    <Badge variant="destructive" className="text-[10px]">Required</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Current answer */}
            {currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== "" && (
              <div className="flex items-center gap-2 text-xs">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Answer:</span>
                <span className="font-medium truncate">
                  {Array.isArray(currentAnswer) ? currentAnswer.join(", ") : String(currentAnswer)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Spelling Mode */}
        {isSpellingMode && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Keyboard className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">Spelling Mode</span>
            </div>
            <p className="text-sm font-mono tracking-wider">
              {spellingBuffer || "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Say letters, NATO phonetic, or "done" to finish. "Backspace" to delete.
            </p>
          </div>
        )}

        {/* Confidence Indicator */}
        {lastConfidence && state === "confirming" && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Confidence:</span>
            <span className={`font-medium ${CONFIDENCE_COLORS[lastConfidence.level] || ""}`}>
              {lastConfidence.level.replace("_", " ")} ({Math.round(lastConfidence.score * 100)}%)
            </span>
            {lastPolicy && (
              <Badge variant="outline" className="text-[10px]">
                {lastPolicy.action.replace("_", " ")}
              </Badge>
            )}
          </div>
        )}

        {/* Listening indicator + Live transcript (gray = interim, black = final) */}
        {state === "listening" && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 16}px`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </div>
            {(interimTranscript || finalTranscript) && (
              <div
                className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-snug min-h-[2.25rem]"
                aria-live="polite"
              >
                {finalTranscript && (
                  <span className="text-foreground font-medium">{finalTranscript}</span>
                )}
                {finalTranscript && interimTranscript && <span> </span>}
                {interimTranscript && (
                  <span className="text-muted-foreground italic">{interimTranscript}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick commands hint */}
        <div className="flex flex-wrap gap-1">
          {["Next", "Previous", "Repeat", "Skip", "Help", "Review", "Submit"].map(cmd => (
            <span
              key={cmd}
              className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
            >
              "{cmd}"
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
