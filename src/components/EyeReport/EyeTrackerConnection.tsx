import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Download, Save, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { eyeTrackerMetadata, eyeTrackerPull, eyeGpsPush, listMappings, saveMapping } from "@/lib/programmeModule/healthExchange";
import { validateGpsConfig, validateTrackerConfig } from "../../../supabase/functions/_shared/eyeTracker";
import type { EyeReportRow } from "@/lib/eyeReport/definition";

type Program = { id: string; displayName: string; programType: string; programStages: { id:string;displayName:string;featureType:string;programStageDataElements:{dataElement:{id:string;displayName:string;valueType:string}}[] }[] };
const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm" />;
export default function EyeTrackerConnection({ connectionId, month, rows }: { connectionId:string;month:string;rows:EyeReportRow[] }) {
  const [programs,setPrograms]=useState<Program[]>([]),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [tracker,setTracker]=useState<Record<string,string>>({program:"",surgeryDate:"",eye:"",baseline:"",day30:"",day90:"",day180:""});
  const [gps,setGps]=useState<Record<string,string>>({program:"",stage:"",reportId:"",accuracy:"",capturedAt:""});
  const [facilities,setFacilities]=useState<{name:string;unit:string;lga:string}[]>([]);
  const [sendGps,setSendGps]=useState(false);
  useEffect(()=>{let live=true;setLoaded(false);setPrograms([]);setSendGps(false);void listMappings(connectionId).then((maps)=>{
    if(!live)return;
    const t=maps.find((m)=>m.indicator_key==="eye_config:tracker")?.dimensions as any;
    const g=maps.find((m)=>m.indicator_key==="eye_config:gps")?.dimensions as any;
    setTracker(t?.config??{program:"",surgeryDate:"",eye:"",baseline:"",day30:"",day90:"",day180:""});
    setGps(g?.config?Object.fromEntries(Object.entries(g.config).filter(([k])=>k!=="facilities")) as Record<string,string>:{program:"",stage:"",reportId:"",accuracy:"",capturedAt:""});
    const names=[...new Set([...rows.map((r)=>r.facility_name),...Object.keys(g?.config?.facilities??{})])];
    setFacilities(names.map((name)=>{const unit=g?.config?.facilities?.[name]??"";return {name,unit,lga:t?.lgas?.[unit]??rows.find((r)=>r.facility_name===name)?.lga??""};}));
  }).catch((e)=>toast.error(e.message));return()=>{live=false;};},[connectionId]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e){toast.error(e instanceof Error?e.message:"Exchange failed");}finally{setBusy(false);}};
  const load=()=>run(async()=>{const r=await eyeTrackerMetadata(connectionId);setPrograms(r.programs);setLoaded(true);});
  const fields=(program:string)=>[...new Map((programs.find((p)=>p.id===program)?.programStages??[]).flatMap((s)=>s.programStageDataElements.map((d)=>[d.dataElement.id,d.dataElement] as const))).values()];
  const save=async()=>{
    const config=validateTrackerConfig(tracker);
    const lgas=Object.fromEntries(facilities.filter((f)=>f.unit&&f.lga).map((f)=>[f.unit,f.lga]));
    if(!Object.keys(lgas).length)throw new Error("Map at least one facility unit and its LGA.");
    await saveMapping({connection_id:connectionId,indicator_key:"eye_config:tracker",remote_id:config.program,dimensions:{config,lgas} as any});
    if(sendGps){const config=validateGpsConfig({...gps,facilities:Object.fromEntries(facilities.filter((f)=>f.unit).map((f)=>[f.name,f.unit]))});await saveMapping({connection_id:connectionId,indicator_key:"eye_config:gps",remote_id:config.program,dimensions:{config} as any});}
    toast.success("Tracker and location mappings saved");
  };
  return <div className="space-y-4 border-y p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-eye-deep">Measured patient tracker &amp; reporting GPS</h3><Button variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4" />Load DHIS2 programs</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold">Patient acuity program<Select aria-label="Patient acuity program" value={tracker.program} onChange={(e)=>setTracker({...tracker,program:e.target.value})}><option value="">Choose program</option>{programs.map((p)=><option key={p.id} value={p.id}>{p.displayName}</option>)}</Select></label>
      {([['surgeryDate','Surgery date'],['eye','Operated eye (R/L)'],['baseline','Baseline logMAR'],['day30','30-day logMAR'],['day90','90-day logMAR'],['day180','180-day logMAR']] as const).map(([key,label])=><label key={key} className="text-xs font-semibold">{label}<Select aria-label={label} value={tracker[key]} onChange={(e)=>setTracker({...tracker,[key]:e.target.value})}><option value="">Choose measured field</option>{fields(tracker.program).map((f)=><option key={f.id} value={f.id}>{f.displayName}</option>)}</Select></label>)}
    </div>
    <div className="space-y-2"><h4 className="text-sm font-semibold">Facility links &amp; LGA attribution</h4>{facilities.map((f,i)=><div key={i} className="grid gap-2 sm:grid-cols-3"><Input aria-label={`Facility name ${i+1}`} placeholder="Facility name" value={f.name} onChange={(e)=>setFacilities((list)=>list.map((v,j)=>j===i?{...v,name:e.target.value}:v))} /><Input aria-label={`DHIS2 facility unit ${i+1}`} placeholder="DHIS2 facility unit ID" value={f.unit} onChange={(e)=>setFacilities((list)=>list.map((v,j)=>j===i?{...v,unit:e.target.value}:v))} /><Input aria-label={`Tracker LGA ${i+1}`} placeholder="LGA" value={f.lga} onChange={(e)=>setFacilities((list)=>list.map((v,j)=>j===i?{...v,lga:e.target.value}:v))} /></div>)}<Button variant="outline" size="sm" onClick={()=>setFacilities([...facilities,{name:"",unit:"",lga:""}])}>Add facility link</Button></div>
    <label className="flex items-center gap-3 text-sm font-semibold"><Switch aria-label="Enable reporting GPS exchange" checked={sendGps} onCheckedChange={setSendGps} />Send report-capture GPS to a dedicated DHIS2 event program</label>
    {sendGps&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-xs font-semibold">GPS event program<Select aria-label="GPS event program" value={gps.program} onChange={(e)=>setGps({...gps,program:e.target.value,stage:""})}><option value="">Choose point event program</option>{programs.filter((p)=>p.programType==="WITHOUT_REGISTRATION").map((p)=><option key={p.id} value={p.id}>{p.displayName}</option>)}</Select></label><label className="text-xs font-semibold">GPS stage<Select value={gps.stage} onChange={(e)=>setGps({...gps,stage:e.target.value})}><option value="">Choose stage</option>{programs.find((p)=>p.id===gps.program)?.programStages.filter((s)=>s.featureType==="POINT").map((s)=><option key={s.id} value={s.id}>{s.displayName}</option>)}</Select></label>{([['reportId','Report reference'],['accuracy','GPS accuracy (metres)'],['capturedAt','GPS fix time']] as const).map(([key,label])=><label key={key} className="text-xs font-semibold">{label}<Select value={gps[key]} onChange={(e)=>setGps({...gps,[key]:e.target.value})}><option value="">Choose field</option>{fields(gps.program).map((f)=><option key={f.id} value={f.id}>{f.displayName}</option>)}</Select></label>)}</div>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!loaded} onClick={()=>void run(save)}><Save className="mr-2 h-4 w-4" />Save mappings</Button><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{const r=await eyeTrackerPull(connectionId,true);toast.success(`${r.episodes} measured episodes ready; ${r.skipped} excluded`);})}>Preview tracker</Button><Button disabled={busy} onClick={()=>void run(async()=>{const r=await eyeTrackerPull(connectionId);window.dispatchEvent(new CustomEvent("eye-tracker-synced"));toast.success(`${r.episodes} measured episodes synced; ${r.skipped} excluded`);})}><Download className="mr-2 h-4 w-4" />Sync patient tracker</Button>{sendGps&&<><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{const r=await eyeGpsPush(connectionId,month.replace('-',''),true);toast.success(r.message);})}>Validate GPS</Button><Button disabled={busy} onClick={()=>void run(async()=>{const r=await eyeGpsPush(connectionId,month.replace('-',''));toast.success(r.message);})}><MapPin className="mr-2 h-4 w-4" />Send GPS locations</Button></>}</div>
    <p className="text-xs text-muted-foreground">Only measured logMAR fields feed recovery paths. Unmeasured visits stay empty. Reporting GPS is linked to facility units as dated events; it never overwrites verified facility premises.</p>
  </div>;
}