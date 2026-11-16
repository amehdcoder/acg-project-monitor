import { describe, expect, it } from 'vitest';
import { expandNestedSettlements } from '../../../../supabase/functions/_shared/microplanSettlements';
import { extractKoboMicroplanSchema } from '../../../../supabase/functions/_shared/koboMicroplanSchema';
import { normalizeMicroplanEntry } from '../normalizeEntry';
import { entryPoint } from '../heatmaps';
import { trachomaChildrenTotals } from '../trachomaChildren';

const raw = {
  Community_Name: 'Community A', community_gps: '12.5 11.5 0 5', Has_Settlements: 'yes',
  settlement_repeat: [
    { 'settlement_repeat/Settlement_Name': 'Settlement A', 'settlement_repeat/settlement_gps': '12.51 11.51 0 5' },
    { Settlement_Name: 'Settlement B', settlement_gps: '12.52 11.52 0 4' },
  ],
};
const parent = {
  idempotency_key: 'submission_0', community_name: 'Community A',
  community_latitude: 12.5, community_longitude: 11.5, project_id: 'project-a',
  estimated_total_population: 300, trachoma_0_5_months: 10, trachoma_6m_6y: 70,
  trachoma_7_14y: 80, trachoma_15_plus: 140, trachoma_1_9_male: 30, trachoma_1_9_female: 35,
  pwd_visual: 9, number_of_households: 60, accessibility: 'hard_to_reach',
  cdd_details: [{ name: 'Musa', account_number: '0123456789' }], flhf_bank: 'Bank',
};

