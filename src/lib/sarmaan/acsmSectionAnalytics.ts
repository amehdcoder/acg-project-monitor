// SARMAAN ACSM & MDA Supervision Dashboard — per-section analytics.
// ---------------------------------------------------------------------------
// Derives the section-level views requested for the dashboard directly from the
// checklist submissions so everything stays realtime:
//   • Communities supervised (KPI)
//   • Communities with refusals / hesitancy (table)
//   • Per-question response bar charts BY LGA for sections B, C, E, F, G
//   • Community Awareness Validation coverage statistics BY LGA (section D)
//   • Adverse-events observed vs referred statistics (section F)
//   • Communities with adverse events observed (table)
//   • Summary & corrective actions (table)

import {
  ACSM_FIELD, IEC_ITEMS, MOBILIZATION_ITEMS, DRUG_ITEMS, ELIGIBILITY_ITEMS,
  DOCUMENTATION_ITEMS, AWARENESS_SAMPLE_SIZE, type CheckItem,
} from "@/lib/sarmaan/acsmChecklist";
import { readVal, readStr, type AcsmSub, type NameToId } from "@/lib/sarmaan/acsmDashboardData";

const isYes = (v: unknown) => String(v).trim().toLowerCase() === "yes";
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Canonicalise a Yes/No/Partly/N-A answer regardless of value/label storage. */
export type YNKey = "Yes" | "No" | "Partly" | "N/A";
function ynOf(v: unknown): YNKey | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "yes" || s === "y" || s === "true") return "Yes";
  if (s === "no" || s === "n" || s === "false") return "No";
  if (s.startsWith("part")) return "Partly";
  if (s === "n/a" || s === "n_a" || s === "na" || s === "not applicable") return "N/A";
  return null;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/* ---------------------------------------------- Communities supervised KPI */
export function communitiesSupervised(subs: AcsmSub[], maps: Record<string, NameToId>): number {
  const set = new Set<string>();
  for (const s of subs) {
    const c = readStr(s, ACSM_FIELD.community, maps).trim();
    const key = c
      ? `${readStr(s, ACSM_FIELD.lga, maps)}|${readStr(s, ACSM_FIELD.ward, maps)}|${c}`.toLowerCase()
      : "";
    if (key) set.add(key);
  }
  return set.size;
}

/* ------------------------------------------- Per-question response by LGA */
export interface QuestionLgaChart {
  name: string;
  label: string;
  data: {
    lga: string;
    Yes: number; No: number; Partly: number; "N/A": number;
    total: number; yesPct: number;
  }[];
  totals: { Yes: number; No: number; Partly: number; "N/A": number };
}

export function buildQuestionByLga(
  subs: AcsmSub[],
  maps: Record<string, NameToId>,
  items: CheckItem[],
): QuestionLgaChart[] {
  return items.map((item) => {
    const byLga = new Map<string, { Yes: number; No: number; Partly: number; "N/A": number }>();
    const totals = { Yes: 0, No: 0, Partly: 0, "N/A": 0 };
    for (const s of subs) {
      const key = ynOf(readVal(s, item.name, maps));
      if (!key) continue;
      const lga = readStr(s, ACSM_FIELD.lga, maps).trim() || "Unspecified";
      if (!byLga.has(lga)) byLga.set(lga, { Yes: 0, No: 0, Partly: 0, "N/A": 0 });
      byLga.get(lga)![key]++;
      totals[key]++;
    }
    const data = [...byLga.entries()]
      .map(([lga, c]) => {
        const total = c.Yes + c.No + c.Partly + c["N/A"];
        return { lga, ...c, total, yesPct: pct(c.Yes, total) };
      })
      .sort((a, b) => a.lga.localeCompare(b.lga));
    return { name: item.name, label: item.label, data, totals };
  });
}

export const IEC_QUESTIONS = IEC_ITEMS;
export const MOBILIZATION_QUESTIONS = MOBILIZATION_ITEMS;
export const DRUG_QUESTIONS = DRUG_ITEMS;
export const ELIGIBILITY_QUESTIONS = ELIGIBILITY_ITEMS;
export const DOCUMENTATION_QUESTIONS = DOCUMENTATION_ITEMS;

