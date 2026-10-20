import { z } from 'zod';
export interface ImportedQuestion { question_text: string; options: {label:string;value:string}[]; correct_answer:string; points:number }
export const questionSchema = z.object({question_text:z.string().trim().min(1), options:z.array(z.object({label:z.string().trim().min(1),value:z.string().min(1)})).min(2),correct_answer:z.string().min(1),points:z.number().finite().positive()}).refine(q=>q.options.some(o=>o.value===q.correct_answer),'Select a verified correct answer').refine(q=>new Set(q.options.map(o=>o.value)).size===q.options.length,'Option values must be unique');
export function detectQuestions(source: unknown): ImportedQuestion[] {
 const s=source as Record<string,any>;
 const rows=Array.isArray(source)?source:s?.questions||s?.items;
 if(!Array.isArray(rows)) throw new Error('No questions detected. Upload a question workbook or a Forms API JSON export.');
 return rows.map((row:any)=>{
  const google=row.questionItem?.question; const choice=google?.choiceQuestion;
  if(google && (!choice || choice.type==='CHECKBOX')) throw new Error('Only single-answer choice questions can be automatically scored; convert other types before import.');
  const raw=row.options||choice?.options||[row['Option A'],row['Option B'],row['Option C'],row['Option D'],row['Option E'],row['Option F']].filter(Boolean);
  const options=(Array.isArray(raw)?raw:String(raw||'').split('|')).map((o:any,i:number)=>typeof o==='object'?{label:String(o.label??o.value??''),value:String(o.value??i)}:{label:String(o),value:String(i)});
  const answer=String(row.correct_answer??row['Correct answer']??google?.grading?.correctAnswers?.answers?.[0]?.value??'');
  const found=options.find(o=>o.label===answer)||options.find(o=>o.value===answer);
  return {question_text:String(row.question_text??row.Question??row.title??''),options,correct_answer:found?.value??'',points:Number(row.points??row.Points??google?.grading?.pointValue??1)};
 }).filter(q=>q.question_text.trim());
}
export const resultSchema=z.object({participant_key:z.string().trim().min(1),participant_name:z.string().trim().min(1),assessment_type:z.enum(['pre_test','post_test']),percentage:z.number().finite().min(0).max(100),cohort:z.string().nullable(),state:z.string().nullable(),lga:z.string().nullable(),designation:z.string().nullable(),submitted_at:z.string().datetime()});
export const aliases:Record<string,string[]>={participant_key:['participant_key','participant id','email','email address','respondent email','id'],participant_name:['participant_name','name','full name','participant name'],assessment_type:['assessment_type','assessment','test type','pre/post'],percentage:['percentage','percentage score','score %'],score:['score','total points','total score'],max_score:['max_score','maximum points','max score'],cohort:['cohort','group','intervention group'],state:['state'],lga:['lga','local government area'],designation:['designation','role','cadre'],submitted_at:['submitted_at','completion time','timestamp','submitted at']};
export function detectColumns(headers:string[]) { return Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,headers.find(h=>names.includes(h.toLowerCase().trim()))||''])); }
export function normalizeResults(rows:Record<string,unknown>[],mapping:Record<string,string>) {
 const read=(r:Record<string,unknown>,k:string)=>r[mapping[k]];
 return rows.map((r,i)=>{
  const rawType=String(read(r,'assessment_type')||'').toLowerCase().trim().replace(/[ -]/g,'_');
  const type=['pre','pre_test','pretest'].includes(rawType)?'pre_test':['post','post_test','posttest'].includes(rawType)?'post_test':rawType;
  const rawPct=read(r,'percentage'); const score=Number(read(r,'score'));const max=Number(read(r,'max_score'));
  const percentage=rawPct!==undefined && rawPct!==''?Number(String(rawPct).replace('%','')):max>0?100*score/max:NaN;
  const date=read(r,'submitted_at'); if(!date) throw new Error(`Row ${i+2}: completion date is required`);
  const d=new Date(String(date));
  const result=resultSchema.safeParse({participant_key:String(read(r,'participant_key')||'').trim().toLowerCase(),participant_name:String(read(r,'participant_name')||''),assessment_type:type,percentage,cohort:read(r,'cohort')?String(read(r,'cohort')):null,state:read(r,'state')?String(read(r,'state')):null,lga:read(r,'lga')?String(read(r,'lga')):null,designation:read(r,'designation')?String(read(r,'designation')):null,submitted_at:Number.isNaN(+d)?'':d.toISOString()});
  if(!result.success) throw new Error(`Row ${i+2}: ${result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; ')}`);
  return result.data;
 });
}
export function platformFromUrl(raw:string) {
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password) throw new Error('Use a public HTTPS form link without credentials');
 const h=u.hostname.toLowerCase();
 return h==='docs.google.com'||h==='forms.gle'?'Google Forms':h==='forms.office.com'||h==='forms.microsoft.com'?'Microsoft Forms':h==='menti.com'||h==='www.menti.com'||h.endsWith('.mentimeter.com')?'Mentimeter':'External form';
}
