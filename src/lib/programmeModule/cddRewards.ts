// CDD recognition & reward scheme for MMDP case search.
//
// Points are derived from the case-search register itself — nothing extra is
// stored, so the scheme can be re-tuned at any time without a migration and
// can never drift from the underlying cases.
//
// The design deliberately rewards *confirmed* output rather than volume: a CDD
// who brings ten unconfirmed names scores far less than one who brings four
// true cases, and a precision bonus discourages speculative referrals.

import { useMemo } from "react";
import type { CddRow, PotentialCaseRow } from "./cddCaseSearch";

export interface RewardRules {
  /** Points for a case a clinician confirmed as a true MMDP case. */
  confirmedPoints: number;
  /** Extra points once the person is registered with a Case ID at a facility. */
  registeredBonus: number;
  /** Points for a case still awaiting the clinician (effort recognised). */
  pendingPoints: number;
  /** Bonus when precision is at or above the target, with enough cases found. */
  precisionBonus: number;
  precisionTarget: number;
  precisionMinCases: number;
}

export const DEFAULT_REWARD_RULES: RewardRules = {
  confirmedPoints: 10,
  registeredBonus: 5,
  pendingPoints: 1,
  precisionBonus: 15,
  precisionTarget: 70,
  precisionMinCases: 5,
};

export interface RewardTier {
  key: string;
  label: string;
  /** Minimum points to reach this tier. */
  min: number;
  tone: "neutral" | "info" | "success" | "warning";
  /** What the programme offers at this level — shown to supervisors. */
  recognition: string;
}

export const REWARD_TIERS: RewardTier[] = [
  { key: "starter", label: "Starter", min: 0, tone: "neutral", recognition: "Newly trained — mentoring visit" },
  { key: "bronze", label: "Bronze", min: 30, tone: "info", recognition: "Certificate of participation" },
  { key: "silver", label: "Silver", min: 80, tone: "info", recognition: "Airtime stipend + certificate" },
  { key: "gold", label: "Gold", min: 160, tone: "success", recognition: "Performance stipend + LGA recognition" },
  { key: "champion", label: "Champion", min: 300, tone: "success", recognition: "Refresher training slot + state award" },
];

export const tierFor = (points: number): RewardTier =>
  [...REWARD_TIERS].reverse().find((t) => points >= t.min) || REWARD_TIERS[0];

export const nextTierFor = (points: number): RewardTier | null =>
  REWARD_TIERS.find((t) => t.min > points) || null;

export interface CddReward {
  cddId: string;
  name: string;
  facilityId: string;
  community: string;
  found: number;
  pending: number;
  confirmed: number;
  registered: number;
  notACase: number;
  /** Share of clinician-reviewed cases that turned out to be true cases. */
  precision: number;
  precisionEarned: boolean;
  points: number;
  tier: RewardTier;
  nextTier: RewardTier | null;
  /** Points still needed for the next tier — 0 at the top tier. */
  toNextTier: number;
  /** Position in the leaderboard, 1-based, ties share a rank. */
  rank: number;
}

/** Cases counted as confirmed output: confirmed, referred on, or registered. */
const CONFIRMED_STATUSES = new Set(["confirmed", "referred", "registered"]);

const withinPeriod = (c: PotentialCaseRow, fromISO?: string) =>
  !fromISO || (c.search_date || c.created_at || "") >= fromISO;

/**
 * Scores every CDD from the cases they found. `fromISO` limits scoring to a
 * period (e.g. the current quarter) so rewards can be paid cycle by cycle.
 */
export const computeRewards = (
  cdds: CddRow[],
  cases: PotentialCaseRow[],
  rules: RewardRules = DEFAULT_REWARD_RULES,
  fromISO?: string,
): CddReward[] => {
  const scored = cdds.map((cdd) => {
    const mine = cases.filter((c) => c.cdd_id === cdd.id && withinPeriod(c, fromISO));
    const by = (s: string) => mine.filter((c) => c.status === s).length;
    const pending = by("pending");
    const notACase = by("not_a_case");
    const registered = by("registered");
    const confirmed = mine.filter((c) => CONFIRMED_STATUSES.has(c.status)).length;
    const reviewed = confirmed + notACase;
    const precision = reviewed ? Math.round((confirmed / reviewed) * 100) : 0;
    const precisionEarned =
      reviewed >= rules.precisionMinCases && precision >= rules.precisionTarget;

    const points =
      confirmed * rules.confirmedPoints
      + registered * rules.registeredBonus
      + pending * rules.pendingPoints
      + (precisionEarned ? rules.precisionBonus : 0);

    const tier = tierFor(points);
    const nextTier = nextTierFor(points);
    return {
      cddId: cdd.id,
      name: cdd.full_name,
      facilityId: cdd.facility_id,
      community: cdd.community || cdd.ward || "",
      found: mine.length,
      pending,
      confirmed,
      registered,
      notACase,
      precision,
      precisionEarned,
      points,
      tier,
      nextTier,
      toNextTier: nextTier ? Math.max(0, nextTier.min - points) : 0,
      rank: 0,
    } as CddReward;
  });

  scored.sort((a, b) =>
    b.points - a.points || b.confirmed - a.confirmed || a.name.localeCompare(b.name));

  let lastPoints = Number.NaN;
  let lastRank = 0;
  scored.forEach((r, i) => {
    if (r.points !== lastPoints) { lastRank = i + 1; lastPoints = r.points; }
    r.rank = lastRank;
  });
  return scored;
};

/** Plain-language explanation of how the points were earned. */
export const rewardBreakdown = (r: CddReward, rules: RewardRules = DEFAULT_REWARD_RULES) => {
  const parts: string[] = [];
  if (r.confirmed) parts.push(`${r.confirmed} confirmed × ${rules.confirmedPoints}`);
  if (r.registered) parts.push(`${r.registered} registered × ${rules.registeredBonus}`);
  if (r.pending) parts.push(`${r.pending} awaiting review × ${rules.pendingPoints}`);
  if (r.precisionEarned) parts.push(`accuracy bonus ${rules.precisionBonus}`);
  return parts.join(" · ") || "No points yet";
};

/** ISO date for the start of the current reward cycle (calendar quarter). */
export const currentCycleStart = (d = new Date()) => {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(Date.UTC(d.getFullYear(), q, 1)).toISOString().slice(0, 10);
};

export const CYCLE_OPTIONS = [
  { value: "cycle", label: "This reward cycle (quarter)" },
  { value: "all", label: "All time" },
];

/** Memoised scoring for the panel. */
export const useCddRewards = (
  cdds: CddRow[],
  cases: PotentialCaseRow[],
  period: string,
) =>
  useMemo(
    () => computeRewards(cdds, cases, DEFAULT_REWARD_RULES,
      period === "cycle" ? currentCycleStart() : undefined),
    [cdds, cases, period],
  );

/** Scheme-wide figures for the header of the rewards card. */
export const rewardSummary = (rows: CddReward[]) => ({
  scoring: rows.filter((r) => r.points > 0).length,
  totalPoints: rows.reduce((s, r) => s + r.points, 0),
  confirmed: rows.reduce((s, r) => s + r.confirmed, 0),
  topTier: rows.filter((r) => r.tier.key === "gold" || r.tier.key === "champion").length,
});
