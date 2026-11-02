import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Download, Upload, RefreshCw, CheckCircle2, TrendingUp, Minus, Users } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aggregate, pct, vaTotal, type EyeReportRow } from "@/lib/eyeReport/definition";
import { MILESTONES, meanMilestones, recoveryStatus, remoteGoodOutcome, type VisualTrajectory, type DhisOutcomeEvidence } from "@/lib/eyeReport/trajectory";
import { importTrajectories, loadTrajectories } from "@/lib/eyeReport/trajectoryStore";
import { savedTrajectories } from "@/lib/eyeReport/trajectoryStore";
import { supabase } from "@/integrations/supabase/client";
const colors = ["hsl(var(--eye-blue))","hsl(var(--eye-teal))","hsl(var(--eye-orange))","hsl(var(--eye-violet))","hsl(var(--eye-rose))","hsl(var(--eye-deep))"];
const statusTone = { "Full Recovery":"bg-eye-mint text-eye-teal", "Partial Improvement":"bg-eye-gold/20 text-eye-ink", "Unchanged":"bg-muted text-muted-foreground", "Deteriorated":"bg-destructive/10 text-destructive", "Awaiting follow-up":"bg-eye-sky text-eye-blue" };
interface Props {projectId:string;userId:string;canReport:boolean;reports:EyeReportRow[];period:{year:string;month:string;from:string;to:string};dhis:DhisOutcomeEvidence|null}
export default function VisualAcuityTrajectory({projectId,userId,canReport,reports,period,dhis}:Props) {
  const [rows,setRows]=useState<VisualTrajectory[]>([]),[unavailable,setUnavailable]=useState(false),[busy,setBusy]=useState(false);
  const [lga,setLga]=useState("all"),[facility,setFacility]=useState("all"),[compare,setCompare]=useState<"cohort"|"facility"|"lga"|"episode">("cohort"),[episode,setEpisode]=useState("");
  const file=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>{setBusy(true);try {const r=await loadTrajectories(projectId);setRows(r.rows);setUnavailable(r.unavailable);} finally {setBusy(false);} },[projectId]);
  useEffect(()=>{
    let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
    void savedTrajectories(projectId,userId).then(saved=>{if(active&&saved){setRows(saved);setUnavailable(false);}if(active)void load();});
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(active)void load();},350);};
    const channel=supabase.channel(`eye-trajectory:${projectId}:${crypto.randomUUID()}`).on("postgres_changes",{event:"*",schema:"public",table:"eye_visual_trajectories",filter:`project_id=eq.${projectId}`},refresh).subscribe();
    window.addEventListener("online",refresh);window.addEventListener("eye-tracker-synced",refresh);
    return()=>{active=false;clearTimeout(timer);void supabase.removeChannel(channel);window.removeEventListener("online",refresh);window.removeEventListener("eye-tracker-synced",refresh);};
  },[load,projectId,userId]);
  const periodMatch=(date:string)=>(period.year==="all"||date.startsWith(period.year))&&(period.month==="all"||Number(date.slice(5,7))===Number(period.month))&&(!period.from||date>=period.from)&&(!period.to||date<=period.to);
  const eligible=rows.filter((r)=>periodMatch(r.surgery_date));
  const lgas=[...new Set(eligible.map((r)=>r.lga))].sort();
  const facilities=[...new Set(eligible.filter((r)=>lga==="all"||r.lga===lga).map((r)=>r.facility_name))].sort();
  const filtered=eligible.filter((r)=>(lga==="all"||r.lga===lga)&&(facility==="all"||r.facility_name===facility));
  const assessed=filtered.filter((r)=>recoveryStatus(r)!=="Awaiting follow-up");
  const count=(status:string)=>filtered.filter((r)=>recoveryStatus(r)===status).length;
  const groups=useMemo(()=>{
    if(compare==="cohort")return [{key:"cohort",label:"Cohort mean",rows:filtered}];
    if(compare==="episode")return filtered.filter((r)=>r.id===(episode||filtered[0]?.id)).map((r)=>({key:r.id,label:r.episode_key,rows:[r]}));
    const m=new Map<string,VisualTrajectory[]>();for(const r of filtered){const k=compare==="lga"?r.lga:r.facility_name;m.set(k,[...(m.get(k)??[]),r]);}
    return [...m].sort((a,b)=>b[1].length-a[1].length).slice(0,6).map(([label,rows],i)=>({key:`g${i}`,label,rows}));
  },[filtered,compare,episode]);
  const chart=MILESTONES.map((m,i)=>{const item:Record<string,string|number|null>={milestone:m.label};for(const g of groups){const p=meanMilestones(g.rows)[i];item[g.key]=p.value;item[`${g.key}_n`]=p.n;}return item;});
  const scopedReports=reports.filter((r)=>(lga==="all"||r.lga===lga)&&(facility==="all"||r.facility_name===facility));
  const csom=aggregate(scopedReports).csom,den=vaTotal(csom.discharge.presenting);
  const remote=remoteGoodOutcome(dhis);
  const importFile=async(selected:File|undefined)=>{
    if(!selected)return;setBusy(true);
    try{const XLSX=await import("xlsx");const workbook=XLSX.read(await selected.arrayBuffer(),{type:"array"});const sheet=workbook.Sheets[workbook.SheetNames[0]];if(!sheet)throw new Error("No worksheet found.");const data=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:"",raw:false});const result=await importTrajectories(projectId,userId,data,rows);toast.success(result.queued?"Tracker episodes saved offline — awaiting sync":"Tracker episodes imported");await load();}catch(e){toast.error(e instanceof Error?e.message:"Import failed");}finally{setBusy(false);if(file.current)file.current.value="";}
  };
  const template=()=>{const blob=new Blob(["episode_key,facility_name,lga,surgery_date,baseline,day30,day90,day180\n"],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="visual-acuity-tracker-template.csv";a.click();URL.revokeObjectURL(url);};
  return <section className="space-y-4 border-y border-eye-blue/20 bg-card p-4 sm:p-5" aria-label="Visual Acuity Trajectory">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-eye-teal">Longitudinal surgical outcomes</p><h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-eye-deep"><Activity className="h-5 w-5" />Visual Acuity Trajectory</h2><p className="mt-1 text-xs text-muted-foreground">Measured logMAR · lower is better · surgical episodes, not unique people</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" aria-label="Refresh visual acuity" disabled={busy} onClick={()=>void load()}><RefreshCw className={`h-4 w-4 ${busy?"animate-spin":""}`} /></Button>{canReport&&<><Button variant="outline" onClick={template}><Download className="mr-2 h-4 w-4" />Template</Button><Button disabled={busy} onClick={()=>file.current?.click()}><Upload className="mr-2 h-4 w-4" />Import tracker data</Button><input ref={file} hidden type="file" accept=".csv,.xlsx" onChange={(e)=>void importFile(e.target.files?.[0])} /></>}</div></div>
    {unavailable&&<p role="alert" className="text-sm text-destructive">Individual tracker observations could not be loaded; recovery totals are unavailable, not zero.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      {label:"Assessed episodes",value:assessed.length,icon:Users,tone:"text-eye-blue"},
      {label:"Full Recovery",value:count("Full Recovery"),icon:CheckCircle2,tone:"text-eye-teal"},
      {label:"Partial Improvement",value:count("Partial Improvement"),icon:TrendingUp,tone:"text-eye-orange"},
      {label:"Unchanged",value:count("Unchanged"),icon:Minus,tone:"text-muted-foreground"},
    ].map((s)=><div key={s.label} className="rounded-lg border bg-background p-3"><s.icon className={`h-5 w-5 ${s.tone}`} /><p className="mt-2 text-2xl font-bold">{unavailable?"—":s.value}</p><p className="text-xs font-semibold">{s.label}</p></div>)}</div>
    <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-md px-2 py-1 ${statusTone['Full Recovery']}`}>Full Recovery {unavailable?"—":`${pct(count('Full Recovery'),assessed.length)}%`}</span><span className={`rounded-md px-2 py-1 ${statusTone['Deteriorated']}`}>Deteriorated {unavailable?"—":count('Deteriorated')}</span><span className={`rounded-md px-2 py-1 ${statusTone['Awaiting follow-up']}`}>Awaiting follow-up {unavailable?"—":count('Awaiting follow-up')}</span></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <select aria-label="Trajectory LGA" className="h-12 rounded-md border bg-background px-3 text-sm" value={lga} onChange={(e)=>{setLga(e.target.value);setFacility('all');}}><option value="all">All LGAs</option>{lgas.map((l)=><option key={l}>{l}</option>)}</select>
      <select aria-label="Trajectory facility" className="h-12 rounded-md border bg-background px-3 text-sm" value={facility} onChange={(e)=>setFacility(e.target.value)}><option value="all">All facilities</option>{facilities.map((f)=><option key={f}>{f}</option>)}</select>
      <select aria-label="Trajectory comparison" className="h-12 rounded-md border bg-background px-3 text-sm" value={compare} onChange={(e)=>setCompare(e.target.value as typeof compare)}><option value="cohort">Cohort mean</option><option value="facility">Compare facilities</option><option value="lga">Compare LGAs</option><option value="episode">Individual episode</option></select>
      {compare==='episode'&&<select aria-label="Surgical episode" className="h-12 rounded-md border bg-background px-3 text-sm" value={episode||filtered[0]?.id||''} onChange={(e)=>setEpisode(e.target.value)}>{filtered.map((r)=><option key={r.id} value={r.id}>{r.episode_key}</option>)}</select>}
    </div>
    <div className="h-80 w-full" aria-label="Baseline to 180-day visual acuity line chart"><ResponsiveContainer><LineChart data={chart} margin={{top:15,right:15,bottom:15,left:5}}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="milestone" fontSize={12} /><YAxis reversed domain={[-0.3,3]} fontSize={11} label={{value:'logMAR',angle:-90,position:'insideLeft'}} /><Tooltip formatter={(value:number,name:string,entry:any)=>[`${Number(value).toFixed(2)} logMAR · n=${entry.payload[`${entry.dataKey}_n`]}`,name]} /><Legend /><ReferenceLine y={0.3} stroke="hsl(var(--eye-teal))" strokeDasharray="5 5" />{groups.map((g,i)=><Line key={g.key} name={g.label} dataKey={g.key} stroke={colors[i%colors.length]} strokeWidth={3} dot={{r:4}} activeDot={{r:6}} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div>
    {!filtered.length&&<p className="text-center text-sm text-muted-foreground">No measured patient acuity episodes for this period. Baseline and postoperative milestones remain empty.</p>}
    <p className="text-xs text-muted-foreground">Full Recovery: latest measured acuity ≤0.3 logMAR (about 6/12). Partial Improvement: ≥0.2 logMAR better than baseline but above 0.3. Unchanged: change &lt;0.2. Deteriorated: ≥0.2 worse. Descriptive categories, not clinical certification. Missing milestones are not interpolated; hover for each sample size. Date filters use surgery date. Comparisons show up to six largest cohorts.</p>
    <div className="grid gap-4 border-t pt-4 sm:grid-cols-3"><div><p className="text-xs font-semibold text-eye-blue">Individual tracker · latest good vision</p><p className="mt-1 text-xl font-bold">{unavailable?'—':`${pct(count('Full Recovery'),assessed.length)}%`}</p><p className="text-xs text-muted-foreground">{assessed.length} measured surgical episodes</p></div><div><p className="text-xs font-semibold text-eye-teal">Facility CSOM · good discharge</p><p className="mt-1 text-xl font-bold">{den?`${pct(csom.discharge.presenting.good,den)}%`:'Not assessed'}</p><p className="text-xs text-muted-foreground">{den} assessed eyes · selected report period</p></div><div><p className="text-xs font-semibold text-eye-orange">DHIS2 aggregate · good discharge</p><p className="mt-1 text-xl font-bold">{remote?`${remote.rate.toFixed(1)}%`:'Not pulled'}</p><p className="text-xs text-muted-foreground">{dhis?`${dhis.month} · connected organisation unit`:'Pull & compare in DHIS2 Data Exchange'} · not a matched patient cohort</p></div></div>
    <div className="max-h-60 overflow-auto"><table className="w-full min-w-[580px] text-sm"><thead className="bg-eye-sky text-left text-xs text-eye-deep"><tr><th className="p-2">Episode</th><th className="p-2">Facility / LGA</th><th className="p-2">Surgery</th><th className="p-2">Recovery status</th></tr></thead><tbody>{filtered.map((r)=><tr key={r.id} className="border-t"><td className="p-2 font-mono text-xs">{r.episode_key}</td><td className="p-2">{r.facility_name}<span className="block text-xs text-muted-foreground">{r.lga}</span></td><td className="p-2">{r.surgery_date}</td><td className="p-2"><span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${statusTone[recoveryStatus(r)]}`}>{recoveryStatus(r)}</span></td></tr>)}</tbody></table></div>
    {canReport&&<p className="text-xs text-muted-foreground">Tracker import: pseudonymous per-eye episode key, facility, LGA, surgery date and measured logMAR baseline/30/90/180 values. Leave unmeasured milestones blank. Imports update your matching episodes; identifiers must not contain patient names.</p>}
  </section>;
}