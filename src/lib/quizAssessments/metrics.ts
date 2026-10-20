export interface AssessmentResult {quiz_id:string;participant_key:string;participant_name:string;assessment_type:string;percentage:number;cohort?:string|null;state?:string|null;lga?:string|null;designation?:string|null;submitted_at:string}
export function assessmentSummary(rows:AssessmentResult[],pass=70){
 const map=new Map<string,{pre?:AssessmentResult;post?:AssessmentResult}>();
 for(const r of [...rows].sort((a,b)=>Date.parse(b.submitted_at)-Date.parse(a.submitted_at))){const key=`${r.quiz_id}:${r.participant_key}`;const pair=map.get(key)||{};const type=r.assessment_type==='pre_test'?'pre':'post';if(!pair[type])pair[type]=r;map.set(key,pair);}
 const pairs=[...map.values()];const pre=pairs.flatMap(p=>p.pre?[Number(p.pre.percentage)]:[]);const post=pairs.flatMap(p=>p.post?[Number(p.post.percentage)]:[]);
 const gains=pairs.flatMap(p=>p.pre&&p.post?[Number(p.post.percentage)-Number(p.pre.percentage)]:[]);
 const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
 return {participants:new Set(rows.map(r=>r.participant_key)).size,preN:pre.length,postN:post.length,paired:gains.length,preMean:mean(pre),postMean:mean(post),gain:mean(gains),gains,prePass:pre.length?100*pre.filter(s=>s>=pass).length/pre.length:null,postPass:post.length?100*post.filter(s=>s>=pass).length/post.length:null,improved:gains.filter(g=>g>0).length,incomplete:pairs.length-gains.length};
}
