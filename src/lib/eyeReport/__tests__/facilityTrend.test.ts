import { describe, expect, it } from 'vitest';
import { FACILITY_TREND_DEFAULTS, buildFacilityTrend, filterFacilityTrend } from '../facilityTrend';
import { emptySummary, type EyeReportRow } from '../definition';
const rows = [
  { id: 'a', state: 'Jigawa', lga: 'Dutse', facility_name: 'Clinic A', report_date: '2026-11-01', summary: emptySummary() },
  { id: 'b', state: 'Yobe', lga: 'Fika', facility_name: 'Clinic B', report_date: '2026-11-01', summary: emptySummary() },
  { id: 'c', state: 'Jigawa', lga: 'Dutse', facility_name: 'Clinic A', report_date: '2026-11-03', summary: emptySummary() },
] as EyeReportRow[];
describe('Facility submission trend', () => {
  it('defaults to daily', () => { expect(FACILITY_TREND_DEFAULTS.grain).toBe('day'); });
  it('defaults to every State, LGA and facility', () => {
    expect(FACILITY_TREND_DEFAULTS).toMatchObject({ state: '', lga: '', facility: '' });
    expect(filterFacilityTrend(rows, FACILITY_TREND_DEFAULTS.state, FACILITY_TREND_DEFAULTS.lga, FACILITY_TREND_DEFAULTS.facility)).toHaveLength(3);
  });
  it('counts both facilities on the same day and retains empty intervening days', () => {
    expect(buildFacilityTrend(rows, 'day').map(r => r.Submissions)).toEqual([2, 0, 1]);
  });
  it('filters an individual facility without losing aggregate geography selection', () => {
    expect(filterFacilityTrend(rows, '', '', 'Clinic B').map(r => r.id)).toEqual(['b']);
  });
  it('includes recent reports beyond 400 daily buckets', () => {
    const data = buildFacilityTrend([rows[0], { ...rows[2], report_date: '2028-01-01' }], 'day');
    expect(data.at(-1)).toMatchObject({ date: '2028-01-01', Submissions: 1 });
  });
});