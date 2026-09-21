// Livelihood vulnerability assessment — the questionnaire a livelihood officer
// would sit down and complete with a person affected by an NTD, with the score
// building live as answers are given so nothing is a black box.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ClipboardCheck } from "lucide-react";
import GeoCascadeFields from "./GeoCascadeFields";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import {
  ASSESSMENT_SECTIONS, BAND_LABELS, BAND_TONE, DOMAIN_LABELS,
  saveAssessment, scoreLivelihood,
  type DomainKey, type LivelihoodAssessmentRow, type TargetingInput,
} from "@/lib/programmeModule/livelihood";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  moduleId?: string;
  beneficiary: BeneficiaryRow | null;
  existing?: LivelihoodAssessmentRow | null;
  /** Record-derived signals, so the score is never blank. */
  signals?: Omit<TargetingInput, "beneficiary" | "answers">;
  opportunityId?: string | null;
  onSaved?: () => void;
}

const LivelihoodAssessmentDialog = ({
  open, onOpenChange, projectId, moduleId, beneficiary, existing,
  signals, opportunityId, onSaved,
}: Props) => {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = (existing?.answers as Record<string, unknown>) || {};
    // Start from where the person was registered; the officer can correct it.
    setAnswers({
      res_state: beneficiary?.state || "",
      res_lga: beneficiary?.lga || "",
      res_ward: beneficiary?.ward || "",
      res_community: beneficiary?.village || "",
      ...saved,
    });
  }, [open, existing, beneficiary]);

  const result = useMemo(() => {
    if (!beneficiary) return null;
    return scoreLivelihood({ beneficiary, answers, ...(signals || {}) });
  }, [beneficiary, answers, signals]);

  const set = (name: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [name]: value }));

  const save = async () => {
    if (!beneficiary || !result) return;
    setSaving(true);
    try {
      await saveAssessment({
        id: existing?.id,
        project_id: projectId,
        module_id: moduleId || null,
        beneficiary_id: beneficiary.id,
        opportunity_id: opportunityId || existing?.opportunity_id || null,
        answers,
        result,
      });
      toast({ title: "Assessment saved", description: `${beneficiary.full_name} scored ${result.vulnerability}/100.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Livelihood vulnerability assessment
          </DialogTitle>
        </DialogHeader>

        {beneficiary && (
          <div className="space-y-4">
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="font-semibold">{beneficiary.full_name}</p>
                <p className="text-xs text-muted-foreground">{beneficiary.case_id}</p>
              </div>
              {result && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("border", toneClasses[BAND_TONE[result.band]])}>
                    {BAND_LABELS[result.band]} · {result.vulnerability}/100
                  </Badge>
                  <Badge variant="outline">Readiness {result.readiness}/100</Badge>
                  <Badge variant="outline">{result.completeness}% complete</Badge>
                </div>
              )}
            </Card>

            {result && (
              <Card className="space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What is driving the score
                </p>
                {(Object.keys(DOMAIN_LABELS) as DomainKey[]).map((d) => (
                  <div key={d} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{DOMAIN_LABELS[d]}</span>
                      <span className="tabular-nums text-muted-foreground">{result.domains[d]}/100</span>
                    </div>
                    <Progress value={result.domains[d]} className="h-1.5" />
                  </div>
                ))}
                <Separator className="my-2" />
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {result.reasons.slice(0, 6).map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="rounded-md bg-muted/50 p-2 text-xs">
                  <span className="font-medium">Suggested package: </span>{result.package}
                </p>
                {result.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.flags.map((f) => (
                      <Badge key={f} variant="outline" className="text-[11px]">{f}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card className="space-y-3 p-3">
              <div>
                <p className="font-semibold">Where the person lives now</p>
                <p className="text-xs text-muted-foreground">
                  Used to match people to opportunities running in their area and to judge travel.
                </p>
              </div>
              <GeoCascadeFields
                value={{
                  state: String(answers.res_state ?? ""),
                  lga: String(answers.res_lga ?? ""),
                  ward: String(answers.res_ward ?? ""),
                  community: String(answers.res_community ?? ""),
                }}
                onChange={(p) => setAnswers((prev) => ({
                  ...prev,
                  res_state: p.state ?? "",
                  res_lga: p.lga ?? "",
                  res_ward: p.ward ?? "",
                  res_community: p.community ?? "",
                }))}
              />
            </Card>

            {ASSESSMENT_SECTIONS.map((section) => (
              <Card key={section.key + section.title} className="space-y-3 p-3">
                <div>
                  <p className="font-semibold">{section.title}</p>
                  <p className="text-xs text-muted-foreground">{section.intro}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.fields.map((f) => (
                    <div key={f.name} className="space-y-1">
                      <Label className="text-xs">{f.label}</Label>
                      {f.type === "select" ? (
                        <Select
                          value={String(answers[f.name] ?? "")}
                          onValueChange={(v) => set(f.name, v)}
                        >
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent className="z-[120]">
                            {(f.options || []).map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={f.type === "number" ? "number" : "text"}
                          inputMode={f.type === "number" ? "numeric" : undefined}
                          value={String(answers[f.name] ?? "")}
                          onChange={(e) => set(f.name, e.target.value)}
                        />
                      )}
                      {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !beneficiary}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LivelihoodAssessmentDialog;
