import type { GpsQualityEntry, GpsQualityReport } from './gpsQuality';

// Exact, collision-free input identity: refreshed objects and unrelated edits
// must not repeat the costly boundary analysis. Bump on algorithm/boundary changes.
export const GPS_QUALITY_REVISION = 'cod-ab-v1-audit-v1';
const fields = [
  'id', 'state', 'lga', 'ward', 'community_name', 'settlement_name', 'flhf_name',
  'community_latitude', 'community_longitude', 'settlement_latitude',
  'settlement_longitude', 'flhf_latitude', 'flhf_longitude',
] as const satisfies readonly (keyof GpsQualityEntry)[];

export function gpsQualitySignature(entries: readonly GpsQualityEntry[]): string {
  // Preserve order: conflicting duplicate records can affect which finding wins.
  return JSON.stringify([GPS_QUALITY_REVISION, entries.map(e => fields.map(f => e[f] ?? null))]);
}

export interface SavedGpsQuality { signature: string; report: GpsQualityReport }

export function matchingGpsQuality(saved: SavedGpsQuality | null, signature: string): GpsQualityReport | null {
  return saved?.signature === signature ? saved.report : null;
}