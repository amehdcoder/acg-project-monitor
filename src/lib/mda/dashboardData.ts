/**
 * MDA dashboard data preparation
 * ────────────────────────────────────────────────────────────────────────
 * The Integrated MDA Supervisory Checklist stores TWO kinds of rows in
 * `form_submissions` under the same form:
 *   1. Community Checklist visits (the primary supervisory records).
 *   2. Follow-up submissions (MDA Completion / Commodities / Adverse Reactions)
 *      filled later against a community that was already visited.
 *
 * If the dashboard treats every row as a "visit" it badly misinforms the
 * reader: it inflates the visit count, dilutes compliance gauges, and never
 * reflects the *updated* answers captured during follow-up.
 *
 * This module fixes that. It:
 *   • classifies each row as a primary checklist visit or a follow-up,
 *   • merges follow-up answers back onto the matching community record so the
 *     dashboard shows the latest (followed-up) response for linked questions,
 *   • reports how many communities have had each follow-up completed.
 *
 * Nothing here is hard-coded to a specific field — it is driven entirely by the
 * form's current groups/questions.
 */
import { isMdaFollowUpGroup, getMdaFollowUpGroupName } from "@/lib/mdaFollowUp";

export interface RawOption {
  value?: string;
  label?: string;
  linkedSourceValues?: string[];
}
export interface RawQuestion {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  questions?: RawQuestion[]; // present when this is a group
  linkedSourceField?: string;
  options?: RawOption[];
}

export interface RawSubmission {
  id: string;
  projectId?: string | null;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  data?: Record<string, any>;
  [k: string]: any;
}

const norm = (v: any) => String(v ?? "").trim().toLowerCase();

