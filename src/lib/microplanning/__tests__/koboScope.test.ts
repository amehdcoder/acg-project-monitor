import { describe, expect, it } from 'vitest';
import { communityRepeatItems, mappedScope, pickNumber } from '../../../../supabase/functions/_shared/microplanRepeatItem';
import { extractKoboMicroplanSchema } from '../../../../supabase/functions/_shared/koboMicroplanSchema';

describe('updated XLSForm scoped extraction', () => {
  it('finds nested communities rather than their individual CDD repeats', () => {
    const row = { group_population: { Total_Population: 160 }, group_name: { Community_Name: 'A' }, cdd_repeat: [{ CDD_Name: 'Musa' }] };
    expect(communityRepeatItems({ outer: { group_yf5bw16: [row] } })).toEqual([row]);
    expect(communityRepeatItems({ cdd_repeat: [{ CDD_Name: 'Musa' }] })).toEqual([]);
  });
  it('applies custom numeric mappings inside each community and preserves zero', () => {
    const mapping = { estimated_total_population: 'outer/residents', trachoma_1_9_male: 'boys' };
    const items = [{ residents: '1,234', boys: 70 }, { residents: 0, boys: 0 }].map(row => mappedScope(row, mapping));
    expect(items.map(row => pickNumber(row, ['estimated_total_population']))).toEqual([1234, 0]);
    expect(items.map(row => extractKoboMicroplanSchema(row).trachoma_1_9_male)).toEqual([70, 0]);
  });
});