import { describe, expect, it } from 'vitest';
import { normalizeMicroplanChoice } from '../../../../supabase/functions/_shared/microplanChoices';
import { normalizeMicroplanEntry } from '../normalizeEntry';

describe('CDD census population source', () => {
  it('retains the same source value for Kobo codes, typed labels and dashboard normalization', () => {
    expect(normalizeMicroplanChoice('population_source', 'CDD Census/Census Update')).toBe('cdd_census_census_update');
    expect(normalizeMicroplanChoice('population_source', 'cdd_census_census_update')).toBe('cdd_census_census_update');
    expect(normalizeMicroplanEntry({ population_source: 'cdd_census_census_update' }).population_source).toBe('cdd_census_census_update');
  });
});