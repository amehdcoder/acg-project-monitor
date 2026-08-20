/**
 * Pre/Post pairing consistency check.
 *
 * Flags participants who submitted only one of the two assessments so data
 * gaps are visible before any pre/post inference is trusted.
 */
import type { PairedParticipant } from "./analytics";

export interface PairingGap {
  key: string;
  name: string;
  group: string | null;
  missing: "post" | "pre";
  have: number;
}

export interface PairingConsistency {
  total: number;
  complete: number;
  missingPost: PairingGap[];
  missingPre: PairingGap[];
  gaps: PairingGap[];
  completionRate: number;
  /** True when at least one participant is missing an assessment. */
  hasGaps: boolean;
}

export function pairingConsistency(pairs: PairedParticipant[]): PairingConsistency {
  const gaps: PairingGap[] = [];
  let complete = 0;

  for (const p of pairs) {
    const hasPre = p.pre != null;
    const hasPost = p.post != null;
    if (hasPre && hasPost) { complete += 1; continue; }
    if (!hasPre && !hasPost) continue;
    gaps.push({
      key: p.key,
      name: p.name,
      group: p.group,
      missing: hasPre ? "post" : "pre",
      have: (hasPre ? p.pre : p.post) as number,
    });
  }

  gaps.sort((a, b) => a.name.localeCompare(b.name));
  const total = pairs.length;
  return {
    total,
    complete,
    missingPost: gaps.filter((g) => g.missing === "post"),
    missingPre: gaps.filter((g) => g.missing === "pre"),
    gaps,
    completionRate: total ? Math.round((complete / total) * 1000) / 10 : 0,
    hasGaps: gaps.length > 0,
  };
}
