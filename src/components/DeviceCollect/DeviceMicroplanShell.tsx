import {useEffect,useState,useRef} from 'react';
import {useDeviceSession} from '@/hooks/useDeviceSession';
import MicroplanEntryForm, {type MicroplanFormData} from '@/components/Microplanning/MicroplanEntryForm';
import {Button} from '@/components/ui/button';
import {LogOut,MapPinned,RefreshCw} from 'lucide-react';
import {saveSavedEntry,listSavedEntries,type SavedFormEntry} from '@/lib/savedForms';
import {deviceUserId} from '@/lib/deviceSession';
import {syncDeviceRecords} from '@/lib/deviceSync';
import {getAllStates} from '@/lib/nigeriaAdminData';
import {prefetchGrid3State} from '@/lib/grid3NigeriaData';
import {toast} from 'sonner';

export default function DeviceMicroplanShell(){
 const {session,leave}=useDeviceSession();
 const [entries,setEntries]=useState<SavedFormEntry[]>([]);
 const [busy,setBusy]=useState(false);
 const [formKey,setFormKey]=useState(0);
 const [preparing,setPreparing]=useState(true);
 const shellRef=useRef<HTMLDivElement>(null);
 const project:any=session?.bundle?.project;
 const microplanScope=session?.bundle?.microplanning?.scope ?? {states:project?.scope_states||[],lgas:project?.scope_lgas||[],wards:project?.scope_wards||[]};
 useEffect(()=>{
  const viewport=window.visualViewport;
  const resize=()=>shellRef.current?.style.setProperty('--microplan-viewport-height',`${viewport?.height ?? window.innerHeight}px`);
  resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);
  return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);};
 },[]);
 const load=async()=>{if(session) setEntries((await listSavedEntries(deviceUserId(session.deviceId))).filter(e=>e.projectId===session.projectId && e.settings.kind==='microplan'));};
 useEffect(()=>{
  if(!session)return;
  void load(); const timer=window.setInterval(()=>void load(),3000);
  let cancelled=false;
  const scope=microplanScope;
  const states=scope?.states.length ? scope.states : scope?.lgas.length ? [...new Set(scope.lgas.map(v=>v.split('|')[0]))] : scope?.wards.length ? [...new Set(scope.wards.map(v=>v.split('|')[0]))] : getAllStates();
  void (async()=>{for(const state of states){if(cancelled || !navigator.onLine)break;await prefetchGrid3State(state);} if(!cancelled)setPreparing(false);})();
  return()=>{cancelled=true;window.clearInterval(timer);};
 },[session?.projectId]);
 if(!session)return null;
 const save=async(data:MicroplanFormData)=>{
  setBusy(true);
  try{
   const id=crypto.randomUUID(),now=new Date().toISOString();
   await saveSavedEntry({id,userId:deviceUserId(session.deviceId),formId:`microplan:${session.projectId}`,formName:'Microplan Entry',formDescription:'',projectId:session.projectId,questions:[],groups:[],geofence:null,settings:{kind:'microplan'},responses:data,submissionData:data,gps:null,status:'finalized',createdAt:now,updatedAt:now,finalizedAt:now,submissionId:id,offline:!navigator.onLine,syncState:'queued',displayName:data.community_name});
   localStorage.removeItem(`microplan:draft:device:${session.deviceId}:${session.projectId}:new`);
   toast.success('Microplan saved on this device');setFormKey(v=>v+1);
   void syncDeviceRecords().then(load);await load();
  }catch(error){toast.error('Could not save on this device. Free some storage and try again.');throw error;}finally{setBusy(false);}
 };
 return <div ref={shellRef} className="microplan-device-shell flex flex-col bg-background">
  <header className="shrink-0 border-b bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-2">
   <div className="flex items-center gap-2"><MapPinned className="h-6 w-6 text-primary"/><div><h1 className="font-bold text-base">{session.projectName}</h1><p className="text-xs text-muted-foreground">{session.label} · {preparing?'Preparing location lists…':'Location lists prepared'}</p></div></div>
   <Button variant="ghost" size="sm" onClick={leave}><LogOut className="mr-1 h-4 w-4"/>Leave project</Button>
  </header>
  <main className="min-h-0 min-w-0 flex-1 flex flex-col w-full max-w-6xl mx-auto px-3 pt-3">
   <MicroplanEntryForm key={formKey} projectId={session.projectId} scopeOverride={microplanScope} accountFree onSubmit={save} onCancel={()=>setFormKey(v=>v+1)} isSubmitting={busy}/>
  </main>
  <footer className="shrink-0 border-t bg-card px-4 py-2 flex items-center justify-between gap-3 text-xs">
   <span>{entries.filter(e=>e.status==='sent').length} synced · {entries.filter(e=>e.status==='finalized').length} pending</span>
   <Button variant="ghost" size="sm" onClick={()=>void syncDeviceRecords().then(load)}><RefreshCw className="mr-1 h-3 w-3"/>Sync</Button>
  </footer>
 </div>;
}