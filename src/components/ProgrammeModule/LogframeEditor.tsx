// Full editor for a project's logframe: project header, objective narratives,
// result areas, indicators/activities, baselines, targets and disaggregations.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultLogframe, type LogframeObjective, type ProjectLogframe } from "@/lib/programmeModule/logframe";
import { validateLogframe } from "@/lib/programmeModule/logframeValidation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: ProjectLogframe;
  onSave: (lf: ProjectLogframe) => Promise<void>;
}

const TONE_CLS: Record<string, string> = {
  blue: "border-health-blue bg-health-blue/5",
  teal: "border-health-teal bg-health-teal/5",
  amber: "border-status-warning bg-status-warning/5",
};

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("min-w-0", className)}><Label className="text-[11px] font-semibold text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>
);

const STEPS = ["Project & impact", "Specific objectives", "Results & outcomes", "Indicators", "Activities", "Review"];
const AUTO_SOURCES = ["people_accessing_services", "pwd_accessing_services", "people_screened", "people_treated", "referral_completion", "eye_screenings", "eye_surgeries", "spectacles_distributed", "followup_visits", "home_visits", "mhpss_services", "morbidity_services", "completed_referrals", "ccfm_resolved_pct", "ccfm_cases", "livelihood_participants", "livelihood_assessed"] as const;

