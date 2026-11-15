import { describe, it, expect } from 'vitest';
import { validatedCddDetails, cddLegacyColumns, cddDetailsFromLegacy } from '../banking';
describe('repeat CDD details', () => {
  it('keeps each CDD separately and drops blank rows', () => {
    const list = validatedCddDetails([{ name: 'Aisha', phone: '0803', account_name: 'Aisha B', account_number: '0123456789', bank: 'Access Bank' }, { name: '', phone: '', account_name: '', account_number: '', bank: '' }, { name: 'Musa', phone: '0805', account_name: '', account_number: '', bank: '' }]);
    expect(list.map(c => c.name)).toEqual(['Aisha', 'Musa']);
    expect(cddLegacyColumns(list).cdd_names).toBe('Aisha, Musa');
  });
  it('rejects a non-10-digit account for an individual CDD', () => {
    expect(() => validatedCddDetails([{ name: 'Musa', account_number: '12345' }])).toThrow(/CDD 1/);
  });
  it('requires a name when other CDD details are given', () => {
    expect(() => validatedCddDetails([{ phone: '0803' }])).toThrow(/name/);
  });
  it('splits older comma-separated records into rows', () => {
    expect(cddDetailsFromLegacy({ cdd_names: 'A, B', cdd_phone_numbers: '1, 2' }).map(c => [c.name, c.phone])).toEqual([['A', '1'], ['B', '2']]);
  });
});
