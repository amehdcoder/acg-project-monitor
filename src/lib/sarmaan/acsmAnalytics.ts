// SARMAAN ACSM & MDA Supervision Dashboard — advanced analytics layer.
// ---------------------------------------------------------------------------
// Supervisor accountability, robust statistical summaries of numeric/categorical
// fields, and thematic-analysis document assembly (with a local fallback theme
// extractor) — all derived from the same checklist submissions that feed the
// main dashboard so everything stays in realtime sync.

import {
  ACSM_FIELD, IEC_ITEMS, DRUG_ITEMS, DOCUMENTATION_ITEMS,
  ELIGIBILITY_ITEMS, MOBILIZATION_ITEMS,
} from "@/lib/sarmaan/acsmChecklist";
import {
  buildAccountability, type AccountabilityRecordInput, type AccountabilityUser,
  type ProfileLite,
} from "@/lib/accountability";
import {
  readVal, readStr, overallScoreOf, pct,
  type AcsmSub, type NameToId,
} from "@/lib/sarmaan/acsmDashboardData";

/* ----------------------------------------------------------------- helpers */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const norm = (v: unknown) => String(v ?? "").trim();

/* --------------------------------------------------- 1. Accountability ---- */
export function buildAcsmAccountability(
  subs: AcsmSub[],
  maps: Record<string, NameToId>,
  profiles: Map<string, ProfileLite>,
): AccountabilityUser[] {
  const records: AccountabilityRecordInput[] = subs.map((s) => {
    const ward = readStr(s, ACSM_FIELD.ward, maps) || readStr(s, ACSM_FIELD.community, maps) || "Unspecified ward";
    return {
      userId: s.user_id,
      unitName: ward,
      state: readStr(s, ACSM_FIELD.state, maps) || "—",
      lga: readStr(s, ACSM_FIELD.lga, maps) || "—",
      // The checklist captures a single submission moment; use it as the visit
      // timestamp (end). Start is unknown, so duration stays blank.
      start: null,
      end: s.created_at,
      status: "sent",
    };
  });
  return buildAccountability(records, profiles);
}

/* --------------------------------------------------- 2. Statistics -------- */
export interface NumericStat {
  key: string;
  label: string;
  n: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  sum: number;
}

export interface CategoricalStat {
  key: string;
  label: string;
  n: number;
  top: string;
  entries: { name: string; count: number; pct: number }[];
}

export interface AcsmStatistics {
  numeric: NumericStat[];
  categorical: CategoricalStat[];
  correlations: { a: string; b: string; r: number; strength: string; n: number }[];
  sampleSize: number;
}

const NUMERIC_FIELDS: { key: string; label: string }[] = [
  { key: ACSM_FIELD.teamsPlanned, label: "Teams Planned" },
  { key: ACSM_FIELD.teamsWentOut, label: "Teams That Went Out" },
  { key: ACSM_FIELD.teamsNotOut, label: "Teams Not Out" },
  { key: ACSM_FIELD.deploymentRate, label: "Deployment Rate (%)" },
  { key: ACSM_FIELD.aesObserved, label: "Adverse Events Observed" },
  { key: ACSM_FIELD.aesReferred, label: "Adverse Events Referred" },
];

const CATEGORICAL_FIELDS: { key: string; label: string; multi?: boolean }[] = [
  { key: "announcers_present", label: "Town Announcers Present" },
  { key: "consent_sought", label: "Consent Sought" },
  { key: "house_marking_done", label: "House Marking Done" },
  { key: "directly_observed", label: "Directly Observed Treatment" },
  { key: "expiry_checked", label: "Expiry Checked" },
  { key: ACSM_FIELD.idType, label: "Announcer ID Type", multi: true },
  { key: ACSM_FIELD.medicinePrevents, label: "Caregiver Belief — Medicine Prevents", multi: true },
];

function describe(values: number[]): Omit<NumericStat, "key" | "label"> {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, median: 0, sd: 0, min: 0, max: 0, sum: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { n, mean: r2(mean), median: r2(median), sd: r2(sd), min: sorted[0], max: sorted[n - 1], sum: r2(sum) };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
}
const strengthOf = (r: number): string => {
  const a = Math.abs(r);
  const dir = r >= 0 ? "positive" : "negative";
  if (a >= 0.7) return `Strong ${dir}`;
  if (a >= 0.4) return `Moderate ${dir}`;
  if (a >= 0.2) return `Weak ${dir}`;
  return "Negligible";
};

