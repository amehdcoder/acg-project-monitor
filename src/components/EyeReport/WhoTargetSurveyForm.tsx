import { useState } from "react";
import { ClipboardPlus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllStates, getLGAsForState } from "@/lib/nigeriaAdminData";
import { MILESTONES, type MilestoneKey } from "@/lib/eyeReport/milestones";
import { SURVEY_FIELDS, type SavedSurvey } from "@/lib/eyeReport/surveyEvidence";
import { saveSurvey } from "@/lib/eyeReport/surveyStore";
import { surveyGeography, type SurveyGeography } from "@/lib/eyeReport/milestoneWorkbook";
import { SurveyDate } from "./SurveyEvidenceEntry";

type Props = { indicator: MilestoneKey; projectId: string; userId: string; geography: SurveyGeography[]; initialState: string; initialLga: string; saved: SavedSurvey[]; onSaved: (row: SavedSurvey) => void };
export default function WhoTargetSurveyForm(props: Props) {
  const [open, setOpen] = useState(false);
  const target = MILESTONES.find(m => m.key === props.indicator);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" className="mt-3 w-full border-eye-teal/40 text-eye-teal" aria-label={`Fill survey: ${target?.title}`}><ClipboardPlus className="mr-2 h-4 w-4" />Fill & save survey</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle className="pr-5 text-eye-deep">{target?.title} · Survey</DialogTitle></DialogHeader>
      {open && <SurveyFields {...props} close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}
function SurveyFields({ indicator, projectId, userId, geography, initialState, initialLga, saved, onSaved, close }: Props & { close: () => void }) {
  const places = surveyGeography([...geography, ...saved]);
  const states = places.length ? places.map(p => p.state) : getAllStates();
  const [state, setState] = useState(states.includes(initialState) ? initialState : states[0] ?? "");
  const [lga, setLga] = useState(initialLga || "State");
  const [date, setDate] = useState("");
  const [baselineDate, setBaselineDate] = useState("");
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const [baselineNumerator, setBaselineNumerator] = useState("");
  const [baselineDenominator, setBaselineDenominator] = useState("");
  const [source, setSource] = useState("");
  const [methodology, setMethodology] = useState("");
  const [representative, setRepresentative] = useState(false);
  const [editing, setEditing] = useState<SavedSurvey>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = SURVEY_FIELDS[indicator];
  const backlog = indicator === "backlog";
  const lgas = places.length ? places.find(p => p.state === state)?.lgas ?? [] : getLGAsForState(state);
  const history = saved.filter(r => r.indicator === indicator && r.created_by === userId).sort((a,b) => b.date.localeCompare(a.date));
  const choose = (id: string) => {
    const row = history.find(r => r.id === id); setEditing(row); setError("");
    setState(row?.state ?? initialState); setLga(row?.lga ?? initialLga); setDate(row?.date ?? ""); setBaselineDate(row?.baseline_date ?? "");
    setNumerator(row ? String(row.numerator) : ""); setDenominator(row?.denominator == null ? "" : String(row.denominator));
    setBaselineNumerator(row ? String(row.baseline_numerator) : ""); setBaselineDenominator(row?.baseline_denominator == null ? "" : String(row.baseline_denominator));
    setSource(row?.source ?? ""); setMethodology(row?.methodology ?? ""); setRepresentative(row?.representative ?? false);
  };
  const measured = backlog ? Number(numerator) : Number(denominator) > 0 ? Number(numerator) / Number(denominator) * 100 : NaN;
  const count = (v: string) => { if (!v.trim()) throw new Error("Fill in all required survey counts."); return Number(v); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (!states.includes(state) || (lga !== "State" && !lgas.includes(lga))) throw new Error("Choose a valid State and LGA.");
      const duplicate = saved.find(r => r.indicator === indicator && r.state === state && r.lga === lga && r.date === date);
      if (duplicate && duplicate.id !== editing?.id) throw new Error("A survey already exists for this target, location and date. Select it from Saved surveys to edit.");
      const result = await saveSurvey(projectId, userId, { indicator, state, lga, date, baseline_date: baselineDate, numerator: count(numerator), denominator: backlog ? null : count(denominator), baseline_numerator: count(baselineNumerator), baseline_denominator: backlog ? null : count(baselineDenominator), source, methodology, representative }, editing);
      onSaved(result.row); toast.success(result.queued ? "Survey saved on this device · awaiting sync" : "Survey saved · scorecard updated"); close();
    } catch (err) { setError(err instanceof Error ? err.message : "Survey could not be saved."); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4">
    <p className="border-l-4 border-eye-teal bg-eye-mint p-3 text-sm text-eye-ink">{fields.population}</p>
    {history.length > 0 && <label className="block space-y-1 text-sm font-medium">Saved surveys<Select value={editing?.id ?? "new"} onValueChange={choose}><SelectTrigger aria-label="Saved surveys"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New observation</SelectItem>{history.map(r => <SelectItem key={r.id} value={r.id}>{r.state} · {r.lga} · {r.date} · {Number(r.value).toFixed(2)}{backlog ? " people" : "%"}</SelectItem>)}</SelectContent></Select></label>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">State<Select value={state} onValueChange={v => { setState(v); setLga("State"); }}><SelectTrigger aria-label="Survey State"><SelectValue placeholder="Select State" /></SelectTrigger><SelectContent>{states.map(s => <SelectItem value={s} key={s}>{s}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1 text-sm font-medium">LGA<Select value={lga} onValueChange={setLga}><SelectTrigger aria-label="Survey LGA"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="State">State estimate</SelectItem>{lgas.map(l => <SelectItem value={l} key={l}>{l}</SelectItem>)}</SelectContent></Select></label>
      <SurveyDate label="Survey Date" value={date} onChange={setDate} /><SurveyDate label="Baseline Date" value={baselineDate} onChange={setBaselineDate} />
    </div>
    <fieldset className="space-y-3 border-t border-eye-teal/30 pt-3"><legend className="text-sm font-bold text-eye-teal">Current survey measurement</legend>
      <CountField label={fields.numerator} value={numerator} onChange={setNumerator} />
      {!backlog && <CountField label={fields.denominator} value={denominator} onChange={setDenominator} />}
      <p role="status" className="text-sm font-semibold text-eye-deep">Measured {backlog ? "remaining backlog" : "coverage / prevalence"}: {numerator.trim() && Number.isFinite(measured) ? `${measured.toFixed(backlog ? 0 : 2)}${backlog ? " people" : "%"}` : "—"}</p>
    </fieldset>
    <fieldset className="space-y-3 border-t border-eye-gold/40 pt-3"><legend className="text-sm font-bold text-eye-ink">{indicator === "ecsc" || indicator === "erec" ? "Documented 2020 baseline" : "Matched baseline survey"}</legend>
      <CountField label={backlog ? "Verified starting TT surgical backlog" : `Baseline: ${fields.numerator}`} value={baselineNumerator} onChange={setBaselineNumerator} />
      {!backlog && <CountField label={`Baseline: ${fields.denominator}`} value={baselineDenominator} onChange={setBaselineDenominator} />}
    </fieldset>
    <label className="block space-y-1 text-sm font-medium">Survey source / reference<Input aria-label="Survey source / reference" maxLength={300} value={source} onChange={e => setSource(e.target.value)} /></label>
    <label className="block space-y-1 text-sm font-medium">Survey method and eligibility criteria<Textarea aria-label="Survey method and eligibility criteria" maxLength={300} value={methodology} onChange={e => setMethodology(e.target.value)} /></label>
    <label className="flex items-start gap-3 text-sm"><Checkbox aria-label="Confirm representative evidence" checked={representative} onCheckedChange={v => setRepresentative(v === true)} /><span>{backlog ? "These counts refer to the same verified starting backlog cohort." : "This evidence represents the selected State or LGA population, using comparable baseline and current survey methods."}</span></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy} className="bg-eye-teal text-primary-foreground hover:bg-eye-teal/90">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save survey</Button></div>
  </form>;
}
function CountField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-sm font-medium">{label}<Input aria-label={label} type="number" min="0" max="2147483647" step="1" value={value} onChange={e => onChange(e.target.value)} /></label>;
}