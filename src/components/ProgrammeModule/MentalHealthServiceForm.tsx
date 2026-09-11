// GAD-7 / PHQ-9 questionnaire recorded directly against a beneficiary.
//
// Visual language deliberately mirrors the Standard Forms Mental Health
// assessment (green GAD-7 / violet PHQ-9 header, frequency matrix, progress
// bar, score card) so clinicians see one consistent instrument everywhere.

import { useMemo, useState } from "react";
import { ArrowLeft, Brain, CloudRain, Check, Info } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueue, flushQueue, newUuid } from "@/lib/programmeModule/offlineQueue";
import { STANDARD_ASSESSMENTS, scoreAssessment } from "@/lib/standardAssessments/definitions";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { recordAudit } from "./useProgrammeModule";

export type MhFormKey = "gad_7" | "phq_9";

/** Maps a configured service name to a screening instrument, if any. */
export const mhFormForService = (serviceName?: string | null): MhFormKey | null => {
  const s = (serviceName || "").toLowerCase();
  if (s.includes("gad")) return "gad_7";
  if (s.includes("phq")) return "phq_9";
  return null;
};

const FREQ_COLUMNS = [
  { value: "0", label: "Not at all" },
  { value: "1", label: "Several days" },
  { value: "2", label: "More than half the days" },
  { value: "3", label: "Nearly every day" },
];

const DIFFICULTY = [
  { value: "not", label: "Not difficult at all" },
  { value: "somewhat", label: "Somewhat difficult" },
  { value: "very", label: "Very difficult" },
  { value: "extremely", label: "Extremely difficult" },
];

export const MH_THEME: Record<MhFormKey, {
  name: string; subtitle: string; headerBg: string; intro: string; introBg: string;
  progress: string; radioChecked: string; nextBtn: string; iconBg: string; iconFg: string;
  Icon: typeof Brain; hex: string;
}> = {
  gad_7: {
    name: "GAD-7", subtitle: "General Anxiety Disorder",
    headerBg: "bg-emerald-800", introBg: "bg-emerald-50",
    intro: "The questions below ask how often the patient has experienced anxiety symptoms over the past two weeks.",
    progress: "bg-emerald-600", radioChecked: "border-emerald-600 bg-emerald-600",
    nextBtn: "bg-emerald-700 hover:bg-emerald-800", iconBg: "bg-emerald-100", iconFg: "text-emerald-700",
    Icon: Brain, hex: "#0F7E4F",
  },
  phq_9: {
    name: "PHQ-9", subtitle: "Patient Health Questionnaire",
    headerBg: "bg-violet-800", introBg: "bg-violet-50",
    intro: "Over the last 2 weeks, how often has the patient been bothered by any of the following problems?",
    progress: "bg-violet-600", radioChecked: "border-violet-600 bg-violet-600",
    nextBtn: "bg-violet-700 hover:bg-violet-800", iconBg: "bg-violet-100", iconFg: "text-violet-700",
    Icon: CloudRain, hex: "#7C3AED",
  },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formKey: MhFormKey;
  serviceName: string;
  componentKey: string;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  onSaved: () => void;
}