export function computeAcsmStatistics(subs: AcsmSub[], maps: Record<string, NameToId>): AcsmStatistics {
  // Numeric descriptives
  const numeric: NumericStat[] = [];
  const numericSeries: Record<string, number[]> = {};
  for (const f of NUMERIC_FIELDS) {
    const vals: number[] = [];
    for (const s of subs) {
      const v = numOrNull(readVal(s, f.key, maps));
      if (v !== null) vals.push(v);
    }
    numericSeries[f.key] = vals;
    if (vals.length) numeric.push({ key: f.key, label: f.label, ...describe(vals) });
  }
  // Per-submission overall score as a derived numeric metric
  const scores = subs.map((s) => overallScoreOf([s], maps)).filter((v) => Number.isFinite(v));
  if (scores.length) {
    numeric.push({ key: "overall_score", label: "Overall ACSM Score (%)", ...describe(scores) });
    numericSeries["overall_score"] = scores;
  }

  // Categorical frequencies
  const categorical: CategoricalStat[] = [];
  for (const f of CATEGORICAL_FIELDS) {
    const tally = new Map<string, number>();
    let n = 0;
    for (const s of subs) {
      const raw = readVal(s, f.key, maps);
      if (raw === undefined || raw === "" || norm(raw).toLowerCase() === "n/a") continue;
      const items = f.multi
        ? (Array.isArray(raw) ? raw.map(norm) : norm(raw) ? [norm(raw)] : [])
        : [norm(raw)];
      if (!items.length) continue;
      n++;
      for (const it of items) {
        const label = it.replace(/\b\w/g, (l) => l.toUpperCase());
        tally.set(label, (tally.get(label) || 0) + 1);
      }
    }
    if (!n) continue;
    const total = [...tally.values()].reduce((a, b) => a + b, 0);
    const entries = [...tally.entries()]
      .map(([name, count]) => ({ name, count, pct: pct(count, total) }))
      .sort((a, b) => b.count - a.count);
    categorical.push({ key: f.key, label: f.label, n, top: entries[0]?.name || "—", entries });
  }

  // Correlations between key numeric pairs (paired, non-null)
  const corrPairs: [string, string, string][] = [
    [ACSM_FIELD.teamsPlanned, ACSM_FIELD.teamsWentOut, "Teams Planned vs Went Out"],
    [ACSM_FIELD.deploymentRate, "overall_score", "Deployment Rate vs Overall Score"],
    [ACSM_FIELD.aesObserved, ACSM_FIELD.aesReferred, "ADRs Observed vs Referred"],
  ];
  const correlations: AcsmStatistics["correlations"] = [];
  for (const [ka, kb, label] of corrPairs) {
    const xs: number[] = [], ys: number[] = [];
    for (const s of subs) {
      const a = ka === "overall_score" ? overallScoreOf([s], maps) : numOrNull(readVal(s, ka, maps));
      const b = kb === "overall_score" ? overallScoreOf([s], maps) : numOrNull(readVal(s, kb, maps));
      if (a !== null && b !== null) { xs.push(a); ys.push(b); }
    }
    if (xs.length >= 3) {
      const r = pearson(xs, ys);
      correlations.push({ a: label.split(" vs ")[0], b: label.split(" vs ")[1], r, strength: strengthOf(r), n: xs.length });
    }
  }

  return { numeric, categorical, correlations, sampleSize: subs.length };
}

/* --------------------------------------------------- 3. Thematic --------- */
export interface ThematicDoc { id: string; label: string; text: string }

/** Free-text checklist fields worth qualitative analysis. */
const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: ACSM_FIELD.issues, label: "Issues Identified" },
  { key: ACSM_FIELD.corrective, label: "Corrective Actions" },
  { key: ACSM_FIELD.teamReason, label: "Reason Team Did Not Go Out" },
  { key: ACSM_FIELD.responsible, label: "Responsible Person" },
];

export function buildThematicDocs(subs: AcsmSub[], maps: Record<string, NameToId>): ThematicDoc[] {
  const docs: ThematicDoc[] = [];
  for (const s of subs) {
    const parts: string[] = [];
    for (const f of TEXT_FIELDS) {
      const v = readStr(s, f.key, maps).trim();
      if (v && v.length > 2) parts.push(`${f.label}: ${v}`);
    }
    const text = parts.join(". ");
    if (text.length > 15) {
      const ward = readStr(s, ACSM_FIELD.ward, maps) || readStr(s, ACSM_FIELD.community, maps) || "Ward";
      const lga = readStr(s, ACSM_FIELD.lga, maps);
      docs.push({ id: s.id, label: [ward, lga].filter(Boolean).join(" · ") || "Visit", text });
    }
  }
  return docs;
}

/* Local fallback thematic analysis (keyword clustering + lexicon sentiment). */
export interface LocalTheme {
  name: string;
  description: string;
  prevalence: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  keywords: string[];
  quotes: string[];
}
export interface LocalThematicResult {
  overview: string;
  sentiment: { positive: number; neutral: number; negative: number };
  themes: LocalTheme[];
  insights: string[];
  recommendations: string[];
  local: true;
}

const STOP = new Set("the a an and or of to in on for with is are was were be been being at by from this that these those it its as not no yes na have has had do does did will would should could may might can we they he she you i our their his her them his ward lga team teams was were".split(/\s+/));
const NEG = ["refus", "rumor", "rumour", "shortage", "delay", "late", "no ", "not ", "missing", "lack", "absent", "poor", "fail", "gap", "insufficient", "expired", "reject", "resist", "unavailable", "problem", "issue", "difficult"];
const POS = ["good", "adequate", "available", "present", "complete", "correct", "consent", "success", "improve", "well", "compliant", "supported", "resolved", "on track"];

