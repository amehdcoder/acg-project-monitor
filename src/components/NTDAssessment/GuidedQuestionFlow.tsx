import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, HelpCircle, Info, Shield, Image as ImageIcon, Eye,
} from "lucide-react";
import {
  ScreeningQuestion, NTDProtocol, getVisibleQuestions, checkRedFlags,
} from "./ntdClinicalRules";

interface Props {
  protocol: NTDProtocol;
  allQuestions: ScreeningQuestion[];
  answers: Record<string, any>;
  onAnswer: (questionId: string, value: any) => void;
  onComplete: () => void;
  onBack: () => void;
  phaseLabel: string;
  conditionImage?: string;
}

const GuidedQuestionFlow = ({ protocol, allQuestions, answers, onAnswer, onComplete, onBack, phaseLabel, conditionImage }: Props) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showVisualAid, setShowVisualAid] = useState(true);

  const visibleQuestions = useMemo(() => getVisibleQuestions(allQuestions, answers), [allQuestions, answers]);
  const currentQ = visibleQuestions[currentIdx];
  const progress = visibleQuestions.length > 0 ? ((currentIdx + 1) / visibleQuestions.length) * 100 : 0;
  const redFlags = useMemo(() => checkRedFlags(allQuestions, answers), [allQuestions, answers]);
  const currentRedFlag = redFlags.find(f => f.questionId === currentQ?.id);
  const isAnswered = currentQ && answers[currentQ.id] !== undefined && answers[currentQ.id] !== null && answers[currentQ.id] !== "";
  const isLastQuestion = currentIdx >= visibleQuestions.length - 1;

  const goNext = useCallback(() => {
    if (isLastQuestion) { onComplete(); return; }
    setCurrentIdx(prev => Math.min(prev + 1, visibleQuestions.length - 1));
    setShowHelp(false);
  }, [isLastQuestion, onComplete, visibleQuestions.length]);

  const goPrev = useCallback(() => {
    if (currentIdx === 0) { onBack(); return; }
    setCurrentIdx(prev => Math.max(0, prev - 1));
    setShowHelp(false);
  }, [currentIdx, onBack]);

  if (!currentQ) return null;

  const renderInput = () => {
    const val = answers[currentQ.id];

    if (currentQ.type === "yes_no") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => onAnswer(currentQ.id, "yes")}
            className={`min-h-[80px] text-lg font-bold flex-col gap-2 ${val === "yes" ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/30" : ""}`}>
            <span className="text-3xl">👍</span> Yes
          </Button>
          <Button variant="outline" onClick={() => onAnswer(currentQ.id, "no")}
            className={`min-h-[80px] text-lg font-bold flex-col gap-2 ${val === "no" ? "bg-red-500/10 border-red-500/50 text-red-700 dark:text-red-400 ring-2 ring-red-500/30" : ""}`}>
            <span className="text-3xl">👎</span> No
          </Button>
        </div>
      );
    }

    if (currentQ.type === "single" && currentQ.options) {
      return (
        <RadioGroup value={val || ""} onValueChange={v => onAnswer(currentQ.id, v)} className="space-y-2">
          {currentQ.options.map(opt => (
            <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${val === opt.value ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30"}`}>
              <RadioGroupItem value={opt.value} />
              {opt.icon && <span className="text-2xl">{opt.icon}</span>}
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
      );
    }

    if (currentQ.type === "multi" && currentQ.options) {
      const selected: string[] = val || [];
      return (
        <div className="space-y-2">
          {currentQ.options.map(opt => {
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${checked ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30"}`}>
                <Checkbox checked={checked} onCheckedChange={() => {
                  const next = checked ? selected.filter(v => v !== opt.value) : [...selected, opt.value];
                  onAnswer(currentQ.id, next);
                }} />
                {opt.icon && <span className="text-2xl">{opt.icon}</span>}
                <span className="text-sm font-medium">{opt.label}</span>
                {checked && <Check className="h-4 w-4 text-primary ml-auto" />}
              </label>
            );
          })}
        </div>
      );
    }

    if (currentQ.type === "number") {
      return <Input type="number" value={val || ""} onChange={e => onAnswer(currentQ.id, e.target.value)} placeholder="Enter number" className="text-lg h-14 text-center" />;
    }

    if (currentQ.type === "body_location") {
      const locations = ["Head/Face", "Neck", "Left Arm", "Right Arm", "Chest", "Back", "Abdomen", "Left Leg", "Right Leg", "Left Foot", "Right Foot", "Left Hand", "Right Hand"];
      const bodyEmojis: Record<string, string> = {
        "Head/Face": "🧠", "Neck": "🫁", "Left Arm": "💪", "Right Arm": "💪",
        "Chest": "🫁", "Back": "🔙", "Abdomen": "🤰", "Left Leg": "🦵", "Right Leg": "🦵",
        "Left Foot": "🦶", "Right Foot": "🦶", "Left Hand": "✋", "Right Hand": "✋",
      };
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {locations.map(loc => (
            <Button key={loc} variant="outline"
              className={`h-16 flex-col gap-1 text-xs ${val === loc ? "bg-primary/10 border-primary/50 text-primary ring-1 ring-primary/20" : ""}`}
              onClick={() => onAnswer(currentQ.id, loc)}>
              <span className="text-xl">{bodyEmojis[loc] || "📍"}</span>
              {loc}
            </Button>
          ))}
        </div>
      );
    }

    return <Input value={val || ""} onChange={e => onAnswer(currentQ.id, e.target.value)} placeholder="Enter response" className="text-lg h-14" />;
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-xs shrink-0">{protocol.emoji} {phaseLabel}</Badge>
        <Progress value={progress} className="h-2.5 flex-1" />
        <span className="text-xs text-muted-foreground shrink-0">{currentIdx + 1}/{visibleQuestions.length}</span>
      </div>

      {/* Visual clinical reference — always visible */}
      {conditionImage && showVisualAid && (
        <div className="relative rounded-xl overflow-hidden border border-border/50">
          <img src={conditionImage} alt={`${protocol.name} clinical reference`} className="w-full h-32 sm:h-40 object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <Badge className="bg-background/80 text-foreground text-xs gap-1 backdrop-blur-sm">
              <Eye className="h-3 w-3" /> {protocol.name} — Visual Reference
            </Badge>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] bg-background/60 backdrop-blur-sm hover:bg-background/80"
              onClick={() => setShowVisualAid(false)}>Hide</Button>
          </div>
        </div>
      )}

      {!showVisualAid && conditionImage && (
        <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={() => setShowVisualAid(true)}>
          <ImageIcon className="h-3.5 w-3.5" /> Show visual reference
        </Button>
      )}

      {/* Red flag alert */}
      {currentRedFlag && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-destructive">{currentRedFlag.message}</p>
        </div>
      )}

      {/* Question card */}
      <Card className="border-2">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-semibold text-foreground leading-snug">{currentQ.text}</p>
            {currentQ.helpText && (
              <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0 rounded-full" onClick={() => setShowHelp(!showHelp)} title="Why this question?">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>

          {showHelp && currentQ.helpText && (
            <div className="p-3 rounded-lg bg-accent/50 border border-accent flex items-start gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">{currentQ.helpText}</p>
            </div>
          )}

          {currentQ.required && (
            <Badge variant="outline" className="text-[10px] gap-1"><Shield className="h-3 w-3" /> Required</Badge>
          )}

          {renderInput()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="lg" className="min-h-[52px] gap-2 flex-1" onClick={goPrev}>
          <ChevronLeft className="h-5 w-5" /> Back
        </Button>
        <Button size="lg" className="min-h-[52px] gap-2 flex-1" onClick={goNext} disabled={currentQ.required && !isAnswered}>
          {isLastQuestion ? "Continue" : "Next"} <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default GuidedQuestionFlow;
