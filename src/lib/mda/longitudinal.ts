/**
 * MDA Supervisory Checklist — longitudinal follow-up analytics & duplicate detection
 * ────────────────────────────────────────────────────────────────────────
 * Two responsibilities, both driven entirely from real captured fields (never
 * hard-coded to a single project's question names):
 *
 *  1. buildFollowUpTimeline() — turns the three follow-up modules (MDA
 *     Completion, Commodities, Adverse Reactions) into a clear longitudinal
 *     trend of OUTCOMES over time (per ISO-week), plus a per-community timeline
 *     so a clicked community shows how its follow-up outcomes evolved.
 *
 *  2. findDuplicateCommunities() — flags communities visited more than once
 *     within the SAME State → LGA → Ward → FLHF → Community, listing who
 *     visited, when, and exactly which questions they answered differently.
 */
import { communityKey } from "./dashboardData";
import { MdaQuestionIndex, geo, isYes, type ASubmission, type ResolvedQ } from "./analyses";
import {
  getMdaFollowUpGroupName,
  MDA_FOLLOWUP_COMPLETION,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_ADVERSE,
} from "@/lib/mdaFollowUp";

const stripTags = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => stripTags(v).toLowerCase();

// ── ISO-week helpers (Mon-anchored) ──────────────────────────────────────
function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
function weekKey(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return isoWeekStart(d).toISOString().slice(0, 10);
}
function weekLabel(key: string): string {
  return new Date(key + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type FollowUpCanonical =
  | typeof MDA_FOLLOWUP_COMPLETION
  | typeof MDA_FOLLOWUP_COMMODITIES
  | typeof MDA_FOLLOWUP_ADVERSE;

/** Classify a submission as one of the follow-up modules using form group names. */
function classifyFollowUp(
  s: ASubmission,
  followUpFields: Map<string, FollowUpCanonical>,
): FollowUpCanonical | null {
  const counts = new Map<FollowUpCanonical, number>();
  for (const k of Object.keys(s.data || {})) {
    const c = followUpFields.get(k);
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best: FollowUpCanonical | null = null;
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  return best;
}

/** Build a {fieldName -> canonical module} index from the form question tree. */
export function buildFollowUpFieldMap(questions: any[]): Map<string, FollowUpCanonical> {
  const map = new Map<string, FollowUpCanonical>();
  const walkGroup = (item: any, canonical: FollowUpCanonical | null) => {
    for (const q of item.questions || []) {
      if (Array.isArray(q.questions) && !q.type) {
        walkGroup(q, canonical ?? (getMdaFollowUpGroupName(q) as FollowUpCanonical | null));
      } else if (q?.name && canonical) {
        map.set(q.name, canonical);
      }
    }
  };
  for (const item of questions || []) {
    if (Array.isArray(item.questions) && !item.type) {
      const canonical = getMdaFollowUpGroupName(item) as FollowUpCanonical | null;
      if (canonical) walkGroup(item, canonical);
    }
  }
  return map;
}

// ── Longitudinal outcome timeline ────────────────────────────────────────
export interface TrendRow {
  key: string;
  label: string;
  /** % of MDA Completion follow-ups whose status is "completed" */
  completionRate: number | null;
  /** % of Commodities follow-ups reporting an inadequacy/issue */
  commodityIssueRate: number | null;
  /** % of Adverse-reaction follow-ups that were managed */
  adverseManagedRate: number | null;
  completionN: number;
  commodityN: number;
  adverseN: number;
}

export interface CommunityTimelineEvent {
  ts: number;
  date: string;
  module: FollowUpCanonical;
  moduleLabel: string;
  submitter: string;
  outcome: string;
  positive: boolean | null;
}

export interface FollowUpTimeline {
  trend: TrendRow[];
  /** per community-key, chronological list of follow-up outcome events */
  byCommunity: Map<string, CommunityTimelineEvent[]>;
  hasData: boolean;
}

const MODULE_LABEL: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: "MDA Completion",
  [MDA_FOLLOWUP_COMMODITIES]: "Commodities",
  [MDA_FOLLOWUP_ADVERSE]: "Adverse Reactions",
};

/**
 * Produce the longitudinal outcome trend and per-community event timelines.
 * Outcome resolution is label-driven via MdaQuestionIndex so every project's
 * follow-up questions map to the correct insight.
 */
export function buildFollowUpTimeline(
  submissions: ASubmission[],
  questions: any[],
  maxWeeks = 16,
): FollowUpTimeline {
  const idx = new MdaQuestionIndex(questions);
  const fieldMap = buildFollowUpFieldMap(questions);

  // Resolve the determinant question per module by tolerant label matching.
  const qStatus = idx.find([/status of mda/i, /mda.*completed/i, /completion status/i]);
  const qCommodity = idx.find([
    /commodit.*inadequate/i, /inadequate.*commodit/i, /commodit.*shortage/i,
    /medicine.*insufficient/i, /sufficient.*medicine/i,
  ]);
  const qAdverseManaged = idx.find([/been managed/i, /adverse.*managed/i, /case.*managed/i, /person.*okay/i]);

  const followUps = submissions.filter((s) => classifyFollowUp(s, fieldMap));

  const byWeek = new Map<string, {
    compTotal: number; compDone: number;
    commTotal: number; commIssue: number;
    advTotal: number; advManaged: number;
  }>();
  const byCommunity = new Map<string, CommunityTimelineEvent[]>();

  const ensureWeek = (k: string) => {
    if (!byWeek.has(k)) byWeek.set(k, { compTotal: 0, compDone: 0, commTotal: 0, commIssue: 0, advTotal: 0, advManaged: 0 });
    return byWeek.get(k)!;
  };

  for (const fu of followUps) {
    const canonical = classifyFollowUp(fu, fieldMap)!;
    const wk = weekKey(fu.submittedAt);
    const ts = fu.submittedAt ? new Date(fu.submittedAt).getTime() : 0;
    const submitter = stripTags(fu.submitter || (fu.data as any)?.supervisor_name) || "Unknown";
    const d = fu.data || {};

    let outcome = "";
    let positive: boolean | null = null;

    if (canonical === MDA_FOLLOWUP_COMPLETION) {
      const raw = qStatus ? d[qStatus.key] : undefined;
      outcome = idx.label(qStatus, raw) || "Recorded";
      const done = norm(idx.label(qStatus, raw)).includes("complet");
      positive = done;
      if (wk) { const w = ensureWeek(wk); w.compTotal++; if (done) w.compDone++; }
    } else if (canonical === MDA_FOLLOWUP_COMMODITIES) {
      const raw = qCommodity ? d[qCommodity.key] : undefined;
      const txt = idx.label(qCommodity, raw);
      const issue = !!txt && norm(txt) !== "none" && norm(txt) !== "no" && norm(txt) !== "" && !isYes(raw) ;
      outcome = txt ? (issue ? `Issue: ${txt}` : "Adequate") : "Recorded";
      positive = txt ? !issue : null;
      if (wk) { const w = ensureWeek(wk); w.commTotal++; if (issue) w.commIssue++; }
    } else if (canonical === MDA_FOLLOWUP_ADVERSE) {
      const raw = qAdverseManaged ? d[qAdverseManaged.key] : undefined;
      const managed = isYes(raw);
      outcome = qAdverseManaged ? (managed ? "Managed" : "Reported, unmanaged") : "Reported";
      positive = managed;
      if (wk) { const w = ensureWeek(wk); w.advTotal++; if (managed) w.advManaged++; }
    }

    const ck = communityKey(fu as any);
    if (!byCommunity.has(ck)) byCommunity.set(ck, []);
    byCommunity.get(ck)!.push({
      ts,
      date: fu.submittedAt ? new Date(fu.submittedAt).toLocaleDateString() : "—",
      module: canonical,
      moduleLabel: MODULE_LABEL[canonical] || canonical,
      submitter,
      outcome,
      positive,
    });
  }

  for (const events of byCommunity.values()) events.sort((a, b) => a.ts - b.ts);

  const weeks = [...byWeek.keys()].sort().slice(-maxWeeks);
  const trend: TrendRow[] = weeks.map((k) => {
    const w = byWeek.get(k)!;
    return {
      key: k,
      label: weekLabel(k),
      completionRate: w.compTotal ? Math.round((w.compDone / w.compTotal) * 100) : null,
      commodityIssueRate: w.commTotal ? Math.round((w.commIssue / w.commTotal) * 100) : null,
      adverseManagedRate: w.advTotal ? Math.round((w.advManaged / w.advTotal) * 100) : null,
      completionN: w.compTotal,
      commodityN: w.commTotal,
      adverseN: w.advTotal,
    };
  });

  return { trend, byCommunity, hasData: followUps.length > 0 };
}

// ── Duplicate community detection ─────────────────────────────────────────
export interface DuplicateVisit {
  id: string;
  submitter: string;
  date: string;
  ts: number;
}
export interface FieldDiff {
  label: string;
  values: { submitter: string; value: string }[];
}
export interface DuplicateGroup {
  key: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  visits: DuplicateVisit[];
  /** number of distinct submitters across the duplicate visits */
  distinctSubmitters: number;
  /** questions where the duplicate visits disagree */
  diffs: FieldDiff[];
  /** severity score for conditional formatting (higher = worse) */
  severity: number;
}

/**
 * Flag communities (same State/LGA/Ward/FLHF/Community) visited more than once
 * by the Community Checklist, listing visitors, timestamps and the exact
 * questions whose answers diverge between the duplicate visits.
 */
export function findDuplicateCommunities(
  checklist: ASubmission[],
  questions: any[],
): DuplicateGroup[] {
  // Group by a 5-part key (ignore settlement so genuine re-visits collapse).
  const groupKey = (s: ASubmission) =>
    [
      norm(geo(s, "state")),
      norm(geo(s, "lga")),
      norm(geo(s, "ward")),
      norm(geo(s, "flhf")),
      norm(geo(s, "community")),
    ].join("|");

  const buckets = new Map<string, ASubmission[]>();
  for (const s of checklist) {
    const k = groupKey(s);
    // require at least a community name to be meaningful
    if (!norm(geo(s, "community"))) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(s);
  }

  const idx = new MdaQuestionIndex(questions);
  // Flatten leaf questions for diff labelling.
  const leaf: ResolvedQ[] = (idx as any).qs as ResolvedQ[];
  const leafByKey = new Map(leaf.map((q) => [q.key, q]));

  const out: DuplicateGroup[] = [];
  for (const [k, subs] of buckets) {
    if (subs.length < 2) continue;
    const ordered = [...subs].sort(
      (a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime(),
    );
    const visits: DuplicateVisit[] = ordered.map((s) => ({
      id: s.id,
      submitter: stripTags(s.submitter || (s.data as any)?.supervisor_name) || "Unknown",
      date: s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—",
      ts: s.submittedAt ? new Date(s.submittedAt).getTime() : 0,
    }));

    // Compute field-level differences across visits.
    const allFieldKeys = new Set<string>();
    for (const s of ordered) for (const fk of Object.keys(s.data || {})) allFieldKeys.add(fk);

    const diffs: FieldDiff[] = [];
    for (const fk of allFieldKeys) {
      const q = leafByKey.get(fk);
      if (!q) continue; // only diff real questions (skips geography/meta noise)
      const perVisit = ordered.map((s) => ({
        submitter: stripTags(s.submitter) || "Unknown",
        value: idx.label(q, (s.data as any)?.[fk]) || "—",
      }));
      const distinct = new Set(perVisit.map((v) => norm(v.value)));
      distinct.delete(""); distinct.delete("—");
      if (distinct.size > 1) {
        diffs.push({ label: q.label || fk, values: perVisit });
      }
    }

    const distinctSubmitters = new Set(visits.map((v) => norm(v.submitter))).size;
    const severity = (visits.length - 1) * 2 + diffs.length + (distinctSubmitters > 1 ? 3 : 0);

    out.push({
      key: k,
      state: geo(ordered[0], "state"),
      lga: geo(ordered[0], "lga"),
      ward: geo(ordered[0], "ward"),
      flhf: geo(ordered[0], "flhf"),
      community: geo(ordered[0], "community"),
      visits,
      distinctSubmitters,
      diffs,
      severity,
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
}
