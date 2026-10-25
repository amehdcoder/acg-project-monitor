import {describe,it,expect} from 'vitest';
import {validatedMicroplan} from '../../../supabase/functions/_shared/microplanDeviceValidation';
const id='12345678-1234-1234-1234-123456789abc';
const entry={state:'Kano',lga:'Dala',ward:'Gwammaja',flhf_name:'Clinic',community_name:'Village',year_of_microplanning:2026};
describe('account-free microplan validation',()=>{
 it('accepts a complete project-scoped entry',()=>expect(validatedMicroplan(id,entry,{}).community_name).toBe('Village'));
 it('never trusts ownership or project supplied by a collector',()=>expect(validatedMicroplan(id,{...entry,project_id:'other',created_by:'admin',device_id:'spoof'},{})).not.toHaveProperty('project_id'));
 it('rejects records outside the configured ward',()=>expect(()=>validatedMicroplan(id,entry,{scope_wards:['Kano|Dala|Other']})).toThrow('geography_outside_project'));
 it('rejects negative population',()=>expect(()=>validatedMicroplan(id,{...entry,estimated_children_5_14:-1},{})).toThrow('invalid_population'));
 it('rejects invalid coordinates',()=>expect(()=>validatedMicroplan(id,{...entry,community_latitude:91},{})).toThrow('invalid_location'));
});