const THEME_LEXICON: { name: string; description: string; terms: string[] }[] = [
  { name: "Team Deployment & Logistics", description: "Field team turnout, transport, staffing and logistics constraints.", terms: ["team", "deploy", "transport", "logistic", "staff", "cdd", "fuel", "vehicle", "absent", "late"] },
  { name: "Community Mobilization & Awareness", description: "Town announcers, IEC visibility and caregiver awareness.", terms: ["announc", "aware", "mobili", "iec", "banner", "sensiti", "radio", "message", "informat"] },
  { name: "Refusals, Rumors & Misinformation", description: "Caregiver refusals and misinformation affecting uptake.", terms: ["refus", "rumor", "rumour", "misinform", "reject", "resist", "fear", "belief", "reluct"] },
  { name: "Drug Management & Dosing", description: "Reconstitution, dosing, expiry and stock issues.", terms: ["dose", "dosing", "reconstitut", "expir", "stock", "drug", "medicine", "azithro", "pole", "shortage"] },
  { name: "Safety & Adverse Events", description: "Adverse drug reactions, referrals and exclusions.", terms: ["adverse", "adr", "vomit", "reaction", "side effect", "refer", "allerg", "ill", "safety"] },
  { name: "Documentation & Recording", description: "Registers, tally sheets, house marking and data quality.", terms: ["document", "register", "record", "tally", "marking", "chalk", "app", "data", "incomplet"] },
];

export function localThematicAnalysis(docs: ThematicDoc[]): LocalThematicResult {
  const themes: LocalTheme[] = [];
  let pos = 0, neg = 0, neu = 0;
  const scored = docs.map((d) => {
    const low = d.text.toLowerCase();
    const negHits = NEG.filter((t) => low.includes(t)).length;
    const posHits = POS.filter((t) => low.includes(t)).length;
    const s: LocalTheme["sentiment"] = negHits > posHits ? "negative" : posHits > negHits ? "positive" : "neutral";
    if (s === "negative") neg++; else if (s === "positive") pos++; else neu++;
    return { d, low, s };
  });

  for (const t of THEME_LEXICON) {
    const matched = scored.filter((x) => t.terms.some((term) => x.low.includes(term)));
    if (!matched.length) continue;
    const negC = matched.filter((m) => m.s === "negative").length;
    const posC = matched.filter((m) => m.s === "positive").length;
    const sentiment: LocalTheme["sentiment"] = negC && posC ? "mixed" : negC > posC ? "negative" : posC > negC ? "positive" : "neutral";
    const kw = new Set<string>();
    matched.forEach((m) => t.terms.forEach((term) => { if (m.low.includes(term)) kw.add(term); }));
    themes.push({
      name: t.name,
      description: t.description,
      prevalence: matched.length,
      sentiment,
      keywords: [...kw].slice(0, 6),
      quotes: matched.slice(0, 2).map((m) => m.d.text.slice(0, 160)),
    });
  }
  themes.sort((a, b) => b.prevalence - a.prevalence);

  const total = docs.length || 1;
  const insights: string[] = [];
  const topNeg = themes.find((t) => t.sentiment === "negative" || t.sentiment === "mixed");
  if (topNeg) insights.push(`"${topNeg.name}" is the most frequently reported field challenge (${topNeg.prevalence} of ${docs.length} narratives).`);
  if (neg > pos) insights.push(`Field narratives skew negative — ${Math.round((neg / total) * 100)}% flag at least one problem needing follow-up.`);
  else insights.push(`Field narratives are broadly constructive — ${Math.round((pos / total) * 100)}% report positive supervision signals.`);
  if (themes.some((t) => /Refusal/.test(t.name))) insights.push("Refusals & rumors appear in free text — pair with the awareness donut to target rumor-control messaging.");

  const recommendations: string[] = [];
  themes.slice(0, 3).forEach((t) => {
    if (t.sentiment === "negative" || t.sentiment === "mixed") recommendations.push(`Prioritise corrective action on ${t.name.toLowerCase()} in the weakest wards.`);
  });
  if (!recommendations.length) recommendations.push("Maintain current supervision cadence; no dominant negative theme detected.");
  recommendations.push("Share verbatim caregiver concerns with ward supervisors for same-day resolution.");

  return {
    overview: `Automated thematic scan of ${docs.length} narrative(s) from checklist free-text fields. ${themes.length} recurring theme(s) identified across issues, corrective actions and deployment reasons.`,
    sentiment: {
      positive: Math.round((pos / total) * 100),
      neutral: Math.round((neu / total) * 100),
      negative: Math.round((neg / total) * 100),
    },
    themes,
    insights,
    recommendations,
    local: true,
  };
}
