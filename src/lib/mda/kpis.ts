/**
 * Integrated MDA Supervisory Checklist — KPI engine
 * ────────────────────────────────────────────────────────────────────────
 * Computes every headline KPI, the longitudinal linkage funnel and the three
 * LGA-level heatmaps strictly per the Owner's published definitions, resolving
 * each determinant question by LABEL (never a hard-coded field name) so the
 * same engine works across projects (Jigawa Schisto, ENDFUND/FCT, …).
 *
 * Definitions implemented (verbatim):
 *  1. Communities Supervised = total checklist submissions (all users, all time).
 *  2. MDA Completed % = checklist submissions whose "Status of MDA" = Completed
 *                       ÷ total checklist submissions.
 *  3. Sufficient Medicine % = checklist submissions whose "Does CDD have
 *                       sufficient medicine?" = Yes ÷ total checklist submissions.
 *  4. Follow-up Coverage % = communities that required ANY follow-up and were
 *                       followed up (deduplicated) ÷ communities requiring any
 *                       follow-up.
 *  5. Adverse Cases Managed % = communities with SAE complaint = Yes that were
 *                       followed up in the Adverse Reaction module with
 *                       "Has it been managed?" = Yes ÷ communities with SAE = Yes.
 *  6. Red-flag Sites = distinct communities where availability of CDD/Teacher,
 *                       register, dose pole, sufficient medicine OR treatment
 *                       commenced = No, OR SAE complaint = Yes.
 *  7. Funnel: completion / commodities / adverse follow-up counts (and % of the
 *             communities that actually require each follow-up).
 *  8. Heatmaps: per-LGA category breakdown at first visit + follow-up coverage.
 */
import { MdaQuestionIndex, type ResolvedQ } from "./analyses";
import { communityKey } from "./dashboardData";
import {
  getMdaFollowUpGroupName,
  isMdaFollowUpGroup,
  MDA_FOLLOWUP_COMPLETION,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_ADVERSE,
} from "@/lib/mdaFollowUp";

export interface KSubmission {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  data?: Record<string, any>;
}

interface KQuestion {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  options?: any[];
  questions?: KQuestion[];
}

const strip = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => strip(v).toLowerCase();
const YES = new Set(["yes", "true", "1", "available", "present", "y"]);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// ── status candidate keys that may hold a first-visit "Status of MDA" answer
//    on older/orphaned form revisions (kept for backward compatibility). ──
const LEGACY_STATUS_KEYS = ["status_of_mda", "q-1782326272193-cbcu", "q-1782249543014-40dq"];

export interface HeatCell {
  value: number; // count at latest/first visit for this category
  followed: number; // how many of those were followed up
}
export interface HeatRow {
  lga: string;
  total: number; // communities in this LGA relevant to the heatmap
  cells: Record<string, HeatCell>;
}
export interface Heatmap {
  categories: string[];
  rows: HeatRow[];
  colTotals: Record<string, HeatCell>;
}

export interface MdaKpis {
  // headline
  communitiesSupervised: number; // = total checklist submissions
  distinctCommunities: number;
  mdaCompleted: { done: number; total: number; pct: number };
  sufficientMedicine: { yes: number; total: number; pct: number };
  followUpCoverage: { followed: number; needing: number; pct: number };
  adverseManaged: { managed: number; reported: number; pct: number };
  redFlagSites: number;
  // funnel
  funnel: {
    checklist: number;
    completion: { value: number; base: number; pct: number };
    commodities: { value: number; base: number; pct: number };
    adverse: { value: number; base: number; pct: number };
  };
  // heatmaps
  completionHeatmap: Heatmap;
  commoditiesHeatmap: Heatmap;
  adverseHeatmap: Heatmap;
  // whether the form actually has follow-up modules
  hasFollowUps: boolean;
}

const STATUS_ORDER = ["Not Started", "Ongoing", "Halted", "Completed"];
const COMMODITY_CATS = ["Treatment Register", "Dose Pole/Tape", "Sufficient Medicine"];

