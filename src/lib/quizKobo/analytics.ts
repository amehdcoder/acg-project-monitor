/**
 * Pre/Post test analytics for KoboToolbox-ingested quiz submissions.
 * Pure functions so they stay cheap to recompute on every realtime event.
 */
import { tTestPValue } from "@/lib/statisticalInference";
import { BAND_LABELS, scoreBand, type ScoreBand } from "./scoring";
import type { QuizKoboSubmissionRow } from "@/hooks/useQuizKobo";
import type { QuizKoboIdentityFields } from "./scoring";

/**
 * Display name for a synced submission. Falls back to the configured choice
 * list so stored XML codes ("option_2") never surface as "Option 2".
 */
export function displayParticipantName(
  row: QuizKoboSubmissionRow,
  identity?: QuizKoboIdentityFields | null,
): string {
  const field = identity?.nameField;
  const raw = field ? String((row.answers ?? {})[field] ?? "") : "";
  const label = raw ? identity?.nameChoices?.find((c) => String(c.name) === raw)?.label : "";
  return label || row.participant_name || "Unknown";
}

export interface PairedParticipant {
  key: string;
  name: string;
  pre: number | null;
  post: number | null;
  preScore: number | null;
  postScore: number | null;
  maxScore: number;
  delta: number | null;
  trend: "improved" | "declined" | "unchanged" | "incomplete";
  group: string | null;
}

export interface PairedTTest {
  n: number;
  t: number;
  df: number;
  p: number;
  cohensD: number;
  meanPre: number;
  meanPost: number;
  meanGain: number;
  significant: boolean;
}

const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Filter submissions to a single MDA intervention group ("all" = everything). */
export function filterByGroup(rows: QuizKoboSubmissionRow[], group: string): QuizKoboSubmissionRow[] {
  if (!group || group === "all") return rows;
  return rows.filter((r) => (r.intervention_group ?? "") === group);
}

/**
 * Pair Pre-Test with Post-Test records by participant (Name of Independent
 * Monitor). The most recent submission of each type wins.
 */
export function pairParticipants(
  rows: QuizKoboSubmissionRow[],
  identity?: QuizKoboIdentityFields | null,
): PairedParticipant[] {
  const map = new Map<string, PairedParticipant>();
  const sorted = [...rows].sort((a, b) => +new Date(a.submitted_at) - +new Date(b.submitted_at));

  for (const r of sorted) {
    const key = r.participant_key || "unknown";
    const entry = map.get(key) ?? {
      key, name: displayParticipantName(r, identity), pre: null, post: null, preScore: null, postScore: null,
      maxScore: 0, delta: null, trend: "incomplete" as const, group: r.intervention_group,
    };
    // Only the FIRST Pre-Test and FIRST Post-Test of each participant count.
    if (r.assessment_type === "post") {
      if (entry.post == null) { entry.post = Number(r.percentage); entry.postScore = Number(r.score); }
    } else if (entry.pre == null) {
      entry.pre = Number(r.percentage); entry.preScore = Number(r.score);
    }
    entry.maxScore = Math.max(entry.maxScore, Number(r.max_score) || 0);
    entry.name = displayParticipantName(r, identity) || entry.name;
    entry.group = r.intervention_group ?? entry.group;
    map.set(key, entry);
  }

  return [...map.values()].map((p) => {
    if (p.pre != null && p.post != null) {
      const delta = Math.round((p.post - p.pre) * 100) / 100;
      return {
        ...p, delta,
        trend: delta > 0 ? "improved" : delta < 0 ? "declined" : "unchanged",
      } as PairedParticipant;
    }
    return p;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Paired t-test + Cohen's d over participants with both tests. */
export function pairedTTest(pairs: PairedParticipant[]): PairedTTest | null {
  const complete = pairs.filter((p) => p.pre != null && p.post != null);
  const n = complete.length;
  const pre = complete.map((p) => p.pre as number);
  const post = complete.map((p) => p.post as number);
  const meanPre = avg(pre);
  const meanPost = avg(post);
  if (n < 2) {
    return n === 0 ? null : {
      n, t: 0, df: 0, p: 1, cohensD: 0, meanPre, meanPost,
      meanGain: meanPost - meanPre, significant: false,
    };
  }
  const diffs = complete.map((p) => (p.post as number) - (p.pre as number));
  const dMean = avg(diffs);
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - dMean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const t = se > 0 ? dMean / se : 0;
  const df = n - 1;
  const p = se > 0 ? tTestPValue(Math.abs(t), df) : 1;
  const cohensD = sd > 0 ? dMean / sd : 0;
  return {
    n,
    t: Math.round(t * 1000) / 1000,
    df,
    p,
    cohensD: Math.round(cohensD * 1000) / 1000,
    meanPre: Math.round(meanPre * 100) / 100,
    meanPost: Math.round(meanPost * 100) / 100,
    meanGain: Math.round((meanPost - meanPre) * 100) / 100,
    significant: p < 0.05,
  };
}

export interface BandSlice { key: ScoreBand; name: string; value: number }

export function bandBreakdown(rows: QuizKoboSubmissionRow[]): BandSlice[] {
  const counts: Record<ScoreBand, number> = {
    excellent: 0, good: 0, moderate: 0, needs_training: 0,
  };
  for (const r of rows) {
    const band = (r.band as ScoreBand) ?? scoreBand(Number(r.percentage));
    counts[band] = (counts[band] ?? 0) + 1;
  }
  return (Object.keys(counts) as ScoreBand[])
    .map((k) => ({ key: k, name: BAND_LABELS[k], value: counts[k] }))
    .filter((s) => s.value > 0);
}

export interface ImprovementSummary {
  improved: number;
  declined: number;
  unchanged: number;
  incomplete: number;
  prePassRate: number;
  postPassRate: number;
  preCount: number;
  postCount: number;
}

export function improvementSummary(
  pairs: PairedParticipant[],
  rows: QuizKoboSubmissionRow[],
  passMark: number,
): ImprovementSummary {
  const pre = rows.filter((r) => r.assessment_type === "pre");
  const post = rows.filter((r) => r.assessment_type === "post");
  const rate = (list: QuizKoboSubmissionRow[]) =>
    list.length ? Math.round((list.filter((r) => Number(r.percentage) >= passMark).length / list.length) * 1000) / 10 : 0;
  return {
    improved: pairs.filter((p) => p.trend === "improved").length,
    declined: pairs.filter((p) => p.trend === "declined").length,
    unchanged: pairs.filter((p) => p.trend === "unchanged").length,
    incomplete: pairs.filter((p) => p.trend === "incomplete").length,
    prePassRate: rate(pre),
    postPassRate: rate(post),
    preCount: pre.length,
    postCount: post.length,
  };
}
