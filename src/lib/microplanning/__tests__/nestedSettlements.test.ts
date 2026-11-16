import { describe, expect, it } from 'vitest';
import { expandNestedSettlements } from '../../../../supabase/functions/_shared/microplanSettlements';
import { extractKoboMicroplanSchema } from '../../../../supabase/functions/_shared/koboMicroplanSchema';

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