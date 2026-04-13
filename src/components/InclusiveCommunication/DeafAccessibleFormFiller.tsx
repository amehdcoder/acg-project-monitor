import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Question, FormGroup } from "@/components/FormBuilder/types";
import { useInclusiveCommunication, InclusiveQuestion } from "@/hooks/useInclusiveCommunication";
import QuestionDeliveryPanel from "./QuestionDeliveryPanel";
import ResponseCapturePanel from "./ResponseCapturePanel";
import ConfirmationOverlay from "./ConfirmationOverlay";
import CommunicationShortcuts from "./CommunicationShortcuts";
import FinalReviewScreen from "./FinalReviewScreen";
import {
  ArrowLeft, ArrowRight, ChevronLeft, X, HandMetal, Eye,
} from "lucide-react";

interface Props {
  formName: string;
  questions: Question[];
  groups?: FormGroup[];
  responses: Record<string, any>;
  onSetResponse: (questionId: string, value: any) => void;
  onSubmit: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

const DeafAccessibleFormFiller = ({
  formName, questions, groups = [], responses: externalResponses,
  onSetResponse, onSubmit, onClose, isSubmitting,
}: Props) => {
  const [showWaitOverlay, setShowWaitOverlay] = useState(false);

  // Build inclusive questions from form questions
  const inclusiveQuestions = useMemo<InclusiveQuestion[]>(() => {
    const result: InclusiveQuestion[] = [];
    const seen = new Set<string>();

    // Group questions first
    groups.forEach(g => {
      g.questions.forEach(q => {
        if (seen.has(q.id) || q.type === "calculate" || q.type === "note") return;
        seen.add(q.id);
        result.push({
          id: q.id,
          label: q.label,
          type: q.type,
          required: q.required,
          options: q.options?.filter(o => o.label && o.value).map(o => ({ label: o.label, value: o.value })),
          hint: q.hint,
          groupId: g.id,
        });
      });
    });

    // Ungrouped questions
    questions.forEach(q => {
      if (seen.has(q.id) || q.type === "calculate" || q.type === "note") return;
      seen.add(q.id);
      result.push({
        id: q.id,
        label: q.label,
        type: q.type,
        required: q.required,
        options: q.options?.filter(o => o.label && o.value).map(o => ({ label: o.label, value: o.value })),
        hint: q.hint,
      });
    });

    return result;
  }, [questions, groups]);

  const engine = useInclusiveCommunication(inclusiveQuestions);

  // Sync confirmed responses back to parent form
  const handleConfirm = useCallback(() => {
    engine.confirmResponse();
    if (engine.currentQuestion) {
      onSetResponse(engine.currentQuestion.id, engine.pendingValue);
    }
  }, [engine, onSetResponse]);

  const handleSubmitForm = useCallback(() => {
    // Sync all responses to parent
    const flat = engine.getFlatResponses();
    Object.entries(flat).forEach(([qId, val]) => onSetResponse(qId, val));
    onSubmit();
  }, [engine, onSetResponse, onSubmit]);

  // Communication shortcuts handlers
  const handleRepeat = useCallback(() => {
    engine.setPhase("delivering");
    toast({ title: "🔄 Replaying question" });
  }, [engine]);

  const handleDontUnderstand = useCallback(() => {
    engine.toggleSimplify();
    engine.setPhase("delivering");
    toast({ title: "💡 Showing simpler version" });
  }, [engine]);

  const handleChooseOne = useCallback(() => {
    toast({ title: "☝️ Choose ONE answer", description: "Tap one option only" });
  }, []);

  const handleChooseMany = useCallback(() => {
    toast({ title: "✋ Choose ALL that apply", description: "Tap multiple options" });
  }, []);

  const handleWait = useCallback(() => {
    setShowWaitOverlay(true);
    setTimeout(() => setShowWaitOverlay(false), 5000);
  }, []);

  const handleFinished = useCallback(() => {
    engine.goToReview();
  }, [engine]);

  // Skip (for non-required questions)
  const handleSkip = useCallback(() => {
    engine.nextQuestion();
  }, [engine]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Wait overlay */}
      {showWaitOverlay && (
        <div className="absolute inset-0 z-[60] bg-background/95 flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <div className="text-6xl">⏸️</div>
            <p className="text-3xl font-bold text-foreground">Please Wait</p>
            <p className="text-lg text-muted-foreground">Take your time</p>
            <Button onClick={() => setShowWaitOverlay(false)} size="lg" className="mt-4 min-h-[56px] px-10 text-lg">
              Ready to Continue
            </Button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="shrink-0 border-b border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
            <X className="h-4 w-4" /> Exit
          </Button>
          <div className="flex items-center gap-2">
            <HandMetal className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm text-foreground truncate max-w-[200px]">
              {formName}
            </span>
          </div>
          <Badge variant="outline" className="gap-1 text-xs">
            <Eye className="h-3 w-3" />
            Inclusive Mode
          </Badge>
        </div>

        {/* Progress bar (visible to both collector and respondent) */}
        <div className="mt-2">
          <Progress value={engine.progress} className="h-3" />
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            {Math.round(engine.progress)}% complete
          </p>
        </div>
      </div>

      {/* Communication shortcuts bar */}
      <div className="shrink-0 border-b border-border/50 bg-muted/30 py-1.5">
        <CommunicationShortcuts
          onRepeat={handleRepeat}
          onDontUnderstand={handleDontUnderstand}
          onChooseOne={handleChooseOne}
          onChooseMany={handleChooseMany}
          onWait={handleWait}
          onFinished={handleFinished}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Review screen */}
        {engine.phase === "reviewing" ? (
          <FinalReviewScreen
            questions={inclusiveQuestions}
            responses={engine.responses}
            missingRequired={engine.missingRequired}
            onEditQuestion={engine.editResponse}
            onSubmit={handleSubmitForm}
            onBack={engine.exitReview}
            isSubmitting={isSubmitting}
          />
        ) : engine.currentQuestion ? (
          <div className="max-w-lg mx-auto">
            {/* Delivering phase */}
            {engine.phase === "delivering" && (
              <QuestionDeliveryPanel
                question={engine.currentQuestion}
                chunks={engine.chunks}
                mode={engine.mode}
                isSimplified={engine.isSimplified}
                questionNumber={engine.currentIndex + 1}
                totalQuestions={engine.totalQuestions}
                onReady={engine.startCapturing}
                onSimplify={engine.toggleSimplify}
                onModeChange={engine.setMode}
              />
            )}

            {/* Capturing phase */}
            {engine.phase === "capturing" && (
              <ResponseCapturePanel
                question={engine.currentQuestion}
                mode={engine.mode}
                onSubmitResponse={engine.submitResponse}
                onSkip={handleSkip}
              />
            )}

            {/* Confirming phase */}
            {engine.phase === "confirming" && (
              <ConfirmationOverlay
                questionLabel={engine.currentQuestion.label}
                displayValue={engine.pendingDisplay}
                onConfirm={handleConfirm}
                onReject={engine.rejectResponse}
                onEdit={() => {
                  engine.rejectResponse();
                }}
              />
            )}

            {/* Correcting phase */}
            {engine.phase === "correcting" && (
              <ResponseCapturePanel
                question={engine.currentQuestion}
                mode={engine.mode}
                onSubmitResponse={engine.submitResponse}
                onSkip={handleSkip}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No questions available</p>
          </div>
        )}
      </div>

      {/* Bottom navigation bar */}
      {engine.phase !== "reviewing" && (
        <div className="shrink-0 border-t border-border bg-card p-3 flex items-center justify-between gap-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] gap-2"
            onClick={engine.prevQuestion}
            disabled={engine.currentIndex === 0}
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {engine.currentIndex + 1} / {engine.totalQuestions}
            </p>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] gap-2"
            onClick={() => {
              if (engine.phase === "delivering") {
                engine.startCapturing();
              } else {
                engine.nextQuestion();
              }
            }}
            disabled={engine.currentIndex >= engine.totalQuestions - 1 && engine.phase !== "delivering"}
          >
            Next
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default DeafAccessibleFormFiller;
