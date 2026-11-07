import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize2, Minimize2, LocateFixed, RefreshCw, Layers, ExternalLink, Loader2, Satellite, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { categoryOf, normState } from "@/lib/microplanning/heatmaps";
import { eventsInState, nearbyEvents, recordedNumber, statePoints, type Boundary, type IntelEntry, type IntelEvent, type IntelPoint } from "@/lib/microplanning/osiris";

type Dimension="security"|"accessibility"|"terrain"|"population";
const themes: {id:Dimension;label:string}[]=[{id:"security",label:"Security clearance"},{id:"accessibility",label:"Accessibility"},{id:"terrain",label:"Terrain types"},{id:"population",label:"Recorded population"}];
const empty={type:"FeatureCollection" as const,features:[]};
function token(name:string){const el=document.createElement("span");el.style.color=`hsl(var(${name}))`;document.body.appendChild(el);const color=getComputedStyle(el).color;el.remove();return color;}
function boundsOf(boundaries:Boundary[]){const b=new maplibregl.LngLatBounds();const visit=(v:unknown)=>{if(!Array.isArray(v))return;if(typeof v[0]==="number"&&typeof v[1]==="number"){b.extend([v[0],v[1]]);return;}v.forEach(visit);};boundaries.forEach(f=>visit(f.geometry.coordinates));return b;}
export default function OsirisSatelliteMap({entries,projectName}:{entries:IntelEntry[];projectName?:string}){
  const states=useMemo(()=>[...new Set(entries.map(e=>String(e.state??"").trim()).filter(Boolean))].sort(),[entries]);
  const [state,setState]=useState(states[0]??"");
  const [dimension,setDimension]=useState<Dimension>("security");
  const [boundaries,setBoundaries]=useState<Boundary[]>([]),[lgas,setLgas]=useState<Boundary[]>([]);
  const [events,setEvents]=useState<IntelEvent[]>([]),[feedStatus,setFeedStatus]=useState("Connecting to OSIRIS…"),[fetchedAt,setFetchedAt]=useState<string|null>(null);
  const [showEvents,setShowEvents]=useState(true),[terrain,setTerrain]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[fs,setFs]=useState(false),[selected,setSelected]=useState<IntelPoint|null>(null);
  const [revision,setRevision]=useState(0);
  const root=useRef<HTMLDivElement>(null),holder=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),pointIndex=useRef(new Map<string,IntelPoint>());
  useEffect(()=>{if(!states.includes(state)){setState(states[0]??"");setSelected(null);}},[states,state]);
  useEffect(()=>{
    const abort=new AbortController();
    Promise.all([fetch('/nigeria-state-outlines.geojson',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error("State boundaries unavailable");return r.json();}),fetch('/nigeria-lga.geojson',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error("LGA boundaries unavailable");return r.json();})]).then(([s,l])=>{setBoundaries(s.features);setLgas(l.features);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return()=>abort.abort();
  },[]);
  useEffect(()=>{
    let live=true,busy=false;
    const refresh=async()=>{if(busy||document.hidden||!navigator.onLine)return;busy=true;
      try{const {data,error}=await supabase.functions.invoke("osiris-context",{body:{}});if(!live)return;if(error||!data?.feeds)throw Error("Public feeds unavailable");setEvents(data.events??[]);setFetchedAt(data.fetchedAt);const ok=data.feeds.filter((f:{ok:boolean})=>f.ok).length;setFeedStatus(`${ok}/${data.feeds.length} OSIRIS feeds available`);}catch{if(live)setFeedStatus("OSIRIS unavailable · previous context retained");}finally{busy=false;}
    };refresh();const timer=setInterval(refresh,300000);window.addEventListener("online",refresh);
    return()=>{live=false;clearInterval(timer);window.removeEventListener("online",refresh);};
  },[revision]);
  const shapes=useMemo(()=>boundaries.filter(b=>normState(b.properties.state)===normState(state)),[boundaries,state]);
  const localLgas=useMemo(()=>lgas.filter(b=>normState(b.properties.state)===normState(state)),[lgas,state]);
  const scoped=useMemo(()=>statePoints(entries,state,lgas),[entries,state,lgas]);
  const localEvents=useMemo(()=>eventsInState(events,state,lgas),[events,state,lgas]);
  const nearby=useMemo(()=>selected?nearbyEvents(selected,events):[],[selected,events]);
  useEffect(()=>{
    if(!holder.current)return;let m:LibreMap;
    try{m=new maplibregl.Map({container:holder.current,style:{version:8,sources:{imagery:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"© Esri, Vantor, Earthstar Geographics, GIS User Community"},elevation:{type:"raster-dem",url:"https://tiles.mapterhorn.com/tilejson.json",encoding:"terrarium",tileSize:512,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'}},layers:[{id:"satellite",type:"raster",source:"imagery"}]},center:[8.7,9.1],zoom:5,pitch:45,maxZoom:20,maxPitch:70,canvasContextAttributes:{antialias:false},refreshExpiredTiles:false,renderWorldCopies:false});}
    catch{setError("3D rendering is unavailable on this device. Existing Geo maps remain available.");return;}
    map.current=m;const palette={blue:token('--chart-primary'),teal:token('--chart-secondary'),red:token('--status-danger'),amber:token('--status-warning'),green:token('--status-success'),neutral:token('--muted-foreground'),line:token('--primary-foreground')};
    m.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');m.addControl(new maplibregl.ScaleControl(),'bottom-left');
    m.on('load',()=>{
      if(map.current!==m)return;
      m.addSource('state',{type:'geojson',data:empty});m.addSource('lgas',{type:'geojson',data:empty});
      m.addSource('settlements',{type:'geojson',data:empty,cluster:true,clusterRadius:40,clusterMaxZoom:11});m.addSource('context',{type:'geojson',data:empty});
      m.addLayer({id:'lga-lines',type:'line',source:'lgas',paint:{'line-color':palette.line,'line-width':1,'line-opacity':0.65}});
      m.addLayer({id:'state-lines',type:'line',source:'state',paint:{'line-color':palette.teal,'line-width':3}});
      m.addLayer({id:'clusters',type:'circle',source:'settlements',filter:['has','point_count'],paint:{'circle-color':palette.blue,'circle-radius':['step',['get','point_count'],16,100,21,1000,27],'circle-stroke-color':palette.line,'circle-stroke-width':2}});
      m.addLayer({id:'settlement-points',type:'circle',source:'settlements',filter:['!', ['has','point_count']],paint:{'circle-color':['match',['get','tone'],'red',palette.red,'amber',palette.amber,'green',palette.green,'teal',palette.teal,'blue',palette.blue,palette.neutral],'circle-radius':['interpolate',['linear'],['zoom'],5,4,12,7,18,10],'circle-stroke-color':palette.line,'circle-stroke-width':1.5}});
      m.addLayer({id:'context-points',type:'circle',source:'context',paint:{'circle-color':['match',['get','kind'],'fire',palette.amber,'weather',palette.teal,palette.red],'circle-radius':7,'circle-stroke-color':palette.line,'circle-stroke-width':2}});
      m.setTerrain({source:'elevation',exaggeration:1});setReady(true);
    });
    m.on('click','settlement-points',e=>{const key=String(e.features?.[0].properties?.key??'');const p=pointIndex.current.get(key);if(p){setSelected(p);m.flyTo({center:[p.lng,p.lat],zoom:17,pitch:50,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650});}});
    m.on('click','clusters',async e=>{const f=e.features?.[0];if(!f||f.geometry.type!=='Point')return;const source=m.getSource('settlements') as GeoJSONSource;const z=await source.getClusterExpansionZoom(f.properties?.cluster_id);if(map.current===m)m.easeTo({center:f.geometry.coordinates as [number,number],zoom:z,duration:350});});
    m.on('click','context-points',e=>{const id=String(e.features?.[0].properties?.id??'');const el=document.createElement('div');el.className='text-sm';el.textContent=String(e.features?.[0].properties?.title??id);new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(el).addTo(m);});
    const canvas=m.getCanvas();const lost=(e:Event)=>{e.preventDefault();setError("3D graphics were interrupted. Close and reopen this panel to retry; other dashboard tools are unaffected.");};canvas.addEventListener('webglcontextlost',lost);
    const ro=new ResizeObserver(()=>{if(map.current===m)m.resize();});ro.observe(holder.current);
    return()=>{ro.disconnect();canvas.removeEventListener('webglcontextlost',lost);map.current=null;m.remove();};
  },[]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const features=scoped.points.map(p=>{
      const value=dimension==='population'?recordedNumber(p.entry.estimated_total_population):null;
      const cat=dimension==='population'?null:categoryOf(p.entry,dimension);
      const key=cat?.key;const tone=dimension==='population'?(value==null?'neutral':value>=5000?'red':value>=2000?'amber':'blue'):key==='not_cleared'||key==='inaccessible'?'red':key==='partial'||key==='hard_to_reach'||key==='seasonal'?'amber':key==='cleared'||key==='accessible'?'green':key==='unset'||key==='unknown'?'neutral':'teal';
      return {type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[p.lng,p.lat]},properties:{key:p.key,tone}};
    });pointIndex.current=new Map(scoped.points.map(p=>[p.key,p]));
    (m.getSource('settlements') as GeoJSONSource)?.setData({type:'FeatureCollection',features});
    (m.getSource('state') as GeoJSONSource)?.setData({type:'FeatureCollection',features:shapes} as never);
    (m.getSource('lgas') as GeoJSONSource)?.setData({type:'FeatureCollection',features:localLgas} as never);
  },[scoped,dimension,ready,shapes,localLgas]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;(m.getSource('context') as GeoJSONSource)?.setData({type:'FeatureCollection',features:(showEvents?localEvents:[]).map(e=>({type:'Feature',geometry:{type:'Point',coordinates:[e.lng,e.lat]},properties:e}))} as never);},[localEvents,showEvents,ready]);
  const fit=()=>{const m=map.current;if(!m||!ready)return;const b=boundsOf(shapes);if(!b.isEmpty())m.fitBounds(b,{padding:40,pitch:45,duration:0});};
  useEffect(()=>{fit();setSelected(null);},[state,shapes,ready]);
  useEffect(()=>{const m=map.current;if(m&&ready)m.setTerrain(terrain?{source:'elevation',exaggeration:1}:null);},[terrain,ready]);
  useEffect(()=>{const changed=()=>{if(!document.fullscreenElement)setFs(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setFs(false);};document.addEventListener('fullscreenchange',changed);window.addEventListener('keydown',key);return()=>{document.removeEventListener('fullscreenchange',changed);window.removeEventListener('keydown',key);if(document.fullscreenElement===root.current)document.exitFullscreen().catch(()=>{});};},[]);
  useEffect(()=>{const t=setTimeout(()=>map.current?.resize(),50);return()=>clearTimeout(t);},[fs]);
  const fullscreen=async()=>{if(fs){setFs(false);if(document.fullscreenElement===root.current)await document.exitFullscreen().catch(()=>{});}else{setFs(true);await root.current?.requestFullscreen?.().catch(()=>{});}};
  const population=scoped.points.reduce((n,p)=>n+(recordedNumber(p.entry.estimated_total_population)??0),0);
  return <div ref={root} className={fs?'fixed inset-0 z-[1000] flex flex-col bg-background':'mt-3 space-y-0 border-y'}>
    <div className="flex flex-wrap items-center gap-2 border-b bg-background py-3 px-2"><Satellite className="h-4 w-4 text-primary"/><span className="text-sm font-semibold">{projectName??'Project'}</span><div className="w-40"><Select value={state} onValueChange={setState}><SelectTrigger aria-label="Intelligence State"><SelectValue/></SelectTrigger><SelectContent>{states.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="w-44"><Select value={dimension} onValueChange={v=>setDimension(v as Dimension)}><SelectTrigger aria-label="Planning dimension"><SelectValue/></SelectTrigger><SelectContent>{themes.map(t=><SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select></div><div className="ml-auto flex gap-1"><Button variant="outline" size="icon" title="Fit State" aria-label="Fit State" onClick={fit}><LocateFixed className="h-4 w-4"/></Button><Button variant="outline" size="icon" title="Refresh OSIRIS context" aria-label="Refresh OSIRIS context" onClick={()=>setRevision(v=>v+1)}><RefreshCw className="h-4 w-4"/></Button><Button variant="outline" size="icon" title={fs?'Exit full screen':'Full screen'} aria-label={fs?'Exit satellite full screen':'Satellite full screen'} onClick={fullscreen}>{fs?<Minimize2 className="h-4 w-4"/>:<Maximize2 className="h-4 w-4"/>}</Button></div></div>
    <div className="flex flex-wrap gap-2 border-b bg-background px-2 py-2 text-xs"><Badge variant="secondary">{scoped.points.length.toLocaleString()} GPS-verified records</Badge><Badge variant="outline">{population.toLocaleString()} recorded population</Badge><Badge variant="outline">{localEvents.length} State context events</Badge>{scoped.missing>0&&<Badge variant="outline">{scoped.missing} missing GPS</Badge>}{scoped.outside>0&&<Badge variant="outline">{scoped.outside} unverified / outside State</Badge>}<label className="flex items-center gap-2"><Checkbox checked={showEvents} onCheckedChange={v=>setShowEvents(v===true)}/>OSIRIS observations</label><label className="flex items-center gap-2"><Checkbox checked={terrain} onCheckedChange={v=>setTerrain(v===true)}/><Layers className="h-3 w-3"/>3D terrain</label></div>
    <div className={fs?'relative min-h-0 flex-1':'relative h-[560px] min-h-80'}><div ref={holder} className="osiris-map-surface"/>{!ready&&!error&&<div className="absolute inset-0 flex items-center justify-center bg-background/80"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>}{error&&<div role="alert" className="absolute left-3 right-3 top-3 border bg-background p-3 text-sm">{error}</div>}
      {selected&&<div className="absolute left-2 top-2 z-10 max-h-[70%] w-[min(20rem,calc(100%-1rem))] overflow-auto rounded-md border bg-card p-3 shadow-md"><div className="flex items-start gap-2"><h3 className="flex-1 break-words font-semibold">{selected.entry.community_name??'Settlement'}</h3><Button variant="ghost" size="icon" aria-label="Close settlement detail" className="h-7 w-7 shrink-0" onClick={()=>setSelected(null)}><X className="h-4 w-4"/></Button></div><p className="text-xs text-muted-foreground">{selected.entry.ward} · {selected.entry.lga}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><dt>Population</dt><dd>{recordedNumber(selected.entry.estimated_total_population)?.toLocaleString()??'Not recorded'}</dd><dt>Households</dt><dd>{recordedNumber(selected.entry.number_of_households)?.toLocaleString()??'Not recorded'}</dd><dt>Security</dt><dd>{categoryOf(selected.entry,'security').label}</dd><dt>Access</dt><dd>{categoryOf(selected.entry,'accessibility').label}</dd><dt>Terrain</dt><dd>{categoryOf(selected.entry,'terrain').label}</dd><dt>FLHF</dt><dd className="break-words">{selected.entry.flhf_name??'Not recorded'}</dd><dt>GPS</dt><dd>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</dd></dl><h4 className="mt-3 border-t pt-2 text-xs font-semibold">Public observations within 10 km</h4>{nearby.length?nearby.slice(0,8).map(e=><div key={e.id} className="mt-2 text-xs"><p>{e.title}</p><p className="text-muted-foreground">{e.distance.toFixed(1)} km · {e.date??'Observation time unavailable'} · {e.provider}</p>{e.source&&<a href={e.source} target="_blank" rel="noopener noreferrer" className="text-primary underline">Source</a>}</div>):<p className="mt-2 text-xs text-muted-foreground">No returned observations nearby. This is not evidence that the location is safe.</p>}</div>}
    </div>
    <div className="space-y-2 bg-background px-3 py-3 text-xs"><div className="flex flex-wrap gap-3"><span>{feedStatus}{fetchedAt?` · fetched ${new Date(fetchedAt).toLocaleTimeString()}`:''}</span><a href="https://osirisai.live/docs" target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary underline">OSIRIS sources<ExternalLink className="h-3 w-3"/></a></div><div className="flex flex-wrap gap-4"><span className="text-destructive">● Not cleared / inaccessible / high population</span><span className="text-status-warning">● Partial / constrained</span><span className="text-primary">● Cleared / reachable / population</span><span className="text-muted-foreground">● Unknown</span></div><p className="text-muted-foreground">Live dashboard records + periodically refreshed public context; observations are not security clearance or causal risk. Satellite imagery is a provider mosaic, not a live camera; dates and building-level detail vary. 3D represents actual elevation, not measured building heights. Zoomed imagery may reveal roofs where coverage permits. Recorded-entry totals can include repeated settlements.</p></div>
  </div>;
}