/* ------------------------------- Community Awareness Validation by LGA (D) */
export interface AwarenessLgaStat {
  lga: string;
  visits: number;
  sample: number;       // caregivers sampled
  aware: number;
  partial: number;
  notAware: number;
  awarePct: number;
  agePct: number;       // % who know eligible age
  freePct: number;      // % who know medicine is free
  ciLow: number;        // 95% CI lower bound for awareness proportion
  ciHigh: number;
}

export interface AwarenessCoverage {
  byLga: AwarenessLgaStat[];
  overall: Omit<AwarenessLgaStat, "lga">;
}

function awarenessOfSubs(subs: AcsmSub[], maps: Record<string, NameToId>) {
  let sample = 0, aware = 0, partial = 0, notAware = 0, ageYes = 0, freeYes = 0, heardYes = 0;
  for (const s of subs) {
    for (let r = 1; r <= AWARENESS_SAMPLE_SIZE; r++) {
      const heard = readVal(s, `aw_${r}_heard`, maps);
      if (heard === undefined || heard === "") continue;
      sample++;
      const knowsAge = isYes(readVal(s, `aw_${r}_knows_age`, maps));
      const knowsFree = isYes(readVal(s, `aw_${r}_knows_free`, maps));
      if (knowsAge) ageYes++;
      if (knowsFree) freeYes++;
      if (!isYes(heard)) { notAware++; continue; }
      heardYes++;
      if (knowsAge && knowsFree) aware++; else partial++;
    }
  }
  const awarePct = pct(aware, sample);
  // Wald 95% CI on the awareness proportion.
  const p = sample > 0 ? aware / sample : 0;
  const se = sample > 0 ? Math.sqrt((p * (1 - p)) / sample) : 0;
  const ciLow = Math.max(0, Math.round((p - 1.96 * se) * 100));
  const ciHigh = Math.min(100, Math.round((p + 1.96 * se) * 100));
  return {
    sample, aware, partial, notAware,
    awarePct, agePct: pct(ageYes, sample), freePct: pct(freeYes, sample),
    ciLow, ciHigh,
  };
}

export function buildAwarenessCoverage(subs: AcsmSub[], maps: Record<string, NameToId>): AwarenessCoverage {
  const byLgaSubs = new Map<string, AcsmSub[]>();
  for (const s of subs) {
    const lga = readStr(s, ACSM_FIELD.lga, maps).trim() || "Unspecified";
    if (!byLgaSubs.has(lga)) byLgaSubs.set(lga, []);
    byLgaSubs.get(lga)!.push(s);
  }
  const byLga: AwarenessLgaStat[] = [...byLgaSubs.entries()]
    .map(([lga, list]) => ({ lga, visits: list.length, ...awarenessOfSubs(list, maps) }))
    .filter((r) => r.sample > 0)
    .sort((a, b) => b.awarePct - a.awarePct);
  return { byLga, overall: { visits: subs.length, ...awarenessOfSubs(subs, maps) } };
}

/* ---------------------------------------- Adverse events statistics (F) */
export interface AdverseStats {
  totalObserved: number;
  totalReferred: number;
  referralPct: number;
  visitsWithObserved: number;
  meanPerVisit: number;
  visits: number;
  byLga: { lga: string; observed: number; referred: number; referralPct: number }[];
}

export function buildAdverseStats(subs: AcsmSub[], maps: Record<string, NameToId>): AdverseStats {
  let totalObserved = 0, totalReferred = 0, visitsWithObserved = 0;
  const byLga = new Map<string, { observed: number; referred: number }>();
  for (const s of subs) {
    const obs = num(readVal(s, ACSM_FIELD.aesObserved, maps));
    const ref = num(readVal(s, ACSM_FIELD.aesReferred, maps));
    totalObserved += obs; totalReferred += ref;
    if (obs > 0) visitsWithObserved++;
    const lga = readStr(s, ACSM_FIELD.lga, maps).trim() || "Unspecified";
    if (!byLga.has(lga)) byLga.set(lga, { observed: 0, referred: 0 });
    const g = byLga.get(lga)!; g.observed += obs; g.referred += ref;
  }
  return {
    totalObserved, totalReferred,
    referralPct: pct(totalReferred, totalObserved),
    visitsWithObserved,
    meanPerVisit: subs.length ? Math.round((totalObserved / subs.length) * 100) / 100 : 0,
    visits: subs.length,
    byLga: [...byLga.entries()]
      .map(([lga, g]) => ({ lga, ...g, referralPct: pct(g.referred, g.observed) }))
      .filter((r) => r.observed > 0 || r.referred > 0)
      .sort((a, b) => b.observed - a.observed),
  };
}

