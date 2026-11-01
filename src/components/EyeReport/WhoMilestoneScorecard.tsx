import { useMemo, useRef, useState } from "react";
import { CalendarClock, Download, Globe2, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MILESTONES, milestoneProgress, parseMilestones, type MilestoneObservation } from "@/lib/eyeReport/milestones";
import { aggregate, t, type EyeReportRow } from "@/lib/eyeReport/definition";

export default function WhoMilestoneScorecard({ rows, unavailable }: { rows: EyeReportRow[]; unavailable: boolean }) {
  const [evidence, setEvidence] = useState<MilestoneObservation[]>([]);
  const [state, setState] = useState("Jigawa");
  const [lga, setLga] = useState("State");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const states = [...new Set(["Jigawa", ...evidence.map((o)=>o.state), ...rows.map((o)=>o.state).filter((s):s is string=>!!s)])].sort();
  const lgas = [...new Set(evidence.filter((o)=>o.state===state).map((o)=>o.lga).filter((l)=>l!=="State"))].sort();
  const scoped = evidence.filter((o)=>o.state===state && o.lga===lga);
  const output = useMemo(()=>aggregate(rows.filter((o)=>o.state===state && (lga==="State" || o.lga===lga))),[rows,state,lga]);
  const template = () => {
    const blob = new Blob([JSON.stringify({ instructions: "Import the observations array only. Use documented population surveys; lga 'State' only for representative State estimates. No sample values supplied. Coverage baseline_date must be in 2020. Backlog is remaining verified people, not screening visits.", fields: ["indicator (ecsc, erec, tt, tf, backlog)","state","lga","date (YYYY-MM-DD)","value (percentage, or remaining people for backlog)","baseline","baseline_date","source"], observations: [] },null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="who-milestone-survey-template.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="border-y border-eye-teal/25 bg-card py-5" aria-label="WHO 2030 Roadmap Milestone Scorecard">
    <div className="flex flex-wrap items-start justify-between gap-3 px-4">
      <div><p className="flex items-center gap-2 text-xs font-bold uppercase text-eye-teal"><Globe2 className="h-4 w-4"/>2030 · Global commitments</p><h2 className="mt-1 text-xl font-bold text-eye-deep">WHO 2030 Roadmap Milestone Scorecard</h2><p className="mt-1 text-xs text-muted-foreground">{state} · {lga === "State" ? "State-representative evidence" : `${lga} LGA`} · Population survey evidence</p></div>
      <div className="flex max-w-full flex-wrap gap-2">
        <select aria-label="Scorecard State" value={state} onChange={(e)=>{setState(e.target.value);setLga("State");}} className="h-10 max-w-full rounded-md border bg-background px-2 text-sm">{states.map((s)=><option key={s}>{s}</option>)}</select>
        <select aria-label="Scorecard LGA" value={lga} onChange={(e)=>setLga(e.target.value)} className="h-10 max-w-full rounded-md border bg-background px-2 text-sm"><option value="State">State estimate</option>{lgas.map((l)=><option key={l}>{l}</option>)}</select>
        <Button variant="outline" size="icon" aria-label="Download survey template" title="Download survey template" onClick={template}><Download className="h-4 w-4"/></Button>
        <Button variant="outline" onClick={()=>file.current?.click()}><Upload className="mr-2 h-4 w-4"/>Import survey evidence</Button>
      </div>
    </div>
    <input ref={file} type="file" accept=".json" className="hidden" aria-label="WHO survey evidence" onChange={async(e)=>{
      const f=e.target.files?.[0]; if(!f)return;
      try { if(f.size>2*1024*1024)throw new Error("Survey file must be smaller than 2 MB."); const raw=JSON.parse(await f.text()); setEvidence(parseMilestones(Array.isArray(raw)?raw:raw.observations)); setError(""); } catch(err){setError(err instanceof Error?err.message:"Could not read survey evidence.");} e.target.value="";
    }}/>
    {error&&<p role="alert" className="px-4 pt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-3">{MILESTONES.map((m)=>{
      const p=milestoneProgress(m.key,scoped);
      const cls=p?.forecast==="On track"||p?.reached?"text-eye-teal bg-eye-mint":"text-eye-ink bg-eye-gold/15";
      return <article key={m.key} className="flex min-w-0 flex-col rounded-lg border border-eye-blue/20 p-4">
        <div className="flex items-start justify-between gap-2"><Target className="h-5 w-5 shrink-0 text-eye-teal"/><span className={`rounded px-2 py-1 text-[11px] font-semibold ${cls}`}>{p?.forecast??"Evidence needed"}</span></div>
        <h3 className="mt-3 text-sm font-bold text-eye-deep">{m.title}</h3><p className="mt-1 min-h-12 text-xs text-muted-foreground">{m.detail}</p>
        <div className="mt-4 flex items-baseline justify-between gap-2"><p className="text-2xl font-bold tabular-nums text-eye-deep">{p?`${p.last.value.toLocaleString()}${m.key==="backlog"?"":"%"}`:"—"}</p><span className="text-xs font-semibold text-eye-teal">{p?`${p.completion.toFixed(1)}% complete`:"Not measurable"}</span></div>
        <Progress aria-label={`${m.title} milestone completion`} value={p?.completion??0} className="mt-2 h-2"/>
        <p className="mt-2 text-xs text-muted-foreground">{p?`Baseline ${p.last.baseline}${m.key==="backlog"?" people":"%"} · ${p.last.baseline_date} · Latest ${p.last.date}`:"Requires a dated survey baseline and matched population denominator; routine counts are not coverage."}</p>
        <div className="mt-3 flex gap-2 border-t pt-3 text-xs"><CalendarClock className="h-4 w-4 shrink-0 text-eye-blue"/><span>{p?.crossing?`Trend-based threshold: ${p.crossing} · ${p.annualChange?.toFixed(2)} ${m.key==="backlog"?"people":"pp"}/year`:p?.reached?"Threshold observed; not elimination certification.":"2030 forecast unavailable: ≥3 recent observations spanning ≥180 days required."}</span></div>
        {p&&<p className="mt-2 break-words text-[11px] text-muted-foreground">Evidence: {p.last.source}</p>}
        <a href={m.source} target="_blank" rel="noreferrer" className="mt-auto pt-3 text-xs font-semibold text-eye-blue underline">WHO target definition ↗</a>
      </article>;
    })}</div>
    <div className="mt-4 border-t px-4 pt-3 text-xs text-muted-foreground"><p className="font-semibold text-eye-deep">Routine service evidence · selected dashboard period</p><p className="mt-1">{unavailable?"Reports unavailable":`${t(output.summary.surgery.cataract)} cataract operations · ${t(output.summary.screen.tt)} TT screening visits · ${output.reports} reports`} — not population coverage or verified backlog clearance.</p><p className="mt-2">Imported surveys remain in this session. Forecasts use a linear recent-survey trend, not a validated elimination model. WHO trachoma validation also requires sustained TF control and a system to identify and manage incident TT cases.</p></div>
  </section>;
}