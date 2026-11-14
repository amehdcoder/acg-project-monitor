import {describe,it,expect} from 'vitest';
import {validatedMicroplan} from '../../../supabase/functions/_shared/microplanDeviceValidation';
const id='12345678-1234-1234-1234-123456789abc';
const entry={state:'Kano',lga:'Dala',ward:'Gwammaja',flhf_name:'Clinic',community_name:'Village',year_of_microplanning:2026};
describe('account-free microplan validation',()=>{
 it('preserves independently supplied CDD and FLHF bank details',()=>{
  const details={cdd_account_name:'Aisha Musa',cdd_account_number:'0123456789',cdd_bank:'Access Bank',flhf_account_name:'Clinic Account',flhf_account_number:'0987654321',flhf_bank:'Community Savings Bank'};
  expect(validatedMicroplan(id,{...entry,...details},{})).toMatchObject(details);
 });
 it('rejects malformed banking details before device intake',()=>{
  for(const field of ['cdd_account_number','flhf_account_number']) expect(()=>validatedMicroplan(id,{...entry,[field]:'123456789'},{})).toThrow('exactly 10 digits');
 });
 it('saves optional child sex counts independently of Trachoma age totals',()=>{
  const saved=validatedMicroplan(id,{...entry,trachoma_1_9_male:70,trachoma_1_9_female:80,trachoma_0_5_months:1,trachoma_6m_6y:2,trachoma_7_14y:3,trachoma_15_plus:4,estimated_total_population:10},{});
  expect(saved.trachoma_1_9_male).toBe(70);
  expect(saved.trachoma_1_9_female).toBe(80);
  expect(saved.estimated_total_population).toBe(10);
 });
 it('retains blank and zero child sex counts distinctly',()=>{
  expect(validatedMicroplan(id,entry,{}).trachoma_1_9_male).toBeNull();
  expect(validatedMicroplan(id,{...entry,trachoma_1_9_male:0},{}).trachoma_1_9_male).toBe(0);
 });
 it('rejects negative or fractional child sex counts',()=>{
  for(const field of ['trachoma_1_9_male','trachoma_1_9_female']) for(const value of [-1,1.5]) expect(()=>validatedMicroplan(id,{...entry,[field]:value},{})).toThrow('invalid_population');
 });
 it('accepts a complete project-scoped entry',()=>expect(validatedMicroplan(id,entry,{}).community_name).toBe('Village'));
 it('never trusts ownership or project supplied by a collector',()=>expect(validatedMicroplan(id,{...entry,project_id:'other',created_by:'admin',device_id:'spoof'},{})).not.toHaveProperty('project_id'));
 it('rejects records outside the configured ward',()=>expect(()=>validatedMicroplan(id,entry,{scope_wards:['Kano|Dala|Other']})).toThrow('geography_outside_project'));
 it('rejects negative population',()=>expect(()=>validatedMicroplan(id,{...entry,estimated_children_5_14:-1},{})).toThrow('invalid_population'));
 it('rejects invalid coordinates',()=>expect(()=>validatedMicroplan(id,{...entry,community_latitude:91},{})).toThrow('invalid_location'));
});