/* --------------------------------------------------- Community listings */
export interface CommunityRow {
  id: string;
  lga: string;
  ward: string;
  apex: string;
  community: string;
  team: string;
  extra?: Record<string, string | number>;
}

function baseRow(s: AcsmSub, maps: Record<string, NameToId>): CommunityRow {
  return {
    id: s.id,
    lga: readStr(s, ACSM_FIELD.lga, maps) || "—",
    ward: readStr(s, ACSM_FIELD.ward, maps) || "—",
    apex: readStr(s, ACSM_FIELD.wardApexFacility, maps) || "—",
    community: readStr(s, ACSM_FIELD.community, maps) || "—",
    team: readStr(s, ACSM_FIELD.teamSupervised, maps) || "—",
  };
}

/** Refusal / vaccine-hesitancy communities: any caregiver in the awareness
 *  sample who had NOT heard, OR who heard but does not know the medicine is
 *  free (the leading rumor / refusal driver). */
export function buildRefusalCommunities(subs: AcsmSub[], maps: Record<string, NameToId>): CommunityRow[] {
  const rows: CommunityRow[] = [];
  for (const s of subs) {
    let refusals = 0, sample = 0;
    for (let r = 1; r <= AWARENESS_SAMPLE_SIZE; r++) {
      const heard = readVal(s, `aw_${r}_heard`, maps);
      if (heard === undefined || heard === "") continue;
      sample++;
      const knowsFree = isYes(readVal(s, `aw_${r}_knows_free`, maps));
      if (!isYes(heard) || !knowsFree) refusals++;
    }
    if (refusals > 0) {
      rows.push({ ...baseRow(s, maps), extra: { Refusals: refusals, "Sample": sample } });
    }
  }
  return rows.sort((a, b) => Number(b.extra?.Refusals ?? 0) - Number(a.extra?.Refusals ?? 0));
}

/** Communities where adverse events were observed (>0 or "Yes"). */
export function buildAdverseCommunities(subs: AcsmSub[], maps: Record<string, NameToId>): CommunityRow[] {
  const rows: CommunityRow[] = [];
  for (const s of subs) {
    const rawObs = readVal(s, ACSM_FIELD.aesObserved, maps);
    const obs = num(rawObs);
    const yes = obs > 0 || isYes(rawObs);
    if (!yes) continue;
    const ref = num(readVal(s, ACSM_FIELD.aesReferred, maps));
    rows.push({ ...baseRow(s, maps), extra: { Observed: obs || "Yes", "Referred": ref } });
  }
  return rows.sort((a, b) => Number(b.extra?.Observed ?? 0) - Number(a.extra?.Observed ?? 0));
}

/** Summary & corrective actions listing. */
export interface ActionRow extends CommunityRow {
  issues: string;
  corrective: string;
  responsible: string;
  deadline: string;
}

export function buildSummaryActions(subs: AcsmSub[], maps: Record<string, NameToId>): ActionRow[] {
  const rows: ActionRow[] = [];
  for (const s of subs) {
    const issues = readStr(s, ACSM_FIELD.issues, maps).trim();
    const corrective = readStr(s, ACSM_FIELD.corrective, maps).trim();
    if (!issues && !corrective) continue;
    rows.push({
      ...baseRow(s, maps),
      issues: issues || "—",
      corrective: corrective || "—",
      responsible: readStr(s, ACSM_FIELD.responsible, maps) || "—",
      deadline: readStr(s, ACSM_FIELD.deadline, maps) || "—",
    });
  }
  return rows;
}
