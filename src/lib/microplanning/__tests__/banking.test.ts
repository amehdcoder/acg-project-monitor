import { describe, expect, it } from 'vitest';
import { bankNameSchema, mergeBankNames, microplanBankingSchema, nigerianAccountNumberError } from '../banking';
import { validatedMicroplanBanking } from '../../../../supabase/functions/_shared/microplanBanking';

describe('CDD and FLHF Nigerian banking details', () => {
  it.each(['cdd', 'flhf'])('accepts a 10-digit %s account while retaining its leading zeros', prefix => {
    const input = { [`${prefix}_account_name`]: 'Aisha Musa', [`${prefix}_account_number`]: '0123456789', [`${prefix}_bank`]: 'Access Bank' };
    expect(microplanBankingSchema.safeParse(input).success).toBe(true);
    expect(validatedMicroplanBanking(input)[`${prefix}_account_number` as 'cdd_account_number' | 'flhf_account_number']).toBe('0123456789');
  });
  it.each(['cdd', 'flhf'])('rejects non-Nigerian %s account formats in the form and server', prefix => {
    for (const number of ['123456789', '12345678901', '12345a7890', '+123456789', '123 456789', '0000000000']) {
      const input = { [`${prefix}_account_number`]: number };
      expect(microplanBankingSchema.safeParse(input).success).toBe(false);
      expect(() => validatedMicroplanBanking(input)).toThrow();
    }
  });
  it('keeps banking details optional on existing and new entries', () => {
    expect(microplanBankingSchema.safeParse({}).success).toBe(true);
    expect(validatedMicroplanBanking({}).cdd_account_number).toBeNull();
    expect(validatedMicroplanBanking({ flhf_account_number: '' }).flhf_account_number).toBeNull();
    expect(nigerianAccountNumberError('')).toBeNull();
  });
  it('accepts typed banks not in the directory and deduplicates shared selections', () => {
    expect(bankNameSchema.parse('  Community Savings Bank  ')).toBe('Community Savings Bank');
    expect(mergeBankNames(['Access Bank'], ['ACCESS BANK', 'Community Savings Bank'])).toEqual(['Access Bank', 'Community Savings Bank']);
    expect(validatedMicroplanBanking({ cdd_bank: 'Community Savings Bank' }).cdd_bank).toBe('Community Savings Bank');
  });
  it('bounds both account names and typed bank names on both save paths', () => {
    for (const field of ['cdd_account_name', 'cdd_bank', 'flhf_account_name', 'flhf_bank']) {
      expect(microplanBankingSchema.safeParse({ [field]: 'A'.repeat(151) }).success).toBe(false);
      expect(() => validatedMicroplanBanking({ [field]: 'A'.repeat(151) })).toThrow();
    }
    expect(bankNameSchema.safeParse('A'.repeat(151)).success).toBe(false);
  });
  it('rejects numeric accounts rather than silently losing leading zeros', () => {
    expect(microplanBankingSchema.safeParse({ cdd_account_number: 1234567890 }).success).toBe(false);
    expect(() => validatedMicroplanBanking({ flhf_account_number: 1234567890 })).toThrow('must be text');
  });
});