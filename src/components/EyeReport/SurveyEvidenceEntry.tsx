import { useState } from "react";
import { CalendarIcon, Download, Plus } from "lucide-react";
import { format, isValid, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MILESTONES, parseMilestones, type MilestoneObservation } from "@/lib/eyeReport/milestones";
import { surveyGeography, type SurveyGeography, prepareSurveyWorkbook, downloadSurveyWorkbook } from "@/lib/eyeReport/milestoneWorkbook";

function SurveyDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = parse(value, "yyyy-MM-dd", new Date());
  return <label className="block space-y-1 text-sm font-medium">{label}<div className="flex gap-1">
    <Input aria-label={label} value={value} placeholder="YYYY-MM-DD" onChange={e => onChange(e.target.value)} />
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label={`Choose ${label.toLowerCase()}`}><CalendarIcon className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end"><Calendar className="pointer-events-auto p-3" classNames={{ caption_label: "hidden", caption_dropdowns: "flex items-center justify-center gap-2 px-8", dropdown_month: "text-sm", dropdown_year: "text-sm", dropdown: "h-8 rounded border border-input bg-background px-1 text-foreground", vhidden: "sr-only" }} mode="single" selected={isValid(selected) ? selected : undefined} defaultMonth={isValid(selected) ? selected : undefined} captionLayout="dropdown-buttons" fromYear={1900} toYear={new Date().getFullYear()} disabled={{ after: new Date() }} onSelect={d => { if (d) onChange(format(d, "yyyy-MM-dd")); setOpen(false); }} initialFocus /></PopoverContent>
    </Popover>
  </div></label>;
}

export default function SurveyEvidenceEntry({ geography, initialState, onApply }: { geography: SurveyGeography[]; initialState: string; onApply: (rows: MilestoneObservation[]) => void }) {
  const places = surveyGeography(geography);
  const [state, setState] = useState(initialState);
  const [lga, setLga] = useState("State");
  const [indicator, setIndicator] = useState("ecsc");
  const [date, setDate] = useState("");
  const [baselineDate, setBaselineDate] = useState("");
  const [value, setValue] = useState("");
  const [baseline, setBaseline] = useState("");
  const [source, setSource] = useState("");
  const [entries, setEntries] = useState<MilestoneObservation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = places.find(p => p.state === state);
  const add = () => {
    try {
      if (!current || (lga !== "State" && !current.lgas.includes(lga))) throw new Error("Choose a State and LGA from received submissions.");
      if (!value.trim() || !baseline.trim()) throw new Error("Enter measured value and baseline.");
      setEntries(parseMilestones([...entries, { indicator, state, lga, date, value: Number(value), baseline: Number(baseline), baseline_date: baselineDate, source }]));
      setError(""); setDate(""); setValue("");
    } catch (e) { setError(e instanceof Error ? e.message : "Check the observation."); }
  };
  return <Dialog><DialogTrigger asChild><Button variant="outline"><CalendarIcon className="mr-2 h-4 w-4" />Fill survey evidence</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="text-eye-deep">State survey evidence</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">State<Select value={current ? state : ""} onValueChange={v => { setState(v); setLga("State"); }}><SelectTrigger aria-label="Survey State"><SelectValue placeholder="Select State" /></SelectTrigger><SelectContent>{places.map(p => <SelectItem key={p.state} value={p.state}>{p.state}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-sm font-medium">LGA<Select value={lga} onValueChange={setLga} disabled={!current}><SelectTrigger aria-label="Survey LGA"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="State">State estimate</SelectItem>{current?.lgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">Indicator<Select value={indicator} onValueChange={setIndicator}><SelectTrigger aria-label="Survey indicator"><SelectValue /></SelectTrigger><SelectContent>{MILESTONES.map(m => <SelectItem key={m.key} value={m.key}>{m.title}</SelectItem>)}</SelectContent></Select></label>
        <SurveyDate label="Survey Date" value={date} onChange={setDate} /><SurveyDate label="Baseline Date" value={baselineDate} onChange={setBaselineDate} />
        <label className="space-y-1 text-sm font-medium">Value<Input aria-label="Survey Value" type="number" min="0" step="any" value={value} onChange={e => setValue(e.target.value)} /></label>
        <label className="space-y-1 text-sm font-medium">Baseline<Input aria-label="Survey Baseline" type="number" min="0" step="any" value={baseline} onChange={e => setBaseline(e.target.value)} /></label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">Source<Input aria-label="Survey Source" value={source} onChange={e => setSource(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />Add observation</Button><span role="status" className="self-center text-sm text-eye-teal">{entries.length} observations ready</span></div>
      <div className="flex flex-wrap gap-2 border-t pt-3"><Button disabled={!entries.length} onClick={() => onApply(entries)}>Apply to scorecard</Button><Button variant="outline" disabled={!entries.length || busy} onClick={async () => { setBusy(true); try { const blob = await prepareSurveyWorkbook(state, geography, entries); downloadSurveyWorkbook(blob, state); } catch { setError("Could not download evidence. Please retry."); } finally { setBusy(false); } }}><Download className="mr-2 h-4 w-4" />Download filled Excel</Button></div>
    </DialogContent>
  </Dialog>;
}