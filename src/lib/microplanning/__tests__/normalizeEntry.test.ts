import { describe, expect, it } from 'vitest';
import { normalizeMicroplanEntry } from '../normalizeEntry';
import { categoryOf } from '../heatmaps';
import { communityRisk } from '../communityRisk';

describe('Kobo choice values across dashboard consumers', () => {
  it('counts the actual workbook seasonal_access choice as Seasonal everywhere', () => {
    const row = normalizeMicroplanEntry({ accessibility: 'seasonal_access', security_clearance: 'cleared', cdd_names: 'Aisha' });
    expect(row.accessibility).toBe('seasonal');
    expect(categoryOf(row, 'accessibility').key).toBe('seasonal');
    expect(communityRisk(row).score).toBe(15);
    expect(categoryOf({ accessibility: 'seasonal_access' }, 'accessibility').key).toBe('seasonal');
  });
  it('preserves all seven terrain codes from the workbook', () => {
    for (const [code, expected] of [['_flat','flat'],['_hilly','hilly'],['__mountainous','mountainous'],['_riverine','riverine'],['_swampy','swampy'],['_desert','desert'],['forest','forest']]) {
      expect(categoryOf(normalizeMicroplanEntry({ terrain_type: code }), 'terrain').key).toBe(expected);
    }
  });
  it('keeps supplied numeric values including real zeros, without inventing absent counts', () => {
    expect(normalizeMicroplanEntry({ estimated_total_population: '1,234', trachoma_1_9_male: '70', trachoma_1_9_female: 0, pwd_total: null })).toMatchObject({ estimated_total_population: 1234, trachoma_1_9_male: 70, trachoma_1_9_female: 0, pwd_total: null });
  });
  it('does not count a Kobo No answer as a CDD from the community', () => {
    expect(normalizeMicroplanEntry({ cdd_from_community: 'no' }).cdd_from_community).toBe(false);
  });
});