import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, Check, Pencil, Send, ArrowLeft, Shield, Activity,
} from "lucide-react";
import {
  NTDProtocol, evaluateDecisionRules, runConsistencyChecks, suggestStage, ReferralAction,
} from "./ntdClinicalRules";

interface BeneficiaryInfo { name: string; age: string; sex: string; community: string; }

interface Props {
  protocol: NTDProtocol;
  answers: Record<string, any>;
  beneficiary: BeneficiaryInfo;
  onEditField: (fieldId: string) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
  conditionImage?: string;
}

const AssessmentSummary = ({ protocol, answers, beneficiary, onEditField, onSave, onBack, isSaving, conditionImage }: Props) => {
  const confidence = protocol.getConfidence(answers);
  const suggestedStage = suggestStage(protocol, answers);
  const stage = protocol.stages.find(s => s.id === suggestedStage);
  const decisionResults = useMemo(() => evaluateDecisionRules(protocol, answers), [protocol, answers]);
  const inconsistencies = useMemo(() => runConsistencyChecks(protocol, answers), [protocol, answers]);
  const referral: ReferralAction = protocol.getReferral(answers, suggestedStage || undefined);
  

  return (
    <div className="space-y-4">
      {/* Visual header with condition image */}
      {conditionImage && (
        <div className="relative rounded-xl overflow-hidden border border-border/50">
          <img src={conditionImage} alt={protocol.name} className="w-full h-32 sm:h-40 object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
            <span className="text-3xl">{protocol.emoji}</span>
            <div>
              <p className="font-bold text-foreground text-lg">{protocol.name}</p>
              {stage && <Badge className={`text-xs ${stage.color}`}>{stage.label}</Badge>}
            </div>
          </div>
        </div>
      )}

      {/* Consistency warnings */}
      {inconsistencies.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-semibold text-sm">Inconsistent Data Detected</p>
            </div>
            {inconsistencies.map(c => (
              <div key={c.id} className="p-2 rounded-lg bg-amber-100/50 dark:bg-amber-900/30 text-xs text-amber-800 dark:text-amber-300">
                {c.errorMessage}
                <Button variant="link" size="sm" className="h-auto p-0 ml-2 text-xs" onClick={() => onEditField(c.fieldIds[0])}>Fix this →</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confidence & Classification */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" /> Assessment Result
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Beneficiary */}
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{beneficiary.name}</span> • Age {beneficiary.age} • {beneficiary.sex} {beneficiary.community && `• ${beneficiary.community}`}
          </div>

          <Separator />

          {/* Condition + Stage (no-image fallback) */}
          {!conditionImage && (
            <div className="flex items-center gap-3">
              <span className="text-3xl">{protocol.emoji}</span>
              <div>
                <p className="font-bold text-foreground">{protocol.name}</p>
                {stage && <p className={`text-sm font-semibold ${stage.color}`}>{stage.label} — {stage.description}</p>}
              </div>
            </div>
          )}

          {/* Visual severity scale */}
          {protocol.stages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity Classification</p>
              <div className="grid grid-cols-1 gap-1.5">
                {protocol.stages.map(s => {
                  const isActive = s.id === suggestedStage;
                  return (
                    <div key={s.id} className={`p-3 rounded-xl border-2 transition-all ${
                      isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/50 opacity-60"
                    }`}>
                      <div className="flex items-center gap-2">
                        {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                        <span className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">{s.visualDescription}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          {/* Confidence bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Assessment Confidence</span>
              <span className={`text-sm font-bold ${confidence >= 70 ? "text-emerald-600" : confidence >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>{confidence}%</span>
            </div>
            <Progress value={confidence} className="h-2.5" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {confidence >= 70 ? "High confidence — sufficient data collected" : confidence >= 40 ? "Moderate — consider additional examination" : "Low — more information needed for reliable assessment"}
            </p>
          </div>

          <Separator />

          {/* Decision rule results */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clinical Decision Support</p>
            {decisionResults.map(r => (
              <div key={r.id} className={`p-3 rounded-xl border text-sm ${
                r.result === "red_flag" ? "bg-destructive/5 border-destructive/30 text-destructive" :
                r.result === "likely" ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" :
                r.result === "unlikely" ? "bg-muted/50 border-border text-muted-foreground" :
                "bg-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400"
              }`}>
                {r.message}
              </div>
            ))}
            {decisionResults.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No strong classification signals. Consider re-examining key findings.</p>
            )}
          </div>

          <Separator />

          {/* Referral action */}
          <div className={`p-4 rounded-xl border-2 ${
            referral.urgency === "emergency" ? "border-destructive bg-destructive/5" :
            referral.urgency === "urgent" ? "border-destructive/50 bg-destructive/5" :
            referral.urgency === "priority" ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20" :
            "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{referral.icon}</span>
              <Badge className={`text-xs ${
                referral.urgency === "emergency" || referral.urgency === "urgent" ? "bg-destructive text-destructive-foreground" :
                referral.urgency === "priority" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
              }`}>
                {referral.urgency.toUpperCase()}
              </Badge>
            </div>
            <p className="font-semibold text-foreground text-sm">{referral.action}</p>
            <p className="text-xs text-muted-foreground mt-1">{referral.reason}</p>
          </div>

          <Separator />

          {/* Answer review */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Answers Summary</p>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {[...protocol.screeningQuestions, ...protocol.assessmentQuestions].filter(q => answers[q.id] !== undefined).map(q => (
                  <div key={q.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/30 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground truncate">{q.text}</p>
                      <p className="font-semibold text-foreground mt-0.5">{Array.isArray(answers[q.id]) ? answers[q.id].join(", ") : String(answers[q.id])}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => onEditField(q.id)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="flex-1 min-h-[52px] gap-2" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" /> Review
        </Button>
        <Button size="lg" className="flex-1 min-h-[52px] gap-2" onClick={onSave} disabled={isSaving || inconsistencies.length > 0}>
          <Send className="h-5 w-5" /> {isSaving ? "Saving..." : "Save Assessment"}
        </Button>
      </div>
    </div>
  );
};

export default AssessmentSummary;
