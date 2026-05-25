import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  STANDARD_ASSESSMENTS,
  StandardFormCode,
  SAQuestion,
  scoreAssessment,
} from "@/lib/standardAssessments/definitions";

interface Props {
  code: StandardFormCode;
  projectId?: string | null;
  sessionId?: string | null;
  activityDescription?: string | null;
  showSessionControls?: boolean;
  respondentCount?: number;
  onAddAnother?: () => void;
  onClose: () => void;
  onSubmitted?: () => void;
}

const StandardAssessmentFiller = ({
  code,
  projectId,
  sessionId,
  activityDescription,
  showSessionControls,
  respondentCount = 0,
  onAddAnother,
  onClose,
  onSubmitted,
}: Props) => {
  const def = STANDARD_ASSESSMENTS[code];
  const { user } = useAuth();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<null | ReturnType<typeof scoreAssessment>>(null);

  // Group questions by section for a cleaner UI
  const sections = useMemo(() => {
    const all: SAQuestion[] = [
      ...def.identification,
      ...def.demographics,
      ...def.psychographics,
      ...def.items,
      ...(def.closing ?? []),
    ];
    const map = new Map<string, SAQuestion[]>();
    all.forEach((q) => {
      const s = q.section ?? "Questions";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(q);
    });
    return Array.from(map.entries());
  }, [def]);

  const set = (id: string, v: any) =>
    setResponses((p) => ({ ...p, [id]: v }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    [...def.identification, ...def.demographics, ...def.items, ...(def.closing ?? [])].forEach((q) => {
      if (q.required && (responses[q.id] === undefined || responses[q.id] === "")) {
        errs[q.id] = "Required";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!validate()) {
      toast({ title: "Please complete required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = scoreAssessment(code, responses);
      const demographics: Record<string, any> = {};
      [...def.demographics, ...def.psychographics].forEach((q) => {
        demographics[q.id] = responses[q.id];
      });
      const { error } = await supabase.from("standard_assessment_submissions").insert({
        user_id: user.id,
        form_code: code,
        project_id: projectId ?? null,
        data: responses,
        demographics,
        score: result.score,
        severity: result.severity,
        disability_flags: result.disabilityFlags ?? null,
        session_id: sessionId ?? null,
        activity_description: activityDescription ?? null,
      } as any);
      if (error) throw error;
      setSubmitted(result);
      toast({ title: "Assessment saved", description: result.severity });
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4 p-3 sm:p-4 max-w-3xl mx-auto">
        <Button variant="ghost" onClick={onClose} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {def.shortName} — Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold">{submitted.score}</div>
            <div className="text-lg font-medium">{submitted.severity}</div>
            <p className="text-sm text-muted-foreground">{submitted.interpretation}</p>
            {submitted.disabilityFlags && (
              <div className="text-sm border rounded p-3 bg-muted/40">
                <div className="font-medium mb-2">Affected domains</div>
                <ul className="list-disc pl-5 space-y-1">
                  {Object.entries({
                    Vision: submitted.disabilityFlags.vision,
                    Hearing: submitted.disabilityFlags.hearing,
                    Mobility: submitted.disabilityFlags.mobility,
                    Cognition: submitted.disabilityFlags.cognition,
                    "Self-care": submitted.disabilityFlags.selfCare,
                    Communication: submitted.disabilityFlags.communication,
                  })
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <li key={k}>{k}</li>
                    ))}
                  {!submitted.disabilityFlags.hasDisability && <li>None meet WG disability threshold</li>}
                </ul>
              </div>
            )}
            {showSessionControls ? (
              <>
                <div className="rounded-md border bg-primary/5 p-3 text-sm">
                  <strong>{respondentCount + 1}</strong> respondent{respondentCount + 1 === 1 ? "" : "s"} saved to this activity session.
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button
                    onClick={() => {
                      setSubmitted(null);
                      setResponses({});
                      setErrors({});
                      onAddAnother?.();
                    }}
                    className="flex-1"
                  >
                    + Add another respondent
                  </Button>
                  <Button onClick={onClose} variant="outline" className="flex-1">
                    Finish session
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button onClick={onClose} variant="outline">Done</Button>
                <Button onClick={() => { setSubmitted(null); setResponses({}); }}>New entry</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-3xl mx-auto">
      <Button variant="ghost" onClick={onClose} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to forms
      </Button>
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold">{def.name}</h1>
        <p className="text-sm text-muted-foreground">{def.description}</p>
      </div>

      {sections.map(([section, qs]) => (
        <Card key={section}>
          <CardHeader><CardTitle className="text-base">{section}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {qs.map((q) => (
              <div key={q.id} className="space-y-2">
                <Label className="flex gap-1">
                  <span>{q.label}</span>
                  {q.required && <span className="text-destructive">*</span>}
                </Label>
                {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
                {q.type === "text" && (
                  <Input value={responses[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                )}
                {q.type === "number" && (
                  <Input type="number" value={responses[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                )}
                {q.type === "date" && (
                  <Input type="date" value={responses[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                )}
                {q.type === "select_one" && (
                  <RadioGroup
                    value={responses[q.id] ?? ""}
                    onValueChange={(v) => set(q.id, v)}
                    className="space-y-1"
                  >
                    {q.options?.map((o) => (
                      <div key={o.value} className="flex items-center gap-2 rounded border p-2 hover:bg-muted/40">
                        <RadioGroupItem value={o.value} id={`${q.id}_${o.value}`} />
                        <Label htmlFor={`${q.id}_${o.value}`} className="cursor-pointer flex-1 font-normal">
                          {o.label}
                          {typeof o.score === "number" && (
                            <span className="ml-2 text-xs text-muted-foreground">({o.score})</span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
                {errors[q.id] && <p className="text-xs text-destructive">{errors[q.id]}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2 sticky bottom-3 bg-background/95 backdrop-blur p-2 rounded-lg border shadow">
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting} className="flex-1 gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Submit & Score
        </Button>
      </div>
    </div>
  );
};

export default StandardAssessmentFiller;
