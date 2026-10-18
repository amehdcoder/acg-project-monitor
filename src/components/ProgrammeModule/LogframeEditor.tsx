// Full editor for a project's logframe: project header, objective narratives,
// result areas, indicators/activities, baselines, targets and disaggregations.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultLogframe, type LogframeObjective, type ProjectLogframe } from "@/lib/programmeModule/logframe";

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

export default function LogframeEditor({ open, onOpenChange, value, onSave }: Props) {
  const [lf, setLf] = useState<ProjectLogframe>(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setLf(JSON.parse(JSON.stringify(value))); }, [open, value]);

  const mutate = (fn: (d: ProjectLogframe) => void) => setLf((prev) => { const d = JSON.parse(JSON.stringify(prev)) as ProjectLogframe; fn(d); return d; });

  const targetInputs = (targets: (string | null)[], set: (i: number, v: string) => void) => (
    <div className="grid grid-cols-4 gap-1.5">
      {[0, 1, 2, 3].map((i) => <Input key={i} aria-label={`Year ${i + 1} target`} placeholder={`Y${i + 1}`} value={targets[i] ?? ""} onChange={(e) => set(i, e.target.value)} className="h-9 px-2 text-xs" />)}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pt-5 pb-3">
          <DialogTitle>Edit report framework</DialogTitle>
          <DialogDescription>Every objective, result area, indicator, baseline, target and disaggregation can be changed. Changes apply to everyone reporting on this project.</DialogDescription>
        </DialogHeader>
        <div className="form-scroll max-h-[calc(92dvh-10rem)] space-y-5 overflow-y-auto px-5 py-4">
          <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
            <Field label="Project ID"><Input value={lf.project.id} onChange={(e) => mutate((d) => { d.project.id = e.target.value; })} /></Field>
            <Field label="Country"><Input value={lf.project.country} onChange={(e) => mutate((d) => { d.project.country = e.target.value; })} /></Field>
            <Field label="Project title" className="sm:col-span-3"><Input value={lf.project.name} onChange={(e) => mutate((d) => { d.project.name = e.target.value; })} /></Field>
            <Field label="Impact statement" className="sm:col-span-3"><Textarea rows={2} value={lf.project.impact} onChange={(e) => mutate((d) => { d.project.impact = e.target.value; })} /></Field>
          </section>

          {lf.objectives.map((obj, oi) => (
            <section key={oi} className={cn("space-y-3 rounded-lg border-l-4 p-4", TONE_CLS[obj.tone] || TONE_CLS.blue)}>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Objective title" className="flex-1 basis-48"><Input value={obj.title} onChange={(e) => mutate((d) => { d.objectives[oi].title = e.target.value; })} /></Field>
                <Field label="Colour">
                  <div className="flex gap-1">{(["blue", "teal", "amber"] as const).map((t) => (
                    <Button key={t} type="button" size="sm" variant={obj.tone === t ? "default" : "outline"} className="h-10 capitalize" onClick={() => mutate((d) => { d.objectives[oi].tone = t; })}>{t}</Button>
                  ))}</div>
                </Field>
                <Button variant="ghost" size="icon" aria-label="Remove objective" onClick={() => mutate((d) => { d.objectives.splice(oi, 1); })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              <Field label="Objective narrative"><Textarea rows={2} value={obj.statement} onChange={(e) => mutate((d) => { d.objectives[oi].statement = e.target.value; })} /></Field>

              {obj.results.map((res, ri) => (
                <div key={ri} className="space-y-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-end gap-2">
                    <Field label="Result area" className="flex-1"><Input value={res.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].title = e.target.value; })} /></Field>
                    <Button variant="ghost" size="icon" aria-label="Remove result area" onClick={() => mutate((d) => { d.objectives[oi].results.splice(ri, 1); })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                  {res.indicators.map((ind, ii) => (
                    <div key={ii} className="grid gap-2 rounded-md border border-health-blue/20 bg-health-blue/5 p-3 sm:grid-cols-6">
                      <Field label="Code"><Input value={ind.code} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].code = e.target.value; })} className="font-mono text-xs" /></Field>
                      <Field label="Indicator name" className="sm:col-span-5"><Input value={ind.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].title = e.target.value; })} /></Field>
                      <Field label="Means of verification" className="sm:col-span-2"><Input value={ind.mov || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].mov = e.target.value; })} /></Field>
                      <Field label="Baseline"><Input value={ind.baseline || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].baseline = e.target.value; })} /></Field>
                      <Field label="Year 1–4 targets" className="sm:col-span-2">{targetInputs(ind.targets, (i, v) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].targets[i] = v || null; }))}</Field>
                      <Field label="Total target"><Input value={ind.totalTarget || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].totalTarget = e.target.value; })} /></Field>
                      <Field label="Disaggregations (comma separated)" className="sm:col-span-4"><Input value={(ind.disaggregation || []).join(", ")} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].disaggregation = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
                      <div className="flex items-end gap-2 sm:col-span-2">
                        <Button type="button" size="sm" variant={ind.isPercent ? "default" : "outline"} className="h-10" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators[ii].isPercent = !ind.isPercent; })}>%</Button>
                        <Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators.splice(ii, 1); })}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
                      </div>
                    </div>
                  ))}
                  {res.activities.map((act, ai) => (
                    <div key={`a${ai}`} className="grid gap-2 rounded-md border border-status-warning/30 bg-status-warning/5 p-3 sm:grid-cols-6">
                      <Field label="Activity code"><Input value={act.code} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].code = e.target.value; })} className="font-mono text-xs" /></Field>
                      <Field label="Activity" className="sm:col-span-5"><Input value={act.title} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].title = e.target.value; })} /></Field>
                      <Field label="Activity indicator" className="sm:col-span-3"><Input value={act.indicator} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].indicator = e.target.value; })} /></Field>
                      <Field label="Means of verification" className="sm:col-span-3"><Input value={act.mov || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].mov = e.target.value; })} /></Field>
                      <Field label="Year 1–4 targets" className="sm:col-span-2">{targetInputs(act.targets, (i, v) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].targets[i] = v || null; }))}</Field>
                      <Field label="Total target"><Input value={act.totalTarget || ""} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].totalTarget = e.target.value; })} /></Field>
                      <Field label="Disaggregations" className="sm:col-span-2"><Input value={(act.disaggregation || []).join(", ")} onChange={(e) => mutate((d) => { d.objectives[oi].results[ri].activities[ai].disaggregation = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
                      <div className="flex items-end"><Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => mutate((d) => { d.objectives[oi].results[ri].activities.splice(ai, 1); })}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button></div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => mutate((d) => { d.objectives[oi].results[ri].indicators.push({ code: `${obj.key.toUpperCase()}.NEW${Date.now() % 10000}`, title: "New indicator", targets: [null, null, null, null] }); })}><Plus className="mr-1 h-4 w-4" /> Indicator</Button>
                    <Button variant="outline" size="sm" onClick={() => mutate((d) => { d.objectives[oi].results[ri].activities.push({ code: `ACT${Date.now() % 100000}`, title: "New activity", indicator: "Activity indicator", targets: [null, null, null, null] }); })}><Plus className="mr-1 h-4 w-4" /> Activity</Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => mutate((d) => { d.objectives[oi].results.push({ key: `${obj.key}-r${Date.now() % 10000}`, title: "New result area", indicators: [], activities: [] }); })}><Plus className="mr-1 h-4 w-4" /> Result area</Button>
            </section>
          ))}
          <Button variant="outline" onClick={() => mutate((d) => { const n = d.objectives.length + 1; d.objectives.push({ key: `so${n}-${Date.now() % 10000}`, title: `Specific Objective ${n}`, statement: "", tone: (["blue", "teal", "amber"] as LogframeObjective["tone"][])[n % 3], results: [] }); })}><Plus className="mr-1 h-4 w-4" /> Specific Objective</Button>
        </div>
        <DialogFooter className="gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => setLf(defaultLogframe())}><RotateCcw className="mr-1 h-4 w-4" /> Restore original</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await onSave(lf); onOpenChange(false); } finally { setBusy(false); } }}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save framework
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
