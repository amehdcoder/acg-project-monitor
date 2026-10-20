import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {loadProjectLogframe,saveProjectLogframe} from '@/lib/programmeModule/logframeStore';
import {Button} from '@/components/ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {useToast} from '@/hooks/use-toast';
import {Link2,Save} from 'lucide-react';
export default function AssessmentActivityLinks({projectId,onSaved}:{projectId:string;onSaved:()=>void}){
 const {toast}=useToast();const [quizzes,setQuizzes]=useState<{id:string;title:string;logframe_activity_code:string|null}[]>([]);
 const [activities,setActivities]=useState<{code:string;title:string}[]>([]);const [links,setLinks]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;setQuizzes([]);setError('');void Promise.all([loadProjectLogframe(projectId),supabase.from('quizzes').select('id,title,logframe_activity_code').eq('project_id',projectId)]).then(([lf,result])=>{
  if(cancelled)return;if(result.error){setError(result.error.message);return;}
  setActivities(lf.objectives.flatMap(o=>o.results.flatMap(r=>r.activities.filter(a=>/change.*knowledge/i.test(a.indicator)).map(a=>({code:a.code,title:a.title})))));
  setQuizzes(result.data||[]);setLinks(Object.fromEntries((result.data||[]).map(q=>[q.id,q.logframe_activity_code||'none'])));
 }).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[projectId]);
 const save=async(id:string)=>{setBusy(true);setError('');try{
  const {data,error:e}=await supabase.from('programme_logframes').select('project_id').eq('project_id',projectId).maybeSingle();if(e)throw e;
  if(!data)await saveProjectLogframe(projectId,await loadProjectLogframe(projectId));
  const {error}=await supabase.from('quizzes').update({logframe_activity_code:links[id]==='none'?null:links[id]}).eq('id',id).eq('project_id',projectId);if(error)throw error;
  toast({title:'Training activity linked'});onSaved();window.dispatchEvent(new Event('quiz-assessment-updated'));
 }catch(e){setError(e instanceof Error?e.message:'Could not save activity link');}finally{setBusy(false);}};
 return <div className="space-y-3 border-t border-border pt-5"><h3 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-health-teal"/>Programme Report activity links</h3>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{quizzes.length===0?<p className="text-sm text-muted-foreground">No project assessments available.</p>:quizzes.map(q=><div key={q.id} className="grid items-center gap-2 border-b border-border pb-3 lg:grid-cols-[1fr_2fr_auto]"><span className="text-sm font-medium">{q.title}</span><Select value={links[q.id]||'none'} onValueChange={v=>setLinks(s=>({...s,[q.id]:v}))}><SelectTrigger aria-label={`Training activity for ${q.title}`} className="h-auto min-h-12 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue/></SelectTrigger><SelectContent className="max-w-[min(700px,90vw)]"><SelectItem value="none">Not linked — no report auto-fill</SelectItem>{activities.map(a=><SelectItem key={a.code} value={a.code} className="whitespace-normal">{a.code} · {a.title}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" aria-label={`Save activity link for ${q.title}`} disabled={busy} onClick={()=>void save(q.id)}><Save className="h-4 w-4"/></Button></div>)}<p className="text-sm text-muted-foreground">Each assessment contributes only to its selected activity. Report counts use participants with improved matched scores; percentage indicators use mean gain in percentage points.</p></div>;
}