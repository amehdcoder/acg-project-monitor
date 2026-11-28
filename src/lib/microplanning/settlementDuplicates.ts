import type { DuplicateCandidate } from './duplicates';

export type SettlementDuplicateRow = DuplicateCandidate & Record<string, unknown>;
const identity = ['state', 'lga', 'ward', 'flhf_name', 'community_name', 'settlement_name'] as const;
const ignored = new Set(['id', 'created_at', 'updated_at', 'created_by', 'external_ref', 'idempotency_key', ...identity]);
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;

/** Counts extra named copies under one facility; cleanup also requires community and identical evidence. */
export function analyzeSettlementDuplicates(rows: SettlementDuplicateRow[]) {
  const facilityGroups = new Map<string, SettlementDuplicateRow[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.id || seen.has(row.id) || !identity.every(f => norm(row[f]))) continue;
    seen.add(row.id);
    const key = JSON.stringify([row.project_id, row.year_of_microplanning, row.campaign_type,
      ...['state', 'lga', 'ward', 'flhf_name', 'settlement_name'].map(f => norm(row[f]))]);
    const group = facilityGroups.get(key) ?? [];
    group.push(row); facilityGroups.set(key, group);
  }
  let extraCopies = 0, groups = 0;
  const pairs: { keepId: string; removeId: string }[] = [];
  for (const group of facilityGroups.values()) {
    if (group.length < 2) continue;
    extraCopies += group.length - 1; groups++;
    const evidenceGroups = new Map<string, SettlementDuplicateRow[]>();
    for (const row of group) {
      const evidence = Object.fromEntries(Object.entries(row).filter(([k]) => !ignored.has(k)));
      const key = JSON.stringify([norm(row.community_name), canonical(evidence)]);
      const bucket = evidenceGroups.get(key) ?? [];
      bucket.push(row); evidenceGroups.set(key, bucket);
    }
    for (const bucket of evidenceGroups.values()) {
      bucket.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.id.localeCompare(b.id));
      const original = bucket[0];
      if (original) bucket.slice(1).forEach(row => pairs.push({ keepId: original.id, removeId: row.id }));
    }
  }
  return { extraCopies, groups, pairs, reviewCopies: extraCopies - pairs.length };
}