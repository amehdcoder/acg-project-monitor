import { describe, expect, it } from 'vitest';
import { analyzeSettlementDuplicates as analyze } from '../settlementDuplicates';

const row = (id: string, patch = {}) => ({ id, project_id: 'p', state: 'Kano', lga: 'Gabasawa', ward: 'A', flhf_name: 'Clinic A', community_name: 'Village A', settlement_name: 'Hamlet A', estimated_total_population: 10, year_of_microplanning: 2026, created_at: '2026-11-01', ...patch });
describe('settlement duplicate counts and cleanup', () => {
  it('counts two extra copies from three records, keeping one original', () => {
    const result = analyze([row('a'), row('b'), row('c')]);
    expect(result.extraCopies).toBe(2);
    expect(result.pairs).toEqual([{keepId: 'a', removeId: 'b'}, {keepId: 'a', removeId: 'c'}]);
  });
  it('counts repeated names under one FLHF but never removes across communities', () => {
    const result = analyze([row('a'), row('b', {community_name: 'Village B'})]);
    expect(result.extraCopies).toBe(1); expect(result.pairs).toEqual([]);
  });
  it('never combines different FLHFs, geographies, projects or reporting years', () => {
    for (const patch of [{flhf_name: 'Clinic B'}, {ward: 'B'}, {lga: 'Other'}, {state: 'Jigawa'}, {project_id: 'q'}, {year_of_microplanning: 2025}, {campaign_type: 'Other'}]) {
      expect(analyze([row('a'), row('b', patch)]).extraCopies).toBe(0);
    }
  });
  it('ignores case and spacing without fuzzy-merging different settlement names', () => {
    expect(analyze([row('a'), row('b', {settlement_name: ' HAMLET   A '})]).pairs).toHaveLength(1);
    expect(analyze([row('a'), row('b', {settlement_name: 'Hamlet B'})]).extraCopies).toBe(0);
  });
  it('preserves different population, GPS, child counts, banking and nested evidence', () => {
    for (const patch of [{estimated_total_population: 11}, {settlement_latitude: 12}, {trachoma_boys_5_9: 3}, {cdd_account_number: '0123456789'}, {extra_metadata: {reported: true}}]) {
      const result = analyze([row('a'), row('b', patch)]);
      expect(result.extraCopies).toBe(1); expect(result.pairs).toHaveLength(0);
    }
  });
  it('excludes missing identities and repeated delivery of the same ID', () => {
    expect(analyze([row('a'), row('a')]).extraCopies).toBe(0);
    expect(analyze([row('a', {flhf_name: ''}), row('b', {flhf_name: ''})]).extraCopies).toBe(0);
  });
});