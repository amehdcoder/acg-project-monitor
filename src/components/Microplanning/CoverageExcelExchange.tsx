import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { normalizePlace, alignStock, canAlignStock, stockTotal, createCoverageMatcher, coveragePatch, validateCoverageRow, type ExchangeEntry, type ExchangeRow, type MatchResult } from "@/lib/microplanning/coverageExchange";
import type { WorkbookAllocation } from "@/lib/microplanning/coverageWorkbook";
import { cacheGetForUser, cacheSetForUser } from "@/lib/programmeModule/offlineReadCache";

interface ReviewRow { data: ExchangeRow; match: MatchResult; choice: string; saved?: boolean; error?: string; newId: string }
interface Props { entries: ExchangeEntry[]; allocations: WorkbookAllocation[]; projectId?: string | null; projectName?: string | null; target: (e: ExchangeEntry)=>number; onRefresh: ()=>void; readOnly?: boolean }
export default function CoverageExcelExchange({entries,allocations,projectId,projectName,target,onRefresh,readOnly}:Props) {
  const {user}=useAuth();const input=useRef<HTMLInputElement>(null);
  const [rows,setRows]=useState<ReviewRow[]>([]);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [exporting,setExporting]=useState(false);const [page,setPage]=useState(0);const [query,setQuery]=useState("");const [issuesOnly,setIssuesOnly]=useState(false);
  const byId=useMemo(()=>new Map(entries.map(e=>[e.id,e])),[entries]);
  const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{if(!user?.id||!projectId)return;let active=true;void cacheGetForUser<ReviewRow[]>(user.id,`coverage-import:${projectId}`).then(saved=>{if(active){if(saved)setRows(saved);setHydrated(true);}});return()=>{active=false;};},[user?.id,projectId]);
  useEffect(()=>{if(hydrated&&user?.id&&projectId)void cacheSetForUser(user.id,`coverage-import:${projectId}`,rows);},[hydrated,rows,user?.id,projectId]);
  const errorsFor=(r:ReviewRow)=>{
    const errors=validateCoverageRow(r.data);
    const existing=byId.get(r.choice);
    if(!errors.length&&existing){try{coveragePatch(r.data,existing,target(existing));}catch(error){errors.push(error instanceof Error?error.message:String(error));}}
    return errors;
  };
  const alignable=rows.filter(r=>!r.saved&&r.choice!=="skip"&&canAlignStock(r.data));
  const visible=useMemo(()=>rows.map((r,i)=>({r,i})).filter(({r})=>(!issuesOnly||!r.match.id||r.error||errorsFor(r).length)&&`${r.data.community} ${r.data.lga} ${r.data.ward}`.toLowerCase().includes(query.toLowerCase())),[rows,issuesOnly,query]);
  const pending=rows.filter(r=>!r.saved&&r.choice!=="skip");const unresolved=pending.filter(r=>!r.choice||errorsFor(r).length);
  const change=(i:number,patch:Partial<ReviewRow>)=>setRows(prev=>prev.map((r,n)=>n===i?{...r,...patch}:r));
  const download=async()=>{setExporting(true);try{const {exportCoverageWorkbook}=await import("@/lib/microplanning/coverageWorkbook");await exportCoverageWorkbook(entries,allocations,projectName??"Project",target);}catch(e){toast({title:"Export failed",description:String(e),variant:"destructive"});}finally{setExporting(false);}};
  const upload=async(file?:File)=>{if(!file)return;setBusy(true);try{
    const {parseCoverageWorkbook}=await import("@/lib/microplanning/coverageWorkbook");const parsed=await parseCoverageWorkbook(file);const match=createCoverageMatcher(entries);const claimed=new Set<string>();const identities=new Set<string>();const review:ReviewRow[]=[];
    for(let i=0;i<parsed.length;i++){
      const data=parsed[i];const result=match(data);let choice=result.id??"";
      const identity=[data.state,data.lga,data.ward,data.community,data.settlement].map(normalizePlace).join("|");
      if((choice&&claimed.has(choice))||identities.has(identity)){data.errors.push("Duplicate community/settlement in this workbook. Correct the workbook or skip this row.");choice="";}
      if(choice)claimed.add(choice);identities.add(identity);
      review.push({data,match:result,choice,newId:crypto.randomUUID()});
      if(i%100===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!review.length)throw new Error("No completed community rows were found.");setRows(review);setPage(0);setQuery("");setIssuesOnly(false);setOpen(true);
  }catch(e){toast({title:"Import could not be prepared",description:e instanceof Error?e.message:String(e),variant:"destructive"});}finally{setBusy(false);if(input.current)input.current.value="";}};
  const save=async()=>{
    if(!projectId||!user?.id||readOnly||unresolved.length)return;
    const targets=new Set<string>();
    for(const r of pending){const id=r.choice==="new"?r.newId:r.choice;if(targets.has(id)){toast({title:"Duplicate destination",description:"Two uploaded rows point to the same record. Skip one or correct the workbook.",variant:"destructive"});return;}targets.add(id);}
    setBusy(true);let saved=0,queued=0;
    for(let i=0;i<rows.length;i++){
      const r=rows[i];if(r.saved||r.choice==="skip")continue;
      try{
        const existing=r.choice==="new"?undefined:byId.get(r.choice);if(r.choice!=="new"&&!existing)throw new Error("The selected community is no longer accessible.");
        const patch=coveragePatch(r.data,existing,existing?target(existing):undefined);if(!Object.keys(patch).length)throw new Error("No target population, coverage or medicine quantities supplied.");
        const values:Record<string,unknown>={...patch,project_id:projectId,created_by:user.id,updated_by:user.id};
        if(!existing)values.year_of_microplanning=r.data.year??entries[0]?.year_of_microplanning??new Date().getFullYear();
        if(existing)values.created_by=(existing as ExchangeEntry&{created_by?:string}).created_by;
        else Object.assign(values,{id:r.newId,state:r.data.state,lga:r.data.lga,ward:r.data.ward,flhf_name:r.data.flhf||"Unspecified FLHF",community_name:r.data.community,settlement_name:r.data.settlement||null,estimated_total_population:r.data.population??null,population_source:"Coverage Excel import",notes:"Community added after Coverage Excel reconciliation; population and GPS require verification.",status:"draft"});
        const result=await offlineMutate({table:"microplan_entries",action:existing?"update":"insert",id:existing?.id,values,userId:user.id});saved++;if(result.queued)queued++;change(i,{saved:true,error:undefined});
      }catch(e){change(i,{error:e instanceof Error?e.message:String(e)});}
      if(i%20===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    onRefresh();setBusy(false);toast({title:`${saved} community record(s) saved`,description:queued?`${queued} saved on this device, awaiting sync. Failed rows remain available for retry.`:"Coverage and medicine reconciliation refreshed. Failed rows remain available for retry."});
  };
  return <>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={download} disabled={exporting||busy||!projectId}><Download className="mr-2 h-4 w-4"/>{exporting?"Preparing Excel…":"Coverage Excel template"}</Button>
      <Button size="sm" onClick={()=>input.current?.click()} disabled={busy||readOnly||!projectId}><Upload className="mr-2 h-4 w-4"/>{busy?"Processing…":"Import Coverage Excel"}</Button>
      <input ref={input} type="file" accept=".xlsx" className="hidden" aria-label="Import Coverage Excel workbook" onChange={e=>void upload(e.target.files?.[0])}/>
      {rows.length>0&&<Button size="sm" variant="ghost" onClick={()=>setOpen(true)}><FileSpreadsheet className="mr-2 h-4 w-4"/>Import review ({rows.length})</Button>}
    </div>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}>
      <DialogContent className="max-w-6xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary"/>Coverage & medicine import review</DialogTitle></DialogHeader>
        <div className="flex gap-3 flex-wrap text-sm"><Badge variant="secondary">{rows.filter(r=>r.match.id).length} matched</Badge><Badge variant="outline">{unresolved.length} awaiting reconciliation</Badge><Badge>{rows.filter(r=>r.saved).length} saved</Badge></div>
        <p className="text-sm text-muted-foreground">Supplied totals replace saved totals; blanks preserve them. Saved allocations remain unchanged. Aligning changes only received quantities in this review, not reported usage, losses, expiry or returns.</p>
        <div className="flex flex-wrap gap-2"><Input className="max-w-xs" placeholder="Find uploaded community…" aria-label="Find uploaded community" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><Button variant={issuesOnly?"default":"outline"} size="sm" onClick={()=>{setIssuesOnly(!issuesOnly);setPage(0);}}>Reconciliation issues</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>setRows(prev=>prev.map(r=>!r.choice||errorsFor(r).length?{...r,choice:"skip"}:r))}>Skip unresolved rows</Button></div>
        {alignable.length>0&&<div className="flex flex-wrap items-center gap-2 border border-border bg-muted/40 p-3 rounded-md"><AlertTriangle className="h-4 w-4 text-destructive"/><span className="text-sm">{alignable.length} received totals differ from accounted quantities.</span><Button variant="outline" size="sm" disabled={busy||readOnly} onClick={()=>setRows(prev=>prev.map(r=>!r.saved&&r.choice!=="skip"&&canAlignStock(r.data)?{...r,data:alignStock(r.data),error:undefined}:r))}>Align received to total accounted</Button></div>}
        <div className="overflow-auto flex-1 min-h-0 border border-border rounded-md"><table className="w-full text-sm min-w-[850px]"><thead className="sticky top-0 bg-muted"><tr>{["Row / uploaded community","Treatment / households","Medicine accountability","Match","Resolution"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>
          {visible.slice(page*20,page*20+20).map(({r,i})=><tr key={i} className={`border-t border-border ${errorsFor(r).length||r.error||!r.choice?"bg-destructive/10":""}`}>
            <td className="p-3"><strong>{r.data.row} · {r.data.community}</strong><div className="text-xs text-muted-foreground">{r.data.settlement} · {r.data.ward} · {r.data.lga} · {r.data.state}</div>{[...errorsFor(r),r.error].filter(Boolean).map(e=><div key={e} className="text-xs text-destructive mt-1">{e}</div>)}</td>
            <td className="p-3 tabular-nums">Target: {r.data.targetPopulation??"—"}<br/>{r.data.treated??"—"} treated<br/>{r.data.treatedHouseholds??"—"} / {r.data.households??"—"} HHs</td>
            <td className="p-3">{r.data.stock?<div className="space-y-1 tabular-nums"><div>Received: {r.data.stock.received??"—"}</div><div>Used: {r.data.stock.used??"—"} · Lost: {r.data.stock.lost??"—"}</div><div>Expired: {r.data.stock.expired??"—"} · Returned to FLHF: {r.data.stock.returned??"—"}</div><div className="text-muted-foreground">Total accounted: {stockTotal(r.data.stock)??"Incomplete"}</div>{canAlignStock(r.data)&&<Button size="sm" variant="outline" disabled={busy||r.saved||readOnly} aria-label={`Align received for row ${r.data.row}`} onClick={()=>change(i,{data:alignStock(r.data),error:undefined})}>Align received: {r.data.stock.received??"blank"} → {stockTotal(r.data.stock)}</Button>}</div>:<>{r.data.medicineUsed??(r.data.medicines.length?r.data.medicines.reduce((s,m)=>s+m.used,0):"—")}{r.data.medicines.map((m,n)=><div key={n} className="text-xs text-muted-foreground">{m.name}: {m.used} {m.unit} · {m.returned} returned · {m.damaged} damaged</div>)}</>}</td>
            <td className="p-3">{r.saved?<CheckCircle2 className="h-5 w-5 text-primary"/>:<><Badge variant="outline">{r.match.status}</Badge><div className="text-xs mt-1">{Math.round(r.match.score*100)}%</div></>}</td>
            <td className="p-3 min-w-[270px]"><Select value={r.choice||undefined} disabled={busy||r.saved} onValueChange={choice=>change(i,{choice,error:undefined})}><SelectTrigger aria-label={`Resolve row ${r.data.row}`}><SelectValue placeholder="Select reconciliation…"/></SelectTrigger><SelectContent>
              <SelectItem value="skip">Skip this row</SelectItem>{!r.data.entryId&&<SelectItem value="new">Add to microplan as new community</SelectItem>}
              {entries.filter(e=>r.match.candidates.some(candidate=>candidate.id===e.id)||(normalizePlace(e.state)===normalizePlace(r.data.state)&&normalizePlace(e.lga)===normalizePlace(r.data.lga)&&normalizePlace(e.ward)===normalizePlace(r.data.ward))).sort((a,b)=>(r.match.candidates.find(candidate=>candidate.id===b.id)?.score??0)-(r.match.candidates.find(candidate=>candidate.id===a.id)?.score??0)).slice(0,500).map(e=><SelectItem key={e.id} value={e.id}>{e.community_name}{e.settlement_name?` / ${e.settlement_name}`:""} · {e.flhf_name} · {e.ward}, {e.lga}</SelectItem>)}
            </SelectContent></Select>{r.choice==="new"&&<div className="text-xs text-muted-foreground mt-1"><AlertTriangle className="h-3 w-3 inline"/>No allocation or GPS is invented.</div>}</td>
          </tr>)}
        </tbody></table></div>
        <div className="flex items-center justify-between gap-2 flex-wrap"><div className="flex gap-2 items-center"><Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-xs">{page+1} / {Math.max(1,Math.ceil(visible.length/20))}</span><Button variant="outline" size="sm" disabled={(page+1)*20>=visible.length} onClick={()=>setPage(page+1)}>Next</Button></div><Button onClick={()=>void save()} disabled={busy||readOnly||!pending.length||unresolved.length>0}>{busy?"Saving…":`Save ${pending.length} reviewed rows`}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}