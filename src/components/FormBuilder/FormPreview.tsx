import { useState } from "react";
import { Question, QuestionType, QuestionOption } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Send, MapPin, Camera, Mic, PenTool, Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface FormPreviewProps {
  formName: string;
  formDescription: string;
  questions: Question[];
  onClose: () => void;
}

const FormPreview = ({ formName, formDescription, questions, onClose }: FormPreviewProps) => {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(0);

  const updateResponse = (questionId: string, value: any) => {
    setResponses((prev) => {
      const next = { ...prev, [questionId]: value };
      // When a parent question's answer changes, clear stale child responses.
      // Find any questions that declare this question as their cascadeParentId.
      questions.forEach(q => {
        if (q.cascadeParentId === questionId) {
          delete next[q.id];
        }
      });
      return next;
    });
  };

  const shouldShowQuestion = (question: Question): boolean => {
    if (!question.relevant) return true;
    
    // Parse simple skip logic like "${q1} = 'yes'"
    const match = question.relevant.match(/\$\{(.+?)\}\s*=\s*['"](.+?)['"]/);
    if (match) {
      const [, refQuestionId, expectedValue] = match;
      const refQuestion = questions.find((q) => q.id === refQuestionId || q.label === refQuestionId);
      if (refQuestion) {
        return responses[refQuestion.id] === expectedValue;
      }
    }
    return true;
  };

  /**
   * Cascade / dependent-select filtering.
   * Returns only the options that should be visible given the current parent answer.
   * Priority: structured cascadeParentId > raw choiceFilter (legacy).
   */
  const getVisibleOptions = (question: Question): QuestionOption[] => {
    const opts = question.options ?? [];

    // ── Structured cascade (primary) ──────────────────────────────────────────
    if (question.cascadeParentId) {
      const parentResponse = responses[question.cascadeParentId];
      if (!parentResponse) {
        // Parent not yet answered — show no child options (prevent confusion)
        return [];
      }
      return opts.filter(opt => !opt.parentValue || opt.parentValue === parentResponse);
    }

    // ── Raw choiceFilter expression (legacy / XLSForm imports) ────────────────
    if (question.choiceFilter) {
      // Resolve ${name} references against question id/name
      const resolved = question.choiceFilter.replace(/\$\{(.+?)\}/g, (_, name) => {
        const ref = questions.find(q => q.name === name || q.id === name);
        return ref ? String(responses[ref.id] ?? "") : "";
      });
      const eqMatch = resolved.match(/^(\w+)\s*=\s*['"]?(.+?)['"]?\s*$/);
      if (eqMatch) {
        const [, filterKey, filterValue] = eqMatch;
        return opts.filter(opt =>
          filterKey === "value" || filterKey === "name"
            ? opt.value === filterValue
            : opt.value === filterValue || opt.label === filterValue
        );
      }
    }

    return opts;
  };

  const visibleQuestions = questions.filter(shouldShowQuestion);

  const renderQuestionInput = (question: Question) => {
    const value = responses[question.id];
    const opts = getVisibleOptions(question);

    // Check if this question is a cascade child waiting for its parent
    const waitingForParent =
      question.cascadeParentId &&
      !responses[question.cascadeParentId];

    switch (question.type) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter your answer"
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter a number"
            min={question.validation?.min}
            max={question.validation?.max}
          />
        );

      case "note":
        return (
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            {question.hint || "This is an informational note."}
          </div>
        );

      case "select_one":
        if (waitingForParent) {
          const parentQ = questions.find(q => q.id === question.cascadeParentId);
          return (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-primary/60" />
              <span>Please answer <span className="font-medium text-foreground">{parentQ?.label ?? "the parent question"}</span> first.</span>
            </div>
          );
        }
        return (
          <RadioGroup
            value={value || ""}
            onValueChange={(val) => updateResponse(question.id, val)}
          >
            {opts.length === 0 && question.cascadeParentId ? (
              <p className="text-sm text-muted-foreground italic">No options match the current selection.</p>
            ) : (
              opts.map((option) => (
                <div key={option.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={`${question.id}-${option.id}`} />
                  <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
                  {option.parentValue && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-50">{option.parentValue}</Badge>
                  )}
                </div>
              ))
            )}
          </RadioGroup>
        );

      case "select_multiple":
        if (waitingForParent) {
          const parentQ = questions.find(q => q.id === question.cascadeParentId);
          return (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-primary/60" />
              <span>Please answer <span className="font-medium text-foreground">{parentQ?.label ?? "the parent question"}</span> first.</span>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            {opts.length === 0 && question.cascadeParentId ? (
              <p className="text-sm text-muted-foreground italic">No options match the current selection.</p>
            ) : (
              opts.map((option) => (
                <div key={option.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${question.id}-${option.id}`}
                    checked={(value || []).includes(option.value)}
                    onCheckedChange={(checked) => {
                      const current = value || [];
                      if (checked) {
                        updateResponse(question.id, [...current, option.value]);
                      } else {
                        updateResponse(question.id, current.filter((v: string) => v !== option.value));
                      }
                    }}
                  />
                  <Label htmlFor={`${question.id}-${option.id}`}>{option.label}</Label>
                </div>
              ))
            )}
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
          />
        );

      case "time":
        return (
          <Input
            type="time"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
          />
        );

      case "datetime":
        return (
          <Input
            type="datetime-local"
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
          />
        );

      case "range":
        return (
          <div className="space-y-2">
            <Slider
              value={[value || question.validation?.min || 0]}
              onValueChange={([val]) => updateResponse(question.id, val)}
              min={question.validation?.min || 0}
              max={question.validation?.max || 100}
              step={1}
            />
            <p className="text-center text-sm text-muted-foreground">
              Value: {value || question.validation?.min || 0}
            </p>
          </div>
        );

      case "geopoint":
        return (
          <Button variant="outline" className="w-full">
            <MapPin className="mr-2 h-4 w-4" />
            Capture GPS Location
          </Button>
        );

      case "image":
        return (
          <Button variant="outline" className="w-full">
            <Camera className="mr-2 h-4 w-4" />
            Take Photo
          </Button>
        );

      case "audio":
        return (
          <Button variant="outline" className="w-full">
            <Mic className="mr-2 h-4 w-4" />
            Record Audio
          </Button>
        );

      case "signature":
        return (
          <div className="h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <PenTool className="mx-auto h-6 w-6 mb-2" />
              <p className="text-sm">Tap to sign</p>
            </div>
          </div>
        );

      case "acknowledge":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={question.id}
              checked={value || false}
              onCheckedChange={(checked) => updateResponse(question.id, checked)}
            />
            <Label htmlFor={question.id}>I acknowledge</Label>
          </div>
        );

      default:
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Enter your response"
          />
        );
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Form Preview
            </h1>
            <p className="text-sm text-muted-foreground">
              Test how your form will appear to users
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <Link2 className="h-3 w-3" />
          Cascade-aware
        </Badge>
      </div>

      {/* Preview Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-6">
          <Card className="border-0 shadow-card mb-6">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
              <CardTitle className="font-display text-2xl">
                {formName || "Untitled Form"}
              </CardTitle>
              {formDescription && (
                <CardDescription className="text-base">
                  {formDescription}
                </CardDescription>
              )}
            </CardHeader>
          </Card>

          {visibleQuestions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No questions added yet. Add questions to preview the form.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {visibleQuestions.map((question, index) => (
                <Card key={question.id} className={`border-0 shadow-soft transition-all ${question.cascadeParentId && !responses[question.cascadeParentId] ? "opacity-50" : ""}`}>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Label className="text-base font-medium">
                              {question.label}
                              {question.required && (
                                <span className="ml-1 text-destructive">*</span>
                              )}
                            </Label>
                            {question.cascadeParentId && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 h-4">
                                <Link2 className="h-2.5 w-2.5" />
                                Dependent
                              </Badge>
                            )}
                          </div>
                          {question.hint && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {question.hint}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-8">
                        {renderQuestionInput(question)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="pt-4">
                <Button variant="acg" className="w-full" size="lg">
                  <Send className="mr-2 h-4 w-4" />
                  Submit Form
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FormPreview;