export default function LogframeEditor({ open, onOpenChange, value, onSave }: Props) {
  const [lf, setLf] = useState<ProjectLogframe>(value);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [objectiveIndex, setObjectiveIndex] = useState(0);
  const [resultIndex, setResultIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => { if (open) { setLf(JSON.parse(JSON.stringify(value))); setStep(0); setObjectiveIndex(0); setResultIndex(0); setErrors([]); } }, [open, value]);

  const mutate = (fn: (d: ProjectLogframe) => void) => setLf((prev) => { const d = JSON.parse(JSON.stringify(prev)) as ProjectLogframe; fn(d); return d; });

  const targetInputs = (targets: (string | null)[], set: (i: number, v: string) => void) => (
    <div className="grid grid-cols-4 gap-1.5">
      {[0, 1, 2, 3].map((i) => <Input key={i} aria-label={`Year ${i + 1} target`} placeholder={`Y${i + 1}`} value={targets[i] ?? ""} onChange={(e) => set(i, e.target.value)} className="h-9 px-2 text-xs" />)}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pt-5 pb-3">
          <DialogTitle>Build programme logframe</DialogTitle>
          <DialogDescription>Step {step + 1} of {STEPS.length} · {STEPS[step]}</DialogDescription>
        </DialogHeader>
        <nav aria-label="Logframe steps" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-5 py-3">
          {STEPS.map((label, index) => <Button key={label} variant={step === index ? "default" : "ghost"} className="shrink-0 gap-2" size="sm" onClick={() => { setStep(index); setErrors([]); }}><span>{index + 1}</span>{label}</Button>)}
        </nav>
        {step > 0 && step < 5 && <div className="flex shrink-0 flex-wrap gap-3 border-b border-border px-5 py-3">
          <Select value={String(objectiveIndex)} onValueChange={(v) => { setObjectiveIndex(Number(v)); setResultIndex(0); }}><SelectTrigger className="w-full sm:w-72" aria-label="Choose objective"><SelectValue placeholder="Choose objective" /></SelectTrigger><SelectContent>{lf.objectives.map((o, i) => <SelectItem key={o.key} value={String(i)}>{o.title}</SelectItem>)}</SelectContent></Select>
          {step >= 2 && <Select value={String(resultIndex)} onValueChange={v => setResultIndex(Number(v))}><SelectTrigger className="w-full sm:w-72" aria-label="Choose result area"><SelectValue placeholder="Choose result area" /></SelectTrigger><SelectContent>{lf.objectives[objectiveIndex]?.results.map((r, i) => <SelectItem key={r.key} value={String(i)}>{r.title}</SelectItem>)}</SelectContent></Select>}
        </div>}
        <div className="form-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {step === 0 && <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Project ID"><Input value={lf.project.id} onChange={(e) => mutate((d) => { d.project.id = e.target.value; })} /></Field>
            <Field label="Country"><Input value={lf.project.country} onChange={(e) => mutate((d) => { d.project.country = e.target.value; })} /></Field>
            <Field label="Project title" className="sm:col-span-3"><Input value={lf.project.name} onChange={(e) => mutate((d) => { d.project.name = e.target.value; })} /></Field>
            <Field label="Impact statement" className="sm:col-span-3"><Textarea rows={2} value={lf.project.impact} onChange={(e) => mutate((d) => { d.project.impact = e.target.value; })} /></Field>
          </section>}

          {step > 0 && step < 5 && lf.objectives.map((obj, oi) => oi === objectiveIndex ? (
            <section key={oi} className="space-y-4">
              {step === 1 ? <><div className="flex flex-wrap items-end gap-2">
                <Field label="Objective title" className="flex-1 basis-48"><Input value={obj.title} onChange={(e) => mutate((d) => { d.objectives[oi].title = e.target.value; })} /></Field>
                <Field label="Colour">
                  <div className="flex gap-1">{(["blue", "teal", "amber"] as const).map((t) => (
                    <Button key={t} type="button" size="sm" variant={obj.tone === t ? "default" : "outline"} className="h-10 capitalize" onClick={() => mutate((d) => { d.objectives[oi].tone = t; })}>{t}</Button>
                  ))}</div>
                </Field>
                <Button variant="ghost" size="icon" aria-label="Remove objective" onClick={() => mutate((d) => { d.objectives.splice(oi, 1); })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              <Field label="Objective narrative"><Textarea rows={3} value={obj.statement} onChange={(e) => mutate((d) => { d.objectives[oi].statement = e.target.value; })} /></Field></> : <p className="font-semibold text-health-teal">{obj.title} · {obj.statement}</p>}

              {step >= 2 && obj.results.map((res, ri) => ri === resultIndex ? (
                <div key={ri} className="space-y-4">
                  {step === 2 && <div className="flex items-end gap-2">
                    <Field label="Result area" className="flex-1"><Input value={res.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].title = e.target.value; })} /></Field>
                    <Button variant="ghost" size="icon" aria-label="Remove result area" onClick={() => mutate((d) => { d.objectives[oi].results.splice(ri, 1); })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>}
                  {step === 3 && res.indicators.map((ind, ii) => (
                    <div key={ii} className="grid gap-2 rounded-md border border-health-blue/20 bg-health-blue/5 p-3 sm:grid-cols-6">
                      <Field label="Code"><Input value={ind.code} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].code = e.target.value; })} className="font-mono text-xs" /></Field>
                      <Field label="Indicator name" className="sm:col-span-5"><Input value={ind.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].title = e.target.value; })} /></Field>
                      <Field label="Means of verification" className="sm:col-span-2"><Input value={ind.mov || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].mov = e.target.value; })} /></Field>
                      <Field label="Baseline"><Input value={ind.baseline || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].baseline = e.target.value; })} /></Field>
                      <Field label="Year 1–4 targets" className="sm:col-span-2">{targetInputs(ind.targets, (i, v) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].targets[i] = v || null; }))}</Field>
                      <Field label="Total target"><Input value={ind.totalTarget || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].totalTarget = e.target.value; })} /></Field>
                      <Field label="Disaggregations (comma separated)" className="sm:col-span-4"><Input value={(ind.disaggregation || []).join(", ")} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].disaggregation = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
                      <Field label="Auto-fill from records" className="sm:col-span-6"><Select value={ind.autoKey || "manual"} onValueChange={v => mutate(d => { const entry = d.objectives[oi].results[ri].indicators[ii]; entry.autoKey = v === "manual" ? undefined : AUTO_SOURCES.find(s => s === v); if (entry.autoKey === "referral_completion") entry.isPercent = true; })}><SelectTrigger aria-label={`Auto source ${ind.code}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual entry</SelectItem>{AUTO_SOURCES.map(source => <SelectItem key={source} value={source}>{source.replaceAll("_", " ")}{source === "referral_completion" ? " (%)" : ""}</SelectItem>)}</SelectContent></Select></Field>
                      <div className="flex items-end gap-2 sm:col-span-2">
                        <Button type="button" size="sm" variant={ind.isPercent ? "default" : "outline"} className="h-10" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].isPercent = !ind.isPercent; })}>%</Button>
                        <Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators.splice(ii, 1); })}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
                      </div>
                    </div>
                  ))}
                  {step === 4 && res.activities.map((act, ai) => (
                    <div key={`a${ai}`} className="grid gap-2 rounded-md border border-status-warning/30 bg-status-warning/5 p-3 sm:grid-cols-6">
                      <Field label="Activity code"><Input value={act.code} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].code = e.target.value; })} className="font-mono text-xs" /></Field>
                      <Field label="Activity" className="sm:col-span-5"><Input value={act.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].title = e.target.value; })} /></Field>
                      <Field label="Activity indicator" className="sm:col-span-3"><Input value={act.indicator} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].indicator = e.target.value; })} /></Field>
                      <Field label="Means of verification" className="sm:col-span-3"><Input value={act.mov || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].mov = e.target.value; })} /></Field>
                      <Field label="Year 1–4 targets" className="sm:col-span-2">{targetInputs(act.targets, (i, v) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].targets[i] = v || null; }))}</Field>
                      <Field label="Total target"><Input value={act.totalTarget || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].totalTarget = e.target.value; })} /></Field>
                      <Field label="Disaggregations" className="sm:col-span-2"><Input value={(act.disaggregation || []).join(", ")} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].disaggregation = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
                      <Field label="Auto-fill from records" className="sm:col-span-4"><Select value={act.autoKey || "manual"} onValueChange={v => mutate(d => { const entry = d.objectives[oi].results[ri].activities[ai]; entry.autoKey = v === "manual" ? undefined : AUTO_SOURCES.find(s => s === v); if (entry.autoKey === "referral_completion") entry.isPercent = true; })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual entry</SelectItem>{AUTO_SOURCES.map(source => <SelectItem key={source} value={source}>{source.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Percentage (%)"><Switch checked={!!act.isPercent} onCheckedChange={checked => mutate(d => { d.objectives[oi].results[ri].activities[ai].isPercent = checked; })} aria-label={`Percentage for ${act.code}`} /></Field>
                      <div className="flex items-end"><Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => mutate((d) => { d.objectives[oi].results[ri].activities.splice(ai, 1); })}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button></div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {step === 3 && <Button variant="outline" size="sm" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators.push({ code: `IND-${crypto.randomUUID().slice(0, 8)}`, title: "", targets: [null, null, null, null] }); })}><Plus className="mr-1 h-4 w-4" /> Add indicator</Button>}
                    {step === 4 && <Button variant="outline" size="sm" onClick={() => mutate((d) => { d.objectives[oi].results[ri].activities.push({ code: `ACT-${crypto.randomUUID().slice(0, 8)}`, title: "", indicator: "", targets: [null, null, null, null] }); })}><Plus className="mr-1 h-4 w-4" /> Add activity</Button>}
                  </div>
                </div>
              ) : null)}
              {step === 2 && <Button variant="outline" size="sm" onClick={() => { setResultIndex(obj.results.length); mutate((d) => { d.objectives[oi].results.push({ key: `${obj.key}-r-${crypto.randomUUID()}`, title: "", indicators: [], activities: [] }); }); }}><Plus className="mr-1 h-4 w-4" /> Add result area</Button>}
            </section>
          ) : null)}
          {step === 1 && <Button variant="outline" onClick={() => { setObjectiveIndex(lf.objectives.length); setResultIndex(0); mutate((d) => { const n = d.objectives.length + 1; d.objectives.push({ key: `so-${crypto.randomUUID()}`, title: `Specific Objective ${n}`, statement: "", tone: (["blue", "teal", "amber"] as LogframeObjective["tone"][])[n % 3], results: [] }); }); }}><Plus className="mr-1 h-4 w-4" /> Add Specific Objective</Button>}
          {step === 5 && <section className="space-y-5"><h3 className="text-xl font-semibold">{lf.project.name}</h3><p className="text-muted-foreground">{lf.project.impact}</p>{lf.objectives.map(o => <div key={o.key} className={cn("border-l-4 pl-4", TONE_CLS[o.tone])}><h4 className="font-semibold">{o.title}</h4><p className="text-sm">{o.statement}</p>{o.results.map(r => <div key={r.key} className="mt-3"><p className="font-medium">{r.title}</p><p className="text-sm text-muted-foreground">{r.indicators.length} indicators · {r.activities.length} activities</p>{[...r.indicators, ...r.activities].map(i => <p key={i.code} className="mt-1 text-sm"><span className="font-mono text-health-blue">{i.code}</span> · {i.title} · Target {i.totalTarget || "—"}{i.isPercent ? "%" : ""}</p>)}</div>)}</div>)}</section>}
          {errors.length > 0 && <div role="alert" className="border-l-4 border-destructive bg-destructive/5 p-3 text-sm text-destructive"><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => { setLf(defaultLogframe()); setStep(0); }}><RotateCcw className="mr-1 h-4 w-4" /> Restore original</Button>
          <Button variant="outline" disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
          {step < 5 ? <Button onClick={() => setStep(s => s + 1)}>Continue <ArrowRight className="ml-1 h-4 w-4" /></Button> : <Button disabled={busy} onClick={async () => { const issues = validateLogframe(lf); setErrors(issues); if (issues.length) return; setBusy(true); try { await onSave(lf); onOpenChange(false); } catch (e) { setErrors([(e as Error).message]); } finally { setBusy(false); } }}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Save framework
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
