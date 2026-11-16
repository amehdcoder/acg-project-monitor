import { describe, it, expect } from 'vitest';
import { extractKoboMicroplanSchema } from '../../../../supabase/functions/_shared/koboMicroplanSchema';
import codes from '../../../../supabase/functions/_shared/koboBankChoices.json';
import directory from '../nigeriaBanks.json';

const cdd = (name: string, account: string) => ({
  'group_yf5bw16/group_pi0rq96/cdd_repeat/cdd_details/CDD_Name': name,
  'cdd_details/CDD_Phone': '08031234567',
  'cdd_details/CDD_Account_Name': `${name} account`,
  'cdd_details/CDD_Account_Number': account,
  'cdd_details/CDD_Bank': 'other',
  'cdd_details/CDD_Bank_Other': 'Local Community Bank',
});

describe('updated Kobo Microplanning schema', () => {
  it('keeps every bank code label identical to the Amehnities directory', () => {
    expect(Object.values(codes)).toEqual(directory.names);
  });
  it('saves individual CDD accounts, phones and typed banks without merging people', () => {
    const out = extractKoboMicroplanSchema({ 'group_pi0rq96/cdd_repeat': [cdd('Aisha', '0123456789'), cdd('Musa', '0987654321')] });
    expect(out.cdd_details).toEqual([
      { name: 'Aisha', phone: '08031234567', account_name: 'Aisha account', account_number: '0123456789', bank: 'Local Community Bank' },
      { name: 'Musa', phone: '08031234567', account_name: 'Musa account', account_number: '0987654321', bank: 'Local Community Bank' },
    ]);
    expect(out.cdd_names).toBe('Aisha, Musa');
    expect(out.cdd_account_number).toBe('0123456789');
  });
  it('saves parent FLHF account and resolves the actual workbook choice code', () => {
    expect(extractKoboMicroplanSchema({ group_kj94k59: { FLHF_Account_Name: 'Clinic', FLHF_Account_Number: '0123456789', FLHF_Bank: 'bank_0001' } })).toEqual({ flhf_account_name: 'Clinic', flhf_account_number: '0123456789', flhf_bank: '1Trust Microfinance Bank Limited' });
  });
  it('uses calculated bank labels and handles typed FLHF banks', () => {
    expect(extractKoboMicroplanSchema({ FLHF_Bank: 'bank_0001', FLHF_Bank_Name: '1Trust Microfinance Bank Limited' }).flhf_bank).toBe('1Trust Microfinance Bank Limited');
    expect(extractKoboMicroplanSchema({ FLHF_Bank: 'other', FLHF_Bank_Other: ' New Bank ' }).flhf_bank).toBe('New Bank');
  });
  it('saves independent 1–9 counts including zero without enforcing other age sums', () => {
    expect(extractKoboMicroplanSchema({ 'group_jq2fc22/Trachoma_1_9_Male': '70', 'group_jq2fc22/Trachoma_1_9_Female': 0, _7_14_Years: 2 })).toEqual({ trachoma_1_9_male: 70, trachoma_1_9_female: 0 });
  });
  it('rejects invalid child counts', () => {
    for (const n of [-1, 1.5, 'wrong', true, 100000001]) expect(() => extractKoboMicroplanSchema({ Trachoma_1_9_Male: n })).toThrow();
  });
  it('rejects invalid accounts per individual CDD and FLHF', () => {
    for (const n of ['123456789', '0000000000', 1234567890]) {
      expect(() => extractKoboMicroplanSchema({ FLHF_Account_Number: n })).toThrow();
      expect(() => extractKoboMicroplanSchema({ cdd_repeat: [cdd('Aisha', '0123456789'), { CDD_Name: 'Musa', CDD_Account_Number: n }] })).toThrow();
    }
  });
  it('rejects malformed repeats and incomplete other bank selections', () => {
    expect(() => extractKoboMicroplanSchema({ cdd_repeat: 'bad' })).toThrow();
    expect(() => extractKoboMicroplanSchema({ cdd_repeat: [null] })).toThrow();
    expect(() => extractKoboMicroplanSchema({ FLHF_Bank: 'other' })).toThrow();
  });
  it('allows explicit clearing but leaves omitted legacy fields alone', () => {
    expect(extractKoboMicroplanSchema({})).toEqual({});
    expect(extractKoboMicroplanSchema({ cdd_repeat: [], FLHF_Account_Number: '', Trachoma_1_9_Male: '' })).toMatchObject({ cdd_details: [], cdd_names: '', cdd_account_number: null, flhf_account_number: null, trachoma_1_9_male: null });
  });
  it('keeps CDD repeats scoped to their own community and never treats them as communities', () => {
    const communities = [{ cdd_repeat: [cdd('Aisha', '0123456789')] }, { cdd_repeat: [cdd('Musa', '0987654321')] }];
    expect(extractKoboMicroplanSchema({ group_yf5bw16: communities }).cdd_details).toBeUndefined();
    expect(communities.map(c => extractKoboMicroplanSchema(c).cdd_names)).toEqual(['Aisha', 'Musa']);
  });
  it('supports configured custom field mappings', () => {
    expect(extractKoboMicroplanSchema({ clinic_account: '0123456789', boys: '4' }, { flhf_account_number: 'clinic_account', trachoma_1_9_male: 'boys' })).toEqual({ flhf_account_number: '0123456789', trachoma_1_9_male: 4 });
  });
});
describe('NTD MDA type', () => {
  const trach = { _0_5_Months: 1, _6_Months_6_Years: 2, _7_14_Years: 3, _15_Years: 4, Trachoma_1_9_Male: 5, Trachoma_1_9_Female: 6 };
  it('trachoma MDA saves trachoma total as population', () => {
    expect(extractKoboMicroplanSchema(trach, {}, 'trachoma')).toMatchObject({ mda_type: 'trachoma', estimated_total_population: 10, trachoma_15_plus: 4 });
  });
  it('trachoma MDA rejects missing mandatory fields', () => {
    expect(() => extractKoboMicroplanSchema({ ...trach, Trachoma_1_9_Female: '' }, {}, 'trachoma')).toThrow();
    expect(() => extractKoboMicroplanSchema({ ...trach, _15_Years: undefined, _7_14_Years: '' }, {}, 'trachoma')).toThrow();
  });
  it('standard MDA is recorded from the form choice', () => {
    expect(extractKoboMicroplanSchema({ MDA_Type: 'standard_mda' }).mda_type).toBe('standard');
  });
});
