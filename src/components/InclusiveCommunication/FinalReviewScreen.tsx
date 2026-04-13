import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { ConfirmedResponse, InclusiveQuestion } from "@/hooks/useInclusiveCommunication";
import { Check, Pencil, Send, ArrowLeft, AlertCircle } from "lucide-react";

interface Props {
  questions: InclusiveQuestion[];
  responses: Record<string, ConfirmedResponse>;
  missingRequired: InclusiveQuestion[];
  onEditQuestion: (questionId: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const FinalReviewScreen = ({ questions, responses, missingRequired, onEditQuestion, onSubmit, onBack, isSubmitting }: Props) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-primary/5 text-center">
        <h2 className="text-xl font-bold text-foreground">Review Your Answers</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Check all answers are correct before submitting
        </p>
        <div className="flex gap-2 justify-center mt-2">
          <Badge variant="secondary">{Object.keys(responses).length} answered</Badge>
          <Badge variant="secondary">{questions.length} total</Badge>
          {missingRequired.length > 0 && (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
              <AlertCircle className="h-3 w-3" />
              {missingRequired.length} required missing
            </Badge>
          )}
        </div>
      </div>

      {/* Answers list */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {questions.map((q, i) => {
            const response = responses[q.id];
            const isMissing = q.required && !response;
            return (
              <Card
                key={q.id}
                className={`p-4 ${isMissing ? "border-destructive/40 bg-destructive/5" : "border-border/50"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    response ? "bg-emerald-500/10 text-emerald-600" : isMissing ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  }`}>
                    {response ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">{q.label}</p>
                    {response ? (
                      <p className="font-semibold text-foreground mt-1">{response.displayValue}</p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground mt-1">
                        {isMissing ? "⚠️ Required — not answered" : "Skipped"}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onEditQuestion(q.id)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Action buttons */}
      <div className="p-4 border-t border-border space-y-2" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <Button
          onClick={onSubmit}
          size="lg"
          className="w-full min-h-[56px] text-lg font-bold gap-2"
          disabled={missingRequired.length > 0 || isSubmitting}
        >
          <Send className="h-5 w-5" />
          {isSubmitting ? "Submitting..." : "Submit Form"}
        </Button>
        <Button onClick={onBack} variant="outline" size="lg" className="w-full min-h-[48px] gap-2">
          <ArrowLeft className="h-5 w-5" />
          Go Back
        </Button>
      </div>
    </div>
  );
};

export default FinalReviewScreen;