describe('nested settlement synchronization', () => {
  const detail = (pop: number, terrain: string, name: string) => ({
    Settlement_Name: name, settlement_gps: '12.51 11.51 0 5', settlement_schema_version: 'details_v1',
    settlement_Type_of_Terrain: terrain, settlement_Accessibility: 'seasonal_access', settlement_Security_Clearance: 'partially_cleared', settlement_Source_of_Population_Data: 'census',
    settlement_Children_0_4_yrs: 10, settlement_Children_5_14_yrs: 20, settlement_Adults_15_yrs: pop - 30,
    settlement_Total_Population: pop, settlement_Number_of_Households: 12,
    settlement_pwd_total: 3, settlement_Visual_Seeing: 2, settlement_Hearing: 1, settlement_Physical_Mobility: 0,
    settlement_Intellectual_Cognitive: 0, settlement_Communication_Speech: 0, settlement_Self_care: 0, settlement_Albinism: 0,
    settlement_cdd_repeat: [{settlement_CDD_Name: name + ' CDD', settlement_CDD_Phone: '08012345678', settlement_CDD_Account_Number: '0123456789', settlement_CDD_Bank: 'other', settlement_CDD_Bank_Other: 'Local Bank'}],
    settlement_Notes: name + ' note',
  });
  it('saves each settlement census, disability, terrain and CDD bank independently, without parent duplication', () => {
    const rows = expandNestedSettlements(parent, {...raw, settlement_repeat: [detail(100,'flat','East'),detail(150,'riverine','West')]});
    expect(rows.map(r=>r.estimated_total_population)).toEqual([null,100,150]);
    expect(rows.reduce((n,r)=>n+Number(r.estimated_total_population??0),0)).toBe(250);
    expect(rows[2]).toMatchObject({terrain_type:'riverine',accessibility:'seasonal',security_clearance:'partial',number_of_households:12,pwd_visual:2,pwd_total:3,notes:'West note',cdd_names:'West CDD'});
    expect(rows[1].cdd_details).toEqual([expect.objectContaining({name:'East CDD',account_number:'0123456789',bank:'Local Bank'})]);
  });
  it('rejects incomplete, inconsistent or invalid later settlement counts and bank accounts', () => {
    const check=(item:Record<string,unknown>)=>expandNestedSettlements(parent,{...raw,settlement_repeat:[detail(100,'flat','East'),item]});
    expect(()=>check({...detail(150,'flat','West'),settlement_Number_of_Households:-1})).toThrow('non-negative');
    expect(()=>check({...detail(150,'flat','West'),settlement_Total_Population:151})).toThrow('equal');
    expect(()=>check({...detail(150,'flat','West'),settlement_Hearing:null})).toThrow('pwd_hearing is required');
    expect(()=>check({...detail(150,'flat','West'),settlement_cdd_repeat:[{settlement_CDD_Name:'CDD',settlement_CDD_Account_Number:'123'}]})).toThrow();
  });
  it('accepts omitted parent conditions and the single disability total at its corrected Kobo group path for every settlement', () => {
    const items = [detail(100, 'flat', 'East'), detail(150, 'riverine', 'West')].map((item) => {
      const { settlement_pwd_total, ...fields } = item;
      return { ...fields, 'settlement_repeat/settlement_group_eh6ih14/settlement_pwd_total': settlement_pwd_total };
    });
    const rows = expandNestedSettlements({ ...parent, terrain_type: null, accessibility: null, security_clearance: null }, { ...raw, settlement_repeat: items });
    expect(rows.slice(1).map(row => [row.terrain_type, row.accessibility, row.security_clearance, row.pwd_total])).toEqual([
      ['flat', 'seasonal', 'partial', 3], ['riverine', 'seasonal', 'partial', 3],
    ]);
    expect(rows[0].pwd_total).toBeNull();
    expect(rows.reduce((total, row) => total + Number(row.pwd_total ?? 0), 0)).toBe(6);
  });
  it('uses settlement Trachoma groups and mandatory 5–9 counts without adding the parent cohort', () => {
    const item={...detail(100,'flat','East'), settlement__0_5_Months:10,settlement__6_Months_6_Years:20,settlement__7_14_Years:30,settlement__15_Years:40,settlement_Trachoma_5_9_Male:7,settlement_Trachoma_5_9_Female:8};
    const rows=expandNestedSettlements({...parent,mda_type:'trachoma'},{...raw,settlement_repeat:[item]});
    expect(rows[1].estimated_total_population).toBe(100);
    expect(trachomaChildrenTotals(rows)).toMatchObject({total:15,communities:1,complete:1});
    expect(()=>expandNestedSettlements({...parent,mda_type:'trachoma'},{...raw,settlement_repeat:[{...item,settlement_Trachoma_5_9_Female:null}]})).toThrow('5–9');
  });
  it('positions every nested settlement at its own GPS in shared dashboard maps', () => {
    const rows = expandNestedSettlements(parent, raw).map(normalizeMicroplanEntry);
    expect(rows.map(row => entryPoint(row))).toEqual([[12.5, 11.5], [12.51, 11.51], [12.52, 11.52]]);
  });
  it('creates one row for every settlement with its own GPS and stable retry key', () => {
    const rows = expandNestedSettlements(parent, raw);
    expect(rows.map(r => [r.settlement_name, r.settlement_latitude, r.settlement_longitude])).toEqual([
      [null, null, null], ['Settlement A', 12.51, 11.51], ['Settlement B', 12.52, 11.52],
    ]);
    expect(rows.map(r => r.idempotency_key)).toEqual(['submission_0', 'submission_0_s0', 'submission_0_s1']);
    expect(expandNestedSettlements(parent, raw)).toEqual(rows);
    expect(rows.every(r => r.project_id === 'project-a')).toBe(true);
  });
  it('does not double count community population, Trachoma cohorts, disability or households', () => {
    const rows = expandNestedSettlements(parent, raw);
    expect(trachomaChildrenTotals(rows)).toMatchObject({ total: 65, communities: 1, complete: 1 });
    for (const [field, expected] of Object.entries({ estimated_total_population: 300, trachoma_0_5_months: 10, trachoma_6m_6y: 70, trachoma_7_14y: 80, trachoma_15_plus: 140, trachoma_1_9_male: 30, trachoma_1_9_female: 35, pwd_visual: 9, number_of_households: 60 })) {
      expect(rows.reduce((s, r) => s + Number(r[field] ?? 0), 0)).toBe(expected);
      expect(rows[1][field]).toBeNull();
    }
  });
  it('retains recent banking, CDD and access fields', () => {
    const rows = expandNestedSettlements(parent, raw);
    expect(rows[2].cdd_details).toEqual(parent.cdd_details);
    expect(rows[2].flhf_bank).toBe('Bank');
    expect(rows[2].accessibility).toBe('hard_to_reach');
  });
  it('rejects a missing GPS in any settlement including later items', () => {
    expect(() => expandNestedSettlements(parent, { ...raw, settlement_repeat: [raw.settlement_repeat[0], { Settlement_Name: 'B' }] })).toThrow('Settlement 2 requires its own valid GPS');
  });
  it('rejects missing community GPS instead of inheriting facility GPS', () => {
    expect(() => expandNestedSettlements(parent, { ...raw, community_gps: '', gps_capture: '12 11 0 5' })).toThrow('Every community');
  });
  it('retains legacy forms and allows communities without settlements', () => {
    expect(expandNestedSettlements(parent, {})).toEqual([parent]);
    expect(expandNestedSettlements(parent, { ...raw, Has_Settlements: 'no', settlement_repeat: [] })).toHaveLength(1);
    expect(() => expandNestedSettlements(parent, { ...raw, settlement_repeat: [] })).toThrow('at least one');
  });
  it('keeps updated mandatory 5–9 counts and independent Trachoma total through extraction', () => {
    const schema = extractKoboMicroplanSchema({ _0_5_Months: 10, _6_Months_6_Years: 70, _7_14_Years: 80, _15_Years: 140, Trachoma_5_9_Male: 30, Trachoma_5_9_Female: 35 }, {}, 'trachoma');
    expect(schema.estimated_total_population).toBe(300);
    expect(schema.trachoma_1_9_male).toBe(30);
    expect(schema.trachoma_1_9_female).toBe(35);
  });
});