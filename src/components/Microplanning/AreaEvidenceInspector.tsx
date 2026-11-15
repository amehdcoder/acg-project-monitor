import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapPinned, Download, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getGrid3FullStateEntries } from '@/lib/grid3NigeriaData';
import { areaRows, areaScope, evidenceVerdict, nearbyAreaRows, parseLandEvidence, type AreaEntry, type AreaRow, type LandEvidence } from '@/lib/microplanning/areaEvidence';
import { AREA_INSPECT_EVENT } from '@/lib/microplanning/areaMapInteraction';
import { buildAreaWorkbook } from '@/lib/microplanning/areaWorkbook';
import type { Boundary } from '@/lib/microplanning/osiris';

export default function AreaEvidenceInspector({entries,scopeKey}:{entries:AreaEntry[];scopeKey:string}) {
  const [point,setPoint]=useState<{lat:number;lng:number}|null>(null),[boundaries,setBoundaries]=useState<Boundary[]>([]);
  const [rows,setRows]=useState<AreaRow[]>([]),[features,setFeatures]=useState<LandEvidence[]>([]),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [file,setFile]=useState<Blob|null>(null),[mapNode,setMapNode]=useState<HTMLDivElement|null>(null);
  useEffect(()=>{const abort=new AbortController();fetch('/nigeria-lga.geojson',{signal:abort.signal}).then(r=>r.json()).then(d=>setBoundaries(d.features)).catch(()=>{});return()=>abort.abort();},[]);
  useEffect(()=>{setPoint(null);setRows([]);setFeatures([]);setFile(null);},[scopeKey]);
  useEffect(()=>{const listener=(event:Event)=>{const p=(event as CustomEvent<{lat:number;lng:number}>).detail;if(Number.isFinite(p.lat)&&Number.isFinite(p.lng))setPoint(p);};window.addEventListener(AREA_INSPECT_EVENT,listener);return()=>window.removeEventListener(AREA_INSPECT_EVENT,listener);},[]);
  const scope=useMemo(()=>point?areaScope(point.lat,point.lng,entries,boundaries):undefined,[point,entries,boundaries]);
  useEffect(()=>{
    if(!point||!scope){setRows([]);setFeatures([]);setFile(null);return;}
    const abort=new AbortController();let live=true;setBusy(true);setFile(null);setRows([]);setFeatures([]);setStatus('Loading reference evidence…');
    const work=async()=>{
      let refs:Awaited<ReturnType<typeof getGrid3FullStateEntries>>=[];let evidence:LandEvidence[]=[];let lookup='';
      try {refs=await getGrid3FullStateEntries('set',scope.properties.state);}catch{lookup='GRID3 unavailable; project records retained. ';}
      // Never broaden reference evidence beyond the wards visible to this viewer.
      const wards=new Set(entries.filter(e=>e.state===scope.properties.state&&e.lga===scope.properties.lga).map(e=>String(e.ward).trim().toLowerCase()));
      const list=areaRows(entries,refs.filter(r=>wards.has(r.ward.trim().toLowerCase())),scope.properties.state,scope.properties.lga||'');
      if(live)setRows(list);
      if(navigator.onLine) {
        try {
          const query=`[out:json][timeout:20];(nwr(around:2000,${point.lat},${point.lng})[place];way(around:2000,${point.lat},${point.lng})[building];nwr(around:2000,${point.lat},${point.lng})[natural];nwr(around:2000,${point.lat},${point.lng})[landuse];way(around:2000,${point.lat},${point.lng})[waterway];);out center 300;`;
          const timer=setTimeout(()=>abort.abort(),25000);
          try {const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal:abort.signal});if(!response.ok)throw Error(`Public lookup unavailable (${response.status})`);const result=await response.json();if(result.remark)throw Error('Public lookup incomplete');evidence=parseLandEvidence(result);lookup+='OpenStreetMap returned up to 300 nearby features; incomplete coverage.';}finally{clearTimeout(timer);}
        }catch{lookup+='Public land-feature lookup unavailable; not evidence of an empty area.';}
      }else lookup+='Offline: public imagery and land-feature lookup need connectivity.';
      if(!live)return;setFeatures(evidence);setStatus(lookup);
      const nearby=nearbyAreaRows(list,point.lat,point.lng);
      const bytes=await buildAreaWorkbook(scope.properties.state,scope.properties.lga||'',point.lat,point.lng,list,evidence,evidenceVerdict(nearby,evidence),lookup).xlsx.writeBuffer();
      if(live)setFile(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    };work().catch(()=>{if(live)setStatus('Evidence export could not be prepared. Retry; saved project records are unchanged.');}).finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;abort.abort();};
  },[point,scope,entries,revision]);
  const nearby=useMemo(()=>point?nearbyAreaRows(rows,point.lat,point.lng):[],[rows,point]);
  useEffect(()=>{
    if(!mapNode||!point||!scope)return;
    const m=L.map(mapNode,{maxZoom:21}).setView([point.lat,point.lng],17);
    const imagery=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:21,attribution:'© Esri, Vantor, Earthstar Geographics, GIS User Community'}).addTo(m);
    const labels=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:21,attribution:'© Esri reference labels'});
    L.control.layers({'Satellite imagery':imagery},{'Hybrid place labels':labels}).addTo(m);L.control.scale().addTo(m);
    L.circle([point.lat,point.lng],{radius:2000,fill:false}).addTo(m);L.circleMarker([point.lat,point.lng],{radius:6}).addTo(m);
    const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(mapNode);return()=>{observer.disconnect();m.remove();};
  },[mapNode,point,scope]);
  const download=()=>{if(!file)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`${scope?.properties.state}-${scope?.properties.lga}-area-evidence.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  return <Dialog open={Boolean(point)} onOpenChange={open=>{if(!open)setPoint(null);}}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary"/>Area evidence · {scope?.properties.lga||'Outside visible LGA scope'}</DialogTitle></DialogHeader>
    {!scope?<p className="text-sm text-muted-foreground">No permitted LGA with project map data contains this point. No area data is exported.</p>:<>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{scope.properties.state} · {scope.properties.lga}</Badge><span className="text-xs tabular-nums">{point?.lat.toFixed(6)}, {point?.lng.toFixed(6)}</span><Button variant="outline" size="icon" aria-label="Refresh area evidence" disabled={busy} onClick={()=>setRevision(r=>r+1)}><RefreshCw className="h-4 w-4"/></Button><Button className="ml-auto" disabled={!file||busy} onClick={download}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Download className="mr-2 h-4 w-4"/>}Download LGA evidence</Button></div>
      <p className="border-l-4 border-primary bg-muted p-3 text-sm font-semibold">{evidenceVerdict(nearby,features)}</p>
      <div ref={setMapNode} className="h-80 w-full overflow-hidden rounded-md border" aria-label="Area satellite inspection"/>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
      <p className="text-xs text-muted-foreground">Nearby evidence: 2 km radius. Workbook: all reference settlements and visible submissions in this LGA’s permitted wards. Unknown population stays blank. Land cover and roofs do not prove habitation; imagery dates and native detail vary.</p>
      <div className="max-h-52 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Nearby settlement</th><th>Distance</th><th>Population</th><th>Source</th></tr></thead><tbody>{nearby.slice(0,30).map((r,i)=><tr key={i} className="border-b"><td className="p-2">{r.name} · {r.ward}</td><td>{r.distance.toFixed(2)} km</td><td>{r.population?.toLocaleString()??'Unknown'}</td><td>{r.populationSource}</td></tr>)}</tbody></table>{!nearby.length&&<p className="p-2 text-sm text-muted-foreground">No reference settlement or recorded GPS within 2 km. Habitation remains unknown.</p>}</div>
      {features.length>0&&<div className="max-h-40 overflow-auto text-xs">{features.slice(0,30).map((e,i)=><p key={i} className="border-b py-2"><a className="text-primary underline" href={e.source} target="_blank" rel="noopener noreferrer">{e.name}</a> · {e.feature}</p>)}</div>}
    </>}
  </DialogContent></Dialog>;
}