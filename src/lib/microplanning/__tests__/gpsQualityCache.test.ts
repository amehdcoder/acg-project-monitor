import { describe, expect, it } from 'vitest';
import { gpsQualitySignature, matchingGpsQuality } from '../gpsQualityCache';
import { analyseGpsQuality } from '../gpsQuality';

const entry = { id: 'a', state: 'Kano', lga: 'Rano', community_name: 'Village', community_latitude: 11.5, community_longitude: 8.5 };
describe('GPS review input identity', () => {
  it('reuses results when refreshed records have unchanged data', () => {
    const signature = gpsQualitySignature([entry]);
    const report = analyseGpsQuality([entry], []);
    expect(matchingGpsQuality({ signature, report }, gpsQualitySignature([{ ...entry }]))).toBe(report);
  });
  it('ignores unrelated population and banking edits', () => {
    expect(gpsQualitySignature([{ ...entry, population: 500 } as typeof entry])).toBe(gpsQualitySignature([entry]));
  });
  it('invalidates new and deleted records', () => {
    const signature = gpsQualitySignature([entry]);
    expect(gpsQualitySignature([entry, { ...entry, id: 'b' }])).not.toBe(signature);
    expect(gpsQualitySignature([])).not.toBe(signature);
  });
  it('invalidates each GPS or finding field when it changes', () => {
    const signature = gpsQualitySignature([entry]);
    for (const field of ['state', 'lga', 'ward', 'community_name', 'settlement_name', 'flhf_name', 'community_latitude', 'community_longitude', 'settlement_latitude', 'settlement_longitude', 'flhf_latitude', 'flhf_longitude'] as const) {
      expect(gpsQualitySignature([{ ...entry, [field]: field.includes('itude') ? 12 : 'Changed' }])).not.toBe(signature);
    }
  });
  it('rejects saved results for different inputs or analysis versions', () => {
    const signature = gpsQualitySignature([entry]);
    const report = analyseGpsQuality([entry], []);
    expect(matchingGpsQuality({ signature: 'old-version', report }, signature)).toBeNull();
    expect(matchingGpsQuality({ signature, report }, gpsQualitySignature([]))).toBeNull();
  });
});