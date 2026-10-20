export interface AssessmentResult {quiz_id:string;participant_key:string;participant_name:string;assessment_type:string;percentage:number;cohort?:string|null;state?:string|null;lga?:string|null;designation?:string|null;submitted_at:string}
export function participantAnalysis(rows:AssessmentResult[]){
 const groups=new Map<string,AssessmentResult[]>();
 for(const r of rows){if(!['pre_test','post_test'].includes(r.assessment_type)||!Number.isFinite(r.percentage))continue;const key=`${r.quiz_id}:${r.participant_key}`;groups.set(key,[...(groups.get(key)||[]),r]);}
 return [...groups.entries()].map(([key,items])=>{
  const sorted=[...items].sort((a,b)=>Date.parse(b.submitted_at)-Date.parse(a.submitted_at));const post=sorted.find(r=>r.assessment_type==='post_test');
  const pre=sorted.find(r=>r.assessment_type==='pre_test'&&(!post||Date.parse(r.submitted_at)<=Date.parse(post.submitted_at)));
  const latest=post||pre||sorted[0];const gain=pre&&post?post.percentage-pre.percentage:null;
  return {key,quiz_id:latest.quiz_id,participant_key:latest.participant_key,name:latest.participant_name,cohort:latest.cohort,pre:pre?.percentage??null,post:post?.percentage??null,gain,completed_at:post?.submitted_at??null,status:gain===null?'Incomplete':gain>0?'Improved':gain<0?'Declined':'Unchanged'};
 });
}
export function knowledgeByActivity(rows:AssessmentResult[],links:Record<string,string|null>,start:string,end:string){
 const eligible=participantAnalysis(rows.filter(r=>r.assessment_type==='pre_test'||(r.submitted_at>=start&&r.submitted_at<end))).filter(p=>p.completed_at&&links[p.quiz_id]&&p.gain!==null).sort((a,b)=>String(b.completed_at).localeCompare(String(a.completed_at)));
 const unique=new Map<string,typeof eligible[number]>();for(const p of eligible){const key=`${links[p.quiz_id]}:${p.participant_key}`;if(!unique.has(key))unique.set(key,p);}
 const inPeriod=[...unique.values()];
 const codes=[...new Set(inPeriod.map(p=>links[p.quiz_id]))];
 return Object.fromEntries(codes.map(code=>{const pairs=inPeriod.filter(p=>links[p.quiz_id]===code);return [code,{paired:pairs.length,improved:pairs.filter(p=>Number(p.gain)>0).length,mean_gain:pairs.reduce((sum,p)=>sum+Number(p.gain),0)/pairs.length}];}));
}
export function assessmentSummary(rows:AssessmentResult[],pass=70){
 const map=new Map<string,{pre?:AssessmentResult;post?:AssessmentResult}>();
 for(const p of participantAnalysis(rows)){const pre=p.pre===null?undefined:rows.find(r=>r.quiz_id===p.quiz_id&&r.participant_key===p.participant_key&&r.assessment_type==='pre_test'&&r.percentage===p.pre);const post=p.post===null?undefined:rows.find(r=>r.quiz_id===p.quiz_id&&r.participant_key===p.participant_key&&r.assessment_type==='post_test'&&r.percentage===p.post);map.set(p.key,{pre,post});}
 const pairs=[...map.values()];const pre=pairs.flatMap(p=>p.pre?[Number(p.pre.percentage)]:[]);const post=pairs.flatMap(p=>p.post?[Number(p.post.percentage)]:[]);
 const gains=pairs.flatMap(p=>p.pre&&p.post?[Number(p.post.percentage)-Number(p.pre.percentage)]:[]);
 const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
 return {participants:new Set(rows.map(r=>r.participant_key)).size,preN:pre.length,postN:post.length,paired:gains.length,preMean:mean(pre),postMean:mean(post),gain:mean(gains),gains,prePass:pre.length?100*pre.filter(s=>s>=pass).length/pre.length:null,postPass:post.length?100*post.filter(s=>s>=pass).length/post.length:null,improved:gains.filter(g=>g>0).length,incomplete:pairs.length-gains.length};
}