export function computeMdaKpis(submissions: KSubmission[], questions: KQuestion[]): MdaKpis {
  const qIndex = new MdaQuestionIndex(questions as any);
  const labelOf = (q: ResolvedQ | null, raw: any) => qIndex.label(q, raw);

  // ── Resolve determinant questions by label ──
  const dq = {
    status: qIndex.find([/current\s*status\s*of\s*mda/i, /status\s*of\s*mda/i, /mda\s*status/i]),
    commenced: qIndex.find([/treatment\s*commenced/i, /has\s*treatment\s*commenced/i]),
    cdd: qIndex.find([/are\s*there\s*cdd/i, /cdd.*teacher.*in/i, /availab.*(cdd|teacher)/i]),
    registers: qIndex.find([/treatment\s*registers?\s*availab/i, /registers?\s*availab/i]),
    dose: qIndex.find([/dose\s*pole.*availab/i, /is\s*dose\s*pole/i, /dose\s*pole\s*\/?\s*tape/i]),
    suffMed: qIndex.find([/(cdd|teacher).*sufficient\s*medicine/i, /sufficient\s*medicine/i]),
    sae: qIndex.find([/side\s*effects?\s*during\s*mda/i, /complain.*side\s*effect/i, /adverse.*complain/i]),
    aeType: qIndex.find([/type\s*of\s*side\s*effect/i, /type\s*of\s*adverse/i]),
    managed: qIndex.find([/has\s*it\s*been\s*managed/i, /been\s*managed/i, /adverse.*manage/i]),
  };

  // ── Module → follow-up question name sets (to classify follow-up rows) ──
  const moduleQuestions: Record<string, Set<string>> = {};
  const followUpOnly = new Set<string>();
  const checklistKeys = new Set<string>();
  for (const item of questions || []) {
    const isGroup = Array.isArray(item.questions) && !item.type;
    if (isGroup && isMdaFollowUpGroup(item as any)) {
      const canonical = getMdaFollowUpGroupName(item as any);
      if (!canonical) continue;
      const set = (moduleQuestions[canonical] ||= new Set());
      for (const q of item.questions || []) if (q?.name || q?.id) set.add(String(q.name || q.id));
    } else if (isGroup) {
      for (const q of item.questions || []) if (q?.name || q?.id) checklistKeys.add(String(q.name || q.id));
    } else if (item.type && (item.name || item.id)) {
      checklistKeys.add(String(item.name || item.id));
    }
  }
  for (const set of Object.values(moduleQuestions))
    for (const k of set) if (!checklistKeys.has(k)) followUpOnly.add(k);
  const hasFollowUps = Object.keys(moduleQuestions).length > 0;

  const classifyFollowUp = (s: KSubmission): string | null => {
    const keys = Object.keys(s.data || {});
    let best: string | null = null;
    let bestHits = 0;
    for (const [canonical, names] of Object.entries(moduleQuestions)) {
      const hits = keys.filter((k) => names.has(k)).length;
      if (hits > bestHits) { bestHits = hits; best = canonical; }
    }
    return best;
  };
  const isFollowUpRow = (s: KSubmission) =>
    hasFollowUps && Object.keys(s.data || {}).some((k) => followUpOnly.has(k));

  // ── Group submissions by community ──
  interface Com {
    key: string;
    state: string; lga: string; ward: string; community: string;
    checklist: KSubmission[]; // ascending by date
    fu: Record<string, KSubmission[]>; // canonical -> ascending
  }
  const coms = new Map<string, Com>();
  const geo = (s: KSubmission, kind: "state" | "lga" | "ward" | "community") => {
    const d = s.data || {};
    if (kind === "state") return strip(s.state || d.state || d.state_name);
    if (kind === "lga") return strip(s.lga || d.lga || d.LGA || d.local_government || d.local_government_area);
    if (kind === "ward") return strip(s.ward || d.ward || d.ward_name);
    return strip(d.community || d.community_name || d.settlement_name || d.settlement);
  };
  const ts = (s: KSubmission) => (s.submittedAt ? new Date(s.submittedAt).getTime() : 0);

  let totalChecklist = 0;
  for (const s of submissions) {
    const k = communityKey(s as any);
    let c = coms.get(k);
    if (!c) {
      c = { key: k, state: "", lga: "", ward: "", community: "", checklist: [], fu: {} };
      coms.set(k, c);
    }
    c.state = geo(s, "state") || c.state;
    c.lga = geo(s, "lga") || c.lga;
    c.ward = geo(s, "ward") || c.ward;
    c.community = geo(s, "community") || c.community;
    if (isFollowUpRow(s)) {
      const canonical = classifyFollowUp(s) || "other";
      (c.fu[canonical] ||= []).push(s);
    } else {
      c.checklist.push(s);
      totalChecklist++;
    }
  }
  for (const c of coms.values()) {
    c.checklist.sort((a, b) => ts(a) - ts(b));
    for (const arr of Object.values(c.fu)) arr.sort((a, b) => ts(a) - ts(b));
  }
  const allComs = [...coms.values()].filter((c) => c.checklist.length > 0);

  // ── Per-community value helpers ──
  // First non-empty checklist value for a determinant question.
  const firstChecklistVal = (c: Com, q: ResolvedQ | null): any => {
    if (!q) return undefined;
    for (const s of c.checklist) {
      const v = s.data?.[q.key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
  };
  const isYes = (q: ResolvedQ | null, raw: any) => {
    if (raw === undefined || raw === null || raw === "") return false;
    const lbl = norm(labelOf(q, raw)) || norm(raw);
    return YES.has(lbl);
  };
  const isNo = (q: ResolvedQ | null, raw: any) => {
    if (raw === undefined || raw === null || raw === "") return false;
    const lbl = norm(labelOf(q, raw)) || norm(raw);
    return lbl === "no" || lbl === "false" || lbl === "0";
  };

  // Latest known MDA status for a community (follow-up wins, then checklist,
  // then legacy/orphaned keys). Returns normalized status label.
  const latestStatus = (c: Com): string => {
    const candidates: { t: number; raw: any }[] = [];
    const push = (s: KSubmission, raw: any) => {
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") candidates.push({ t: ts(s), raw });
    };
    for (const s of c.fu[MDA_FOLLOWUP_COMPLETION] || []) if (dq.status) push(s, s.data?.[dq.status.key]);
    for (const s of c.checklist) {
      if (dq.status) push(s, s.data?.[dq.status.key]);
      for (const lk of LEGACY_STATUS_KEYS) push(s, s.data?.[lk]);
    }
    if (!candidates.length) return "";
    candidates.sort((a, b) => a.t - b.t);
    const raw = candidates[candidates.length - 1].raw;
    return norm(labelOf(dq.status, raw) || raw);
  };
  const statusTitle = (n: string) =>
    STATUS_ORDER.find((o) => norm(o) === n) || (n ? n.replace(/\b\w/g, (m) => m.toUpperCase()) : "Unknown");

  // ── Headline KPIs (submission-level for 1-3, community-level for 4-6) ──
  // 1. Communities Supervised
  const communitiesSupervised = totalChecklist;
  const distinctCommunities = allComs.length;

  // 2. MDA Completed — per checklist submission, using its community's status.
  let completedDone = 0;
  for (const c of allComs) {
    const st = latestStatus(c);
    if (st === "completed") completedDone += c.checklist.length;
  }
  const mdaCompleted = { done: completedDone, total: totalChecklist, pct: pct(completedDone, totalChecklist) };

  // 3. Sufficient Medicine — checklist submissions answering Yes (first visit).
  let suffYes = 0;
  for (const s of submissions) {
    if (isFollowUpRow(s)) continue;
    if (dq.suffMed && isYes(dq.suffMed, s.data?.[dq.suffMed.key])) suffYes++;
  }
  const sufficientMedicine = { yes: suffYes, total: totalChecklist, pct: pct(suffYes, totalChecklist) };

  // Requirement flags + follow-up presence per community
  const hasFu = (c: Com, canonical: string) => (c.fu[canonical]?.length || 0) > 0;
  const needsCompletion = (c: Com) => latestStatus(c) !== "completed";
  const needsCommodities = (c: Com) =>
    isNo(dq.registers, firstChecklistVal(c, dq.registers)) ||
    isNo(dq.dose, firstChecklistVal(c, dq.dose)) ||
    isNo(dq.suffMed, firstChecklistVal(c, dq.suffMed));
  const saeYes = (c: Com) => isYes(dq.sae, firstChecklistVal(c, dq.sae));
  const needsAdverse = (c: Com) => saeYes(c);

  // 4. Follow-up Coverage (deduplicated across modules)
  let needingAny = 0, followedAny = 0;
  for (const c of allComs) {
    const needs = needsCompletion(c) || needsCommodities(c) || needsAdverse(c);
    if (!needs) continue;
    needingAny++;
    const followed =
      (needsCompletion(c) && hasFu(c, MDA_FOLLOWUP_COMPLETION)) ||
      (needsCommodities(c) && hasFu(c, MDA_FOLLOWUP_COMMODITIES)) ||
      (needsAdverse(c) && hasFu(c, MDA_FOLLOWUP_ADVERSE));
    if (followed) followedAny++;
  }
  const followUpCoverage = { followed: followedAny, needing: needingAny, pct: pct(followedAny, needingAny) };

  // 5. Adverse Cases Managed
  let aeReported = 0, aeManagedCount = 0;
  for (const c of allComs) {
    if (!saeYes(c)) continue;
    aeReported++;
    const fu = (c.fu[MDA_FOLLOWUP_ADVERSE] || []);
    const managed = fu.some((s) => dq.managed && isYes(dq.managed, s.data?.[dq.managed.key]));
    if (managed) aeManagedCount++;
  }
  const adverseManaged = { managed: aeManagedCount, reported: aeReported, pct: pct(aeManagedCount, aeReported) };

  // 6. Red-flag sites (distinct communities)
  let redFlagSites = 0;
  for (const c of allComs) {
    const flagged =
      isNo(dq.cdd, firstChecklistVal(c, dq.cdd)) ||
      isNo(dq.registers, firstChecklistVal(c, dq.registers)) ||
      isNo(dq.dose, firstChecklistVal(c, dq.dose)) ||
      isNo(dq.suffMed, firstChecklistVal(c, dq.suffMed)) ||
      isNo(dq.commenced, firstChecklistVal(c, dq.commenced)) ||
      saeYes(c);
    if (flagged) redFlagSites++;
  }

  // 7. Funnel
  const completionNeeding = allComs.filter(needsCompletion);
  const commoditiesNeeding = allComs.filter(needsCommodities);
  const adverseNeeding = allComs.filter(needsAdverse);
  const completionDone = completionNeeding.filter((c) => hasFu(c, MDA_FOLLOWUP_COMPLETION)).length;
  const commoditiesDone = commoditiesNeeding.filter((c) => hasFu(c, MDA_FOLLOWUP_COMMODITIES)).length;
  const adverseDone = adverseNeeding.filter((c) => hasFu(c, MDA_FOLLOWUP_ADVERSE)).length;
  const funnel = {
    checklist: distinctCommunities,
    completion: { value: completionDone, base: completionNeeding.length, pct: pct(completionDone, completionNeeding.length) },
    commodities: { value: commoditiesDone, base: commoditiesNeeding.length, pct: pct(commoditiesDone, commoditiesNeeding.length) },
    adverse: { value: adverseDone, base: adverseNeeding.length, pct: pct(adverseDone, adverseNeeding.length) },
  };

  // ── 8. Heatmaps (rows = LGA / Area Council) ──
  const blankHeat = (cats: string[]): Heatmap => ({
    categories: cats,
    rows: [],
    colTotals: Object.fromEntries(cats.map((c) => [c, { value: 0, followed: 0 }])),
  });

  const buildHeatmap = (
    relevant: Com[],
    cats: string[],
    categoryOf: (c: Com) => string[], // categories this community belongs to (at first visit)
    followedIn: (c: Com) => boolean,
  ): Heatmap => {
    const byLga = new Map<string, HeatRow>();
    const colTotals: Record<string, HeatCell> = Object.fromEntries(cats.map((c) => [c, { value: 0, followed: 0 }]));
    for (const c of relevant) {
      const lga = c.lga || "Unspecified";
      let row = byLga.get(lga);
      if (!row) {
        row = { lga, total: 0, cells: Object.fromEntries(cats.map((cc) => [cc, { value: 0, followed: 0 }])) };
        byLga.set(lga, row);
      }
      row.total++;
      const followed = followedIn(c);
      for (const cat of categoryOf(c)) {
        if (!row.cells[cat]) row.cells[cat] = { value: 0, followed: 0 };
        row.cells[cat].value++;
        if (followed) row.cells[cat].followed++;
        colTotals[cat].value++;
        if (followed) colTotals[cat].followed++;
      }
    }
    const rows = [...byLga.values()].sort((a, b) => b.total - a.total);
    return { categories: cats, rows, colTotals };
  };

  // MDA Completion Outcomes — categories = MDA status; followed = completion FU exists.
  const completionHeatmap = allComs.length
    ? buildHeatmap(
        allComs,
        STATUS_ORDER,
        (c) => {
          const st = latestStatus(c);
          return [statusTitle(st || "not started")].filter((x) => STATUS_ORDER.includes(x));
        },
        (c) => hasFu(c, MDA_FOLLOWUP_COMPLETION),
      )
    : blankHeat(STATUS_ORDER);

  // Commodities Follow-up — categories = which commodity was inadequate at first visit.
  const commoditiesHeatmap = commoditiesNeeding.length
    ? buildHeatmap(
        commoditiesNeeding,
        COMMODITY_CATS,
        (c) => {
          const out: string[] = [];
          if (isNo(dq.registers, firstChecklistVal(c, dq.registers))) out.push("Treatment Register");
          if (isNo(dq.dose, firstChecklistVal(c, dq.dose))) out.push("Dose Pole/Tape");
          if (isNo(dq.suffMed, firstChecklistVal(c, dq.suffMed))) out.push("Sufficient Medicine");
          return out;
        },
        (c) => hasFu(c, MDA_FOLLOWUP_COMMODITIES),
      )
    : blankHeat(COMMODITY_CATS);

  // Adverse Reactions — categories = reaction types reported at first visit.
  const aeCats: string[] = [];
  for (const opt of dq.aeType?.options || []) {
    const lbl = strip(opt.label || opt.value);
    if (lbl && !aeCats.includes(lbl)) aeCats.push(lbl);
  }
  if (!aeCats.length) aeCats.push("Reported");
  const adverseHeatmap = adverseNeeding.length
    ? buildHeatmap(
        adverseNeeding,
        aeCats,
        (c) => {
          const raw = firstChecklistVal(c, dq.aeType);
          if (raw === undefined || raw === null || raw === "") return aeCats.length ? [aeCats[aeCats.length - 1] === "Reported" ? "Reported" : aeCats[0]] : [];
          const arr = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
          const out: string[] = [];
          for (const item of arr) {
            const lbl = strip(labelOf(dq.aeType, item)) || strip(String(item)).replace(/_/g, " ");
            const match = aeCats.find((cc) => norm(cc) === norm(lbl));
            if (match && !out.includes(match)) out.push(match);
          }
          return out.length ? out : [];
        },
        (c) => hasFu(c, MDA_FOLLOWUP_ADVERSE),
      )
    : blankHeat(aeCats);

  return {
    communitiesSupervised,
    distinctCommunities,
    mdaCompleted,
    sufficientMedicine,
    followUpCoverage,
    adverseManaged,
    redFlagSites,
    funnel,
    completionHeatmap,
    commoditiesHeatmap,
    adverseHeatmap,
    hasFollowUps,
  };
}
