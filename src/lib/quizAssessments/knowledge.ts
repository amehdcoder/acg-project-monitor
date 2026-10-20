import { supabase } from '@/integrations/supabase/client';
import { cachedRead } from '@/lib/programmeModule/offlineReadCache';
export interface KnowledgeMetric { activity_code:string; paired:number; improved:number; mean_gain:number; quiz_count:number }
export async function loadKnowledgeMetrics(projectId:string,period:string):Promise<Record<string,KnowledgeMetric>>{
 const match=/^([A-Za-z]+) (\d{4})$/.exec(period.trim());
 const month=match?['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(match[1]):-1;
 if(!match||month<0)return {};
 const year=Number(match[2]);const start=new Date(Date.UTC(year,month,1)).toISOString(),end=new Date(Date.UTC(year,month+1,1)).toISOString();
 const {data:auth}=await supabase.auth.getUser();if(!auth.user)return {};
 const {data,error}=await cachedRead<KnowledgeMetric[]>(`knowledge:${auth.user.id}:${projectId}:${start}`,async()=>{
  const result=await supabase.rpc('programme_knowledge_metrics',{_project_id:projectId,_start:start,_end:end});
  return {data:result.data?.map(r=>({...r,paired:Number(r.paired),improved:Number(r.improved),mean_gain:Number(r.mean_gain),quiz_count:Number(r.quiz_count)}))??null,error:result.error};
 });
 if(error||!data)throw new Error('Knowledge assessment totals could not be refreshed.');
 return Object.fromEntries(data.map(r=>[r.activity_code,r]));
}