function pick(data: Record<string, any> | undefined, keys: string[]): string {
  if (!data) return "";
  for (const k of keys) {
    const v = data[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** A stable key identifying a single community/settlement across submissions. */
export function communityKey(s: RawSubmission): string {
  const d = s.data || {};
  return [
    norm(s.state ?? pick(d, ["state"])),
    norm(s.lga ?? pick(d, ["lga", "LGA", "local_government", "local_government_area"])),
    norm(s.ward ?? pick(d, ["ward", "ward_name"])),
    norm(pick(d, ["flhf_name", "flhf"])),
    norm(pick(d, ["community_name", "community"])),
    norm(pick(d, ["settlement_name", "settlement"])),
  ].join("|");
}

interface GroupInfo {
  canonical: string | null;
  questionNames: string[];
  /** map of follow-up question name -> linked source question name */
  linkMap: Record<string, string>;
  /** map of follow-up question name -> { follow-up option value -> source value(s) } */
  optionLinkMap: Record<string, Record<string, string[]>>;
}

function collectGroups(questions: RawQuestion[]): { followUp: GroupInfo[]; checklistKeys: Set<string> } {
  const followUp: GroupInfo[] = [];
  const checklistKeys = new Set<string>();
  for (const item of questions || []) {
    const isGroup = Array.isArray(item.questions) && !item.type;
    if (isGroup && isMdaFollowUpGroup(item as any)) {
      const linkMap: Record<string, string> = {};
      const optionLinkMap: Record<string, Record<string, string[]>> = {};
      const names: string[] = [];
      for (const q of item.questions || []) {
        if (!q?.name) continue;
        names.push(q.name);
        if (q.linkedSourceField) linkMap[q.name] = q.linkedSourceField;
        // Capture option-level links for choice follow-up questions.
        const optMap: Record<string, string[]> = {};
        for (const o of q.options || []) {
          if (o?.value && Array.isArray(o.linkedSourceValues) && o.linkedSourceValues.length) {
            optMap[o.value] = o.linkedSourceValues;
          }
        }
        if (Object.keys(optMap).length) optionLinkMap[q.name] = optMap;
      }
      followUp.push({
        canonical: getMdaFollowUpGroupName(item as any),
        questionNames: names,
        linkMap,
        optionLinkMap,
      });
    } else if (isGroup) {
      for (const q of item.questions || []) if (q?.name) checklistKeys.add(q.name);
    } else if (item.type && item.name) {
      checklistKeys.add(item.name);
    }
  }
  return { followUp, checklistKeys };
}

export interface PreparedMdaData<T extends RawSubmission = RawSubmission> {
  /** Primary checklist visits with follow-up answers merged in. */
  checklist: T[];
  /** Raw follow-up submissions (kept for follow-up-specific insights). */
  followUps: T[];
  /** Per follow-up module: how many distinct communities have completed it. */
  followUpCoverage: { canonical: string; communities: number }[];
  /** Communities (distinct) that have at least one checklist visit. */
  communityCount: number;
  hasFollowUpGroups: boolean;
}

/**
 * Classify and merge MDA submissions so the dashboard reflects reality:
 * one record per community visit, updated with the latest follow-up answers.
 */
export function prepareMdaData<T extends RawSubmission>(
  submissions: T[],
  questions: RawQuestion[],
): PreparedMdaData<T> {
  const { followUp, checklistKeys } = collectGroups(questions);
  const followUpOnly = new Set<string>();
  const followUpLinkMap: Record<string, string> = {};
  const followUpOptionLinkMap: Record<string, Record<string, string[]>> = {};
  for (const g of followUp) {
    for (const n of g.questionNames) if (!checklistKeys.has(n)) followUpOnly.add(n);
    Object.assign(followUpLinkMap, g.linkMap);
    Object.assign(followUpOptionLinkMap, g.optionLinkMap);
  }

  const hasFollowUpGroups = followUp.length > 0;

  const checklist: T[] = [];
  const followUps: T[] = [];

  for (const s of submissions) {
    const keys = Object.keys(s.data || {});
    const isFollowUp =
      hasFollowUpGroups && keys.some((k) => followUpOnly.has(k));
    if (isFollowUp) followUps.push(s);
    else checklist.push(s);
  }

  // Index checklist visits by community for follow-up merging.
  const byCommunity = new Map<string, T>();
  for (const c of checklist) {
    const k = communityKey(c);
    const prev = byCommunity.get(k);
    // keep the most recent checklist visit per community as the merge target
    if (!prev || new Date(c.submittedAt || 0) > new Date(prev.submittedAt || 0)) {
      byCommunity.set(k, c);
    }
  }

  // Sort follow-ups oldest→newest so the latest answer wins on merge.
  const orderedFollowUps = [...followUps].sort(
    (a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime(),
  );

  // Merge: a follow-up's linked answers overwrite the checklist determinant
  // response; non-linked follow-up answers are also surfaced on the record.
  const mergedTargets = new Set<T>();
  for (const fu of orderedFollowUps) {
    const target = byCommunity.get(communityKey(fu));
    if (!target) continue;
    if (!mergedTargets.has(target)) {
      // clone data once so we don't mutate the original submission object
      (target as any).data = { ...(target.data || {}) };
      mergedTargets.add(target);
    }
    const fd = fu.data || {};
    for (const [followUpName, sourceField] of Object.entries(followUpLinkMap)) {
      const v = fd[followUpName];
      if (v !== undefined && v !== null && String(v) !== "") {
        // Translate the follow-up answer to the linked source option value(s)
        // when option-level links are defined, so the determinant matches the
        // original Community Checklist option vocabulary.
        const optMap = followUpOptionLinkMap[followUpName];
        let sourceValue: any = v;
        if (optMap) {
          const tokens = Array.isArray(v) ? v.map(String) : String(v).split(/\s+/);
          const mapped: string[] = [];
          for (const tk of tokens) {
            for (const sv of optMap[tk] || []) if (!mapped.includes(sv)) mapped.push(sv);
          }
          if (mapped.length) sourceValue = mapped.join(" ");
        }
        // Update the determinant (linked) checklist field with the mapped value.
        (target.data as any)[sourceField] = sourceValue;
        (target.data as any)[followUpName] = v;
      }
    }
    // Carry any extra follow-up question answers onto the record too.
    for (const fkName of Object.keys(fd)) {
      if (followUpOnly.has(fkName)) {
        const v = fd[fkName];
        if (v !== undefined && v !== null && String(v) !== "") (target.data as any)[fkName] = v;
      }
    }
  }

  // Follow-up coverage per module (distinct communities).
  const followUpCoverage = followUp.map((g) => {
    const set = new Set<string>();
    for (const fu of followUps) {
      const has = g.questionNames.some(
        (n) => fu.data?.[n] !== undefined && fu.data?.[n] !== null && String(fu.data?.[n]) !== "",
      );
      if (has) set.add(communityKey(fu));
    }
    return { canonical: g.canonical || "follow_up", communities: set.size };
  });

  return {
    checklist,
    followUps,
    followUpCoverage,
    communityCount: byCommunity.size,
    hasFollowUpGroups,
  };
}