const MentalHealthServiceForm = ({
  open, onOpenChange, formKey, serviceName, componentKey,
  beneficiary, moduleId, projectId, onSaved,
}: Props) => {
  const { toast } = useToast();
  const def = STANDARD_ASSESSMENTS[formKey];
  const theme = MH_THEME[formKey];
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ReturnType<typeof scoreAssessment> | null>(null);
  const [saving, setSaving] = useState(false);

  const answered = useMemo(
    () => def.items.filter((q) => responses[q.id] != null && responses[q.id] !== "").length,
    [def.items, responses],
  );
  const total = def.items.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const closing = def.closing?.[0];

  const reset = () => { setResponses({}); setResult(null); };

  const save = async () => {
    if (answered < total) {
      toast({ title: "Please answer all questions", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const scored = scoreAssessment(formKey, responses);
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        beneficiary_id: beneficiary.id,
        module_id: moduleId,
        project_id: projectId,
        component_key: componentKey,
        service_name: serviceName,
        service_date: serviceDate,
        result: `Score ${scored.score} — ${scored.severity}`,
        status:
          scored.score >= 15 ? "at_risk" : scored.score >= 10 ? "needs_follow_up" : "on_track",
        data: {
          form_code: formKey,
          responses,
          score: scored.score,
          severity: scored.severity,
          interpretation: scored.interpretation,
          patient: {
            case_id: beneficiary.case_id,
            full_name: beneficiary.full_name,
          },
        } as Record<string, unknown>,
        submission_uuid: newUuid(),
        recorded_by: auth.user?.id,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from("beneficiary_services").insert(payload as never);
        if (error) throw error;
        await recordAudit({
          beneficiary_id: beneficiary.id, project_id: projectId,
          action: "assessment_recorded", field_name: formKey, new_value: payload.result,
        });
      } else {
        enqueue("service", payload as unknown as Record<string, unknown>);
        toast({ title: "Saved offline", description: "It will sync when you are back online." });
      }
      void flushQueue();
      setResult(scored);
      onSaved();
    } catch (e) {
      toast({ title: "Could not save assessment", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const IntroIcon = theme.Icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto p-0">
        {/* Header */}
        <div className={`${theme.headerBg} px-4 py-4 text-white`}>
          <div className="flex items-center gap-3">
            <button onClick={() => onOpenChange(false)} aria-label="Close assessment" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold leading-tight">{theme.name}</h1>
              <p className="text-xs text-white/80">{theme.subtitle}</p>
            </div>
            <Info className="h-5 w-5 shrink-0 opacity-90" />
          </div>
          <p className="mt-2 text-center text-xs text-white/85">
            {beneficiary.full_name} · Case ID {beneficiary.case_id}
          </p>
        </div>

        {result ? (
          <div className="px-4 py-6">
            <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <div className="text-4xl font-bold text-slate-900">{result.score}</div>
              <div className="text-lg font-semibold text-slate-800">{result.severity}</div>
              <p className="text-sm text-slate-600">{result.interpretation}</p>
              <div className="flex flex-col gap-2 pt-3">
                <Button className={`${theme.nextBtn} text-white`} onClick={() => { reset(); onOpenChange(false); }}>
                  Back to record
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full ${theme.progress} transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
              </div>
              <span className="shrink-0 text-sm font-medium text-slate-500">{answered} of {total}</span>
            </div>

            <div className="space-y-5 px-3 py-4 sm:px-5">
              <div className={`flex gap-3 rounded-xl p-4 ${theme.introBg}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${theme.iconBg}`}>
                  <IntroIcon className={`h-5 w-5 ${theme.iconFg}`} />
                </div>
                <p className="text-sm text-slate-700">{theme.intro}</p>
              </div>

              <div className="max-w-xs space-y-1.5">
                <Label>Date of assessment</Label>
                <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
              </div>

              <div>
                <h2 className="mb-3 text-base font-bold text-slate-900">
                  Over the last 2 weeks, how often have you been bothered by the following problems?
                </h2>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_repeat(4,3rem)] gap-1 border-b border-slate-100 px-3 pb-2 pt-3 sm:grid-cols-[1fr_repeat(4,4rem)]">
                    <div />
                    {FREQ_COLUMNS.map((c) => (
                      <div key={c.value} className="text-center">
                        <div className="text-[10px] font-medium leading-tight text-slate-500 sm:text-xs">{c.label}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{c.value}</div>
                      </div>
                    ))}
                  </div>
                  {def.items.map((q, i) => {
                    const label = q.label.replace(/^\d+\.\s*/, "");
                    return (
                      <div
                        key={q.id}
                        className="grid grid-cols-[1fr_repeat(4,3rem)] items-center gap-1 border-b border-slate-50 px-3 py-3 last:border-b-0 sm:grid-cols-[1fr_repeat(4,4rem)]"
                      >
                        <div className="flex gap-1.5 pr-1 text-xs text-slate-700 sm:text-sm">
                          <span className="text-slate-400">{i + 1}.</span>
                          <span>{label}</span>
                        </div>
                        {FREQ_COLUMNS.map((c) => {
                          const selected = responses[q.id] === c.value;
                          return (
                            <div key={c.value} className="flex justify-center">
                              <button
                                type="button"
                                aria-label={`${label}: ${c.label}`}
                                onClick={() => setResponses((p) => ({ ...p, [q.id]: c.value }))}
                                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                                  selected ? theme.radioChecked : "border-slate-300 bg-white"
                                }`}
                              >
                                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {closing && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">{closing.label}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DIFFICULTY.map((d) => {
                      const selected = responses[closing.id] === d.value;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => setResponses((p) => ({ ...p, [closing.id]: d.value }))}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            selected ? "border-slate-900 bg-slate-100 font-medium" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className={`${theme.nextBtn} text-white`} onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Submit assessment"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MentalHealthServiceForm;
