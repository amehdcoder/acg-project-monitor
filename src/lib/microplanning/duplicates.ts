// Duplicate detection for microplan entries.
//
// A duplicate is a record sharing the same geography identity:
//   State → LGA → Ward → FLHF → Community → Settlement
//
// Groups are split into two classes:
//  • "safe"      — every record in the group reports the SAME estimated total
//                  population, so the extras are pure re-submissions and can be
//                  removed automatically (the oldest record is kept).
//  • "conflict"  — the records disagree on estimated total population, so a
//                  human must decide which one to keep. These are flagged but
//                  never auto-removed.

export interface DuplicateCandidate {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  estimated_total_population?: number | null;
  created_at?: string | null;
}

export interface DuplicateGroup<T extends DuplicateCandidate = DuplicateCandidate> {
  key: string;
  label: string;
  records: T[];
  /** true when populations disagree → needs a manual decision */
  conflicting: boolean;
  /** record kept when auto-removing (oldest); null for conflicting groups */
  keepId: string | null;
  /** ids that would be removed by "remove all duplicates" */
  removableIds: string[];
  populations: number[];
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function duplicateKey(e: DuplicateCandidate): string {
  return [e.state, e.lga, e.ward, e.flhf_name, e.community_name, e.settlement_name]
    .map(norm)
    .join("||");
}

const labelOf = (e: DuplicateCandidate) =>
  [e.community_name, e.settlement_name].filter(Boolean).join(" / ") ||
  [e.flhf_name, e.ward, e.lga].filter(Boolean).join(" → ") ||
  "Unnamed record";

export interface DuplicateAnalysis<T extends DuplicateCandidate = DuplicateCandidate> {
  groups: DuplicateGroup<T>[];
  safeGroups: DuplicateGroup<T>[];
  conflictGroups: DuplicateGroup<T>[];
  /** every id that belongs to any duplicate group (for row flagging) */
  duplicateIds: Set<string>;
  /** ids flagged as needing a manual population decision */
  conflictIds: Set<string>;
  /** ids safe to delete in one click */
  removableIds: string[];
  duplicateRecordCount: number;
}

export function analyzeDuplicates<T extends DuplicateCandidate>(entries: T[]): DuplicateAnalysis<T> {
  const buckets = new Map<string, T[]>();
  for (const e of entries) {
    if (!e?.id) continue;
    // Records with no community AND no settlement carry no identity — skip.
    if (!norm(e.community_name) && !norm(e.settlement_name)) continue;
    const key = duplicateKey(e);
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const [key, records] of buckets) {
    if (records.length < 2) continue;
    const ordered = [...records].sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    const populations = ordered.map((r) => Number(r.estimated_total_population ?? 0) || 0);
    const conflicting = new Set(populations).size > 1;
    groups.push({
      key,
      label: labelOf(ordered[0]),
      records: ordered,
      conflicting,
      keepId: conflicting ? null : ordered[0].id,
      removableIds: conflicting ? [] : ordered.slice(1).map((r) => r.id),
      populations,
    });
  }

  groups.sort((a, b) => Number(b.conflicting) - Number(a.conflicting) || a.label.localeCompare(b.label));

  const duplicateIds = new Set<string>();
  const conflictIds = new Set<string>();
  const removableIds: string[] = [];
  let duplicateRecordCount = 0;
  for (const g of groups) {
    duplicateRecordCount += g.records.length;
    for (const r of g.records) {
      duplicateIds.add(r.id);
      if (g.conflicting) conflictIds.add(r.id);
    }
    removableIds.push(...g.removableIds);
  }

  return {
    groups,
    safeGroups: groups.filter((g) => !g.conflicting),
    conflictGroups: groups.filter((g) => g.conflicting),
    duplicateIds,
    conflictIds,
    removableIds,
    duplicateRecordCount,
  };
}

export default analyzeDuplicates;
