// Clinician confirmation of a potential MMDP case found by a CDD.
//
// The clinician re-uses the lesion staging tool on the picture the CDD
// submitted: the phone measures the swelling, the clinician ticks the signs
// seen and records measurements, and the tool suggests a stage. Everything the
// tool produces is decision support — the clinician's confirmation is what is
// stored, and only a confirmed case can become a registered beneficiary.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ScanEye, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { resolveMediaUrl } from "@/lib/programmeModule/media";
import {
  CLINICAL_CRITERIA, MEASUREMENT_FIELDS, SCALE_REFERENCES, STAGE_LABELS,
  analyseLesion, stageFromEvidence, stageLabelFor,
  type LesionCondition, type LesionMetrics,
} from "@/lib/programmeModule/lesionVision";
import { buildFeatures, predictStage, useLesionStageModel } from "@/lib/programmeModule/lesionModel";
import {
  MMDP_CONDITIONS, confirmPotentialCase, type PotentialCaseRow,
} from "@/lib/programmeModule/cddCaseSearch";
import {
  CERTAINTY_OPTIONS, COMORBIDITIES, DIAGNOSIS_OPTIONS, NEXT_STEPS, ONSET_OPTIONS,
  PROGRESSION_OPTIONS, SEVERITY_OPTIONS, symptomsFor, TREATMENTS_GIVEN,
  clinicalSummary, emptyDiagnosis, emptySymptoms, emptyTreatment, validateClinical,
  type CaseDiagnosis, type CaseSymptoms, type CaseTreatment,
} from "@/lib/programmeModule/caseClinical";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  caseRow: PotentialCaseRow | null;
  /** true when the clinician confirmed it as an MMDP case. */
  onSaved: (confirmed: boolean) => void;
}

