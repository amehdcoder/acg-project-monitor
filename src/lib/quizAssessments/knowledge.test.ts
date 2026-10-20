import {describe,it,expect} from 'vitest';
import {knowledgeByActivity,participantAnalysis,type AssessmentResult} from './metrics';
const row=(quiz_id:string,participant_key:string,assessment_type:string,percentage:number,submitted_at='2026-10-20T00:00:00.000Z'):AssessmentResult=>({quiz_id,participant_key,participant_name:participant_key,assessment_type,percentage,submitted_at});
describe('Activity-bound knowledge reporting',()=>{
 it('does not populate nurses/GPs, primary workers or school teachers from another training',()=>{
  const rows=[row('nurses','a','pre_test',40),row('nurses','a','post_test',80),row('workers','b','pre_test',60),row('workers','b','post_test',50),row('teachers','c','post_test',90)];
  const m=knowledgeByActivity(rows,{nurses:'PSO01R02A04',workers:'PSO01R02A05',teachers:'PSO01R02A07'},'2026-10-01','2026-11-01');
  expect(m.PSO01R02A04).toEqual({paired:1,improved:1,mean_gain:40});expect(m.PSO01R02A05).toEqual({paired:1,improved:0,mean_gain:-10});expect(m.PSO01R02A07).toBeUndefined();
 });
 it('never infers an activity for an unlinked quiz',()=>{expect(knowledgeByActivity([row('q','a','pre_test',40),row('q','a','post_test',80)],{},'2026-10-01','2026-11-01')).toEqual({});});
 it('includes prior pre-tests but excludes post-tests outside the report month',()=>{const rows=[row('q','a','pre_test',40,'2026-09-30'),row('q','a','post_test',80,'2026-10-20'),row('q','b','pre_test',50,'2026-10-20'),row('q','b','post_test',90,'2026-11-01')];expect(knowledgeByActivity(rows,{q:'A'},'2026-10-01','2026-11-01').A.improved).toBe(1);});
 it('never pairs a later pre-test with an earlier post-test',()=>{expect(participantAnalysis([row('q','a','pre_test',40,'2026-10-21'),row('q','a','post_test',80,'2026-10-20')])[0].gain).toBeNull();});
});