const CaseConfirmationDialog = ({ open, onOpenChange, projectId, caseRow, onSaved }: Props) => {
  const { toast } = useToast();
  const [condition, setCondition] = useState<LesionCondition>("lymphoedema");
  const [reference, setReference] = useState("0");
  const [criteria, setCriteria] = useState<Record<string, boolean>>({});
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<LesionMetrics | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [notes, setNotes] = useState("");
  const [rejection, setRejection] = useState("");
  const [saving, setSaving] = useState(false);
  const [stageChoice, setStageChoice] = useState("");
  const [symptoms, setSymptoms] = useState<CaseSymptoms>(emptySymptoms);
  const [diagnosis, setDiagnosis] = useState<CaseDiagnosis>(emptyDiagnosis);
  const [treatment, setTreatment] = useState<CaseTreatment>(emptyTreatment);

  useEffect(() => {
    if (!open || !caseRow) return;
    setCondition((caseRow.confirmed_condition || caseRow.condition) as LesionCondition);
    setCriteria(caseRow.clinical_criteria || {});
    setMeasures(Object.fromEntries(Object.entries(caseRow.measurements || {})
      .map(([k, v]) => [k, v == null ? "" : String(v)])));
    setNotes(caseRow.clinician_notes || "");
    setRejection(caseRow.rejection_reason || "");
    setMetrics(null);
    setPhotoUrl("");
    // The consultation, pre-filled with what the CDD already reported.
    const s = { ...emptySymptoms(), ...(caseRow.symptoms as Partial<CaseSymptoms> | undefined) };
    setSymptoms({
      ...s,
      items: s.items || {},
      acute_attacks_last_year: s.acute_attacks_last_year ?? caseRow.acute_attacks_last_year ?? null,
      onset: s.onset || ((caseRow.duration_years ?? 0) >= 1 ? "years" : ""),
    });
    setDiagnosis({
      ...emptyDiagnosis(),
      ...(caseRow.diagnosis as Partial<CaseDiagnosis> | undefined),
      comorbidities: (caseRow.diagnosis as Partial<CaseDiagnosis> | undefined)?.comorbidities || {},
    });
    setTreatment({
      ...emptyTreatment(),
      ...(caseRow.treatment as Partial<CaseTreatment> | undefined),
      given: (caseRow.treatment as Partial<CaseTreatment> | undefined)?.given || {},
    });
  }, [open, caseRow]);

  // Resolve the CDD's picture, then measure it on this device.
  const analyse = useCallback(async (src: string, refMm: number) => {
    setAnalysing(true);
    try {
      setMetrics(await analyseLesion(src, refMm));
    } catch {
      setMetrics(null);
    } finally {
      setAnalysing(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !caseRow?.photos?.length) return;
    let off = false;
    void (async () => {
      const url = await resolveMediaUrl(caseRow.photos[0]);
      if (off) return;
      setPhotoUrl(url);
      if (url) void analyse(url, Number(reference) || 0);
    })();
    return () => { off = true; };
  }, [open, caseRow, reference, analyse]);

  const numericMeasures = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(measures)) {
      const n = Number(v);
      out[k] = v !== "" && Number.isFinite(n) ? n : null;
    }
    return out;
  }, [measures]);

  const staged = useMemo(
    () => stageFromEvidence(condition, { criteria, measures: numericMeasures, metrics }),
    [condition, criteria, numericMeasures, metrics],
  );

  const hasEvidence = !!metrics
    || Object.values(criteria).some(Boolean)
    || Object.values(numericMeasures).some((v) => v != null);

  const { model } = useLesionStageModel(projectId, condition);
  const features = useMemo(
    () => buildFeatures(condition, { criteria, measures: numericMeasures, metrics }),
    [condition, criteria, numericMeasures, metrics],
  );
  const learned = useMemo(
    () => (model && hasEvidence ? predictStage(model, features) : null),
    [model, features, hasEvidence],
  );

  const suggested = learned && learned.confidence >= 0.5 ? learned.stage : staged.stage;
  useEffect(() => { setStageChoice(String(suggested)); }, [suggested]);

  const stageOptions = useMemo(
    () => (STAGE_LABELS[condition] || []).map((label, index) => ({ value: String(index), label })),
    [condition],
  );

  const decide = async (confirmed: boolean) => {
    if (!caseRow) return;
    if (!confirmed && !rejection.trim()) {
      toast({ title: "Give a reason", description: "Say why this is not an MMDP case.", variant: "destructive" });
      return;
    }
    if (confirmed) {
      const problem = validateClinical(diagnosis);
      if (problem) {
        toast({ title: "Complete the consultation", description: problem, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      const stage = stageChoice === "" ? null : Number(stageChoice);
      await confirmPotentialCase(caseRow.id, {
        confirmed,
        condition,
        stage,
        stageLabel: stage == null ? null : stageLabelFor(condition, stage),
        criteria,
        measurements: numericMeasures,
        analysis: {
          area_mm2: metrics?.areaMm2 ?? null,
          area_fraction: metrics?.areaFraction ?? null,
          longest_mm: metrics?.longestMm ?? null,
          redness_index: metrics?.rednessIndex ?? null,
          rule_stage: staged.stage,
          rule_label: staged.label,
          rule_rationale: staged.rationale,
          learned: learned ? { stage: learned.stage, confidence: learned.confidence } : null,
          reference_mm: Number(reference) || null,
        },
        symptoms: symptoms as unknown as Record<string, unknown>,
        diagnosis: diagnosis as unknown as Record<string, unknown>,
        treatment: treatment as unknown as Record<string, unknown>,
        notes,
        rejectionReason: rejection,
      });
      toast({
        title: confirmed ? "Case confirmed" : "Recorded as not a case",
        description: confirmed
          ? "It can now be kept at this facility or referred on."
          : "It stays in the register for reporting.",
      });
      onSaved(confirmed);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!caseRow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clinician confirmation — {caseRow.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="flex flex-wrap items-start gap-4 p-4">
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              {photoUrl
                ? <img src={photoUrl} alt="Affected area" className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No picture submitted
                </div>}
            </div>
            <div className="min-w-[200px] flex-1 space-y-1 text-sm">
              <p className="text-foreground">
                {caseRow.sex || "—"}{caseRow.age != null ? `, ${caseRow.age} years` : ""}
              </p>
              <p className="text-muted-foreground">
                {[caseRow.community, caseRow.ward, caseRow.lga].filter(Boolean).join(" · ") || "No location"}
              </p>
              <p className="text-muted-foreground">
                Swelling for {caseRow.duration_years ?? "—"} years ·{" "}
                {caseRow.acute_attacks_last_year ?? 0} acute attacks last year
              </p>
              {caseRow.notes && <p className="text-muted-foreground">CDD note: {caseRow.notes}</p>}
              {analysing && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Measuring the picture on this device…
                </p>
              )}
              {metrics && (
                <p className="text-xs text-muted-foreground">
                  Measured: {metrics.areaMm2 && metrics.areaMm2 > 0
                    ? `${(metrics.areaMm2 / 100).toFixed(1)} cm²`
                    : `${(metrics.areaFraction * 100).toFixed(1)}% of frame`}
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Condition confirmed</Label>
              <Select
                value={condition}
                onValueChange={(v) => { setCondition(v as LesionCondition); setCriteria({}); setMeasures({}); }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {MMDP_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Reference object in the picture</Label>
              <Select value={reference} onValueChange={setReference}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {SCALE_REFERENCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-border p-3 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-foreground">Signs seen on examination</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Tick everything present — the highest sign sets the stage on the recognised scale.
              </p>
              <div className="space-y-1.5">
                {CLINICAL_CRITERIA[condition].map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={!!criteria[c.key]}
                      onCheckedChange={(v) => setCriteria((p) => ({ ...p, [c.key]: v === true }))}
                    />
                    <span className="text-foreground">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Measurements at examination</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Used to grade size-based scales and to chart change at later visits.
              </p>
              <div className="space-y-2">
                {MEASUREMENT_FIELDS[condition].map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label} ({f.unit})</Label>
                    <Input
                      type="number" inputMode="decimal" className="mt-1 h-9"
                      value={measures[f.key] ?? ""}
                      onChange={(e) => setMeasures((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ScanEye className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Suggested stage</span>
              <Badge variant="outline">{staged.label}</Badge>
              {learned && (
                <Badge variant="outline">
                  Learned: {stageLabelFor(condition, learned.stage)} ({Math.round(learned.confidence * 100)}%)
                </Badge>
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Decision support only — your confirmation is what is recorded.
            </p>
            <div className="max-w-md">
              <Label className="text-sm">Stage you confirm</Label>
              <Select value={stageChoice} onValueChange={setStageChoice}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select stage…" /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {stageOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* ---------------- The consultation itself ---------------- */}
          <Card className="space-y-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Symptoms reported</p>
              <p className="text-xs text-muted-foreground">
                What the person complains of today — tick all that apply.
              </p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {symptomsFor(condition).map((s) => (
                <label key={s.key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={!!symptoms.items[s.key]}
                    onCheckedChange={(v) => setSymptoms((p) => ({
                      ...p, items: { ...p.items, [s.key]: v === true },
                    }))}
                  />
                  <span className="text-foreground">{s.label}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">How long</Label>
                <Select value={symptoms.onset} onValueChange={(v) => setSymptoms((p) => ({ ...p, onset: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {ONSET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Course</Label>
                <Select
                  value={symptoms.progression}
                  onValueChange={(v) => setSymptoms((p) => ({ ...p, progression: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {PROGRESSION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severity today</Label>
                <Select
                  value={symptoms.severity}
                  onValueChange={(v) => setSymptoms((p) => ({ ...p, severity: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {SEVERITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Acute attacks (12 months)</Label>
                <Input
                  type="number" inputMode="numeric" className="mt-1 h-9"
                  value={symptoms.acute_attacks_last_year ?? ""}
                  onChange={(e) => setSymptoms((p) => ({
                    ...p,
                    acute_attacks_last_year: e.target.value === "" ? null : Number(e.target.value),
                  }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">History in the person's own words</Label>
              <Textarea
                className="mt-1" rows={2} value={symptoms.narrative}
                onChange={(e) => setSymptoms((p) => ({ ...p, narrative: e.target.value }))}
              />
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium text-foreground">Diagnosis</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Primary diagnosis</Label>
                <Select
                  value={diagnosis.primary}
                  onValueChange={(v) => setDiagnosis((p) => ({ ...p, primary: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select diagnosis…" /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {DIAGNOSIS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Certainty</Label>
                <Select
                  value={diagnosis.certainty}
                  onValueChange={(v) => setDiagnosis((p) => ({ ...p, certainty: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {CERTAINTY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {diagnosis.primary === "other" && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Write the diagnosis</Label>
                  <Input
                    className="mt-1 h-9" value={diagnosis.primary_other}
                    onChange={(e) => setDiagnosis((p) => ({ ...p, primary_other: e.target.value }))}
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label className="text-xs">Differential / ruled out</Label>
                <Input
                  className="mt-1 h-9" value={diagnosis.differential}
                  placeholder="e.g. podoconiosis ruled out — no highland soil exposure"
                  onChange={(e) => setDiagnosis((p) => ({ ...p, differential: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Other conditions present</p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {COMORBIDITIES.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={!!diagnosis.comorbidities[c.key]}
                      onCheckedChange={(v) => setDiagnosis((p) => ({
                        ...p, comorbidities: { ...p.comorbidities, [c.key]: v === true },
                      }))}
                    />
                    <span className="text-foreground">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium text-foreground">Treatment given & plan</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {TREATMENTS_GIVEN.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={!!treatment.given[t.key]}
                    onCheckedChange={(v) => setTreatment((p) => ({
                      ...p, given: { ...p.given, [t.key]: v === true },
                    }))}
                  />
                  <span className="text-foreground">{t.label}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Medicines, dose and duration</Label>
                <Textarea
                  className="mt-1" rows={2} value={treatment.medicines}
                  placeholder="e.g. Amoxicillin 500 mg 8-hourly for 7 days"
                  onChange={(e) => setTreatment((p) => ({ ...p, medicines: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Self-care plan agreed</Label>
                <Textarea
                  className="mt-1" rows={2} value={treatment.self_care_plan}
                  placeholder="e.g. wash twice daily, elevate at night, treat entry lesions"
                  onChange={(e) => setTreatment((p) => ({ ...p, self_care_plan: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Next step</Label>
                <Select
                  value={treatment.next_step}
                  onValueChange={(v) => setTreatment((p) => ({ ...p, next_step: v }))}
                >
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select next step…" /></SelectTrigger>
                  <SelectContent className="z-[1200] bg-popover">
                    {NEXT_STEPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Next review date</Label>
                <Input
                  type="date" className="mt-1 h-9" value={treatment.follow_up_date}
                  onChange={(e) => setTreatment((p) => ({ ...p, follow_up_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Counselling given</Label>
              <Textarea
                className="mt-1" rows={2} value={treatment.counselling_notes}
                onChange={(e) => setTreatment((p) => ({ ...p, counselling_notes: e.target.value }))}
              />
            </div>
            {clinicalSummary(condition, symptoms, diagnosis, treatment) && (
              <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                {clinicalSummary(condition, symptoms, diagnosis, treatment)}
              </p>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm">Clinical notes</Label>
              <Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">If not a case, why?</Label>
              <Textarea
                className="mt-1" rows={3} value={rejection}
                placeholder="e.g. swelling is due to another cause"
                onChange={(e) => setRejection(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={saving} onClick={() => void decide(false)}>
            Not a case
          </Button>
          <Button disabled={saving} onClick={() => void decide(true)}>
            {saving ? "Saving…" : "Confirm case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CaseConfirmationDialog;
