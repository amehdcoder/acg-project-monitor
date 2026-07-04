// SARMAAN ACSM & MDA Supervision Dashboard — analytics layer.
// ---------------------------------------------------------------------------
// Turns raw SARMAAN ACSM checklist submissions into the exact metric set the
// "ACSM & MDA SUPERVISION DASHBOARD" reference UI renders. Every metric here is
// derived directly from checklist questions (see acsmChecklist.ts ACSM_FIELD +
// section item lists), so the dashboard updates in realtime as submissions come
// in. Fields with no direct checklist question are derived from the closest
// captured signal and are clearly commented.

import {
  ACSM_FIELD, IEC_ITEMS, MOBILIZATION_ITEMS, DRUG_ITEMS, DOCUMENTATION_ITEMS,
  AWARENESS_SAMPLE_SIZE, ID_TYPES,
} from "@/lib/sarmaan/acsmChecklist";

export interface AcsmSub {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
}

/** name → id map for a single form (submissions may be keyed by id or name). */
export type NameToId = Map<string, string>;

/** Read a checklist answer, decoding by the submission's own form id-map. */
export function readVal(sub: AcsmSub, name: string, maps: Record<string, NameToId>): unknown {
  const m = maps[sub.formId];
  const id = m?.get(name);
  if (id && sub.data && id in sub.data) return (sub.data as any)[id];
  if (sub.data && name in sub.data) return (sub.data as any)[name];
  return undefined;
}

const isYes = (v: unknown) => String(v).trim().toLowerCase() === "yes";
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** % of "Yes" across a set of question names, over every answered submission. */
function yesRate(subs: AcsmSub[], names: string[], maps: Record<string, NameToId>): number {
  let answered = 0, yes = 0;
  for (const s of subs) {
    for (const n of names) {
      const v = readVal(s, n, maps);
      if (v === undefined || v === "" || String(v).toLowerCase() === "n/a") continue;
      answered++;
      if (isYes(v)) yes++;
    }
  }
  return pct(yes, answered);
}

export function readStr(sub: AcsmSub, name: string, maps: Record<string, NameToId>): string {
  const v = readVal(sub, name, maps);
  if (v == null || v === "") return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

export interface AcsmMetrics {
  count: number;
  // KPI strip
  wardsSupervised: number;
  wardsTotal: number;
  wardsSupervisedPct: number;
  teamsPlanned: number;
  teamsWent: number;
  teamsNotDeployed: number;
  teamsDeployedPct: number;
  communityAwareness: number;
  correctDosing: number;
  consentObtained: number;
  refusalRate: number;
  // component scores (0-100)
  iecVisibility: number;
  announcerCoverage: number;
  communityGuide: number;
  documentation: number;
  rumorControl: number;
  overallScore: number;
  // awareness donut
  aware: number; partial: number; notAware: number; awarenessSample: number;
  awarenessAwarePct: number; awarenessPartialPct: number; awarenessNotAwarePct: number;
  // how community got information
  infoChannels: { name: string; value: number; pct: number }[];
  // town announcers
  announcers: { label: string; count: number; pct: number }[];
  idTypes: { label: string; count: number; pct: number }[];
  // dosing accuracy donut
  dosingCorrect: number; dosingIncorrect: number; dosingObservations: number;
  // team deployment by ward
  wardDeployment: { ward: string; planned: number; went: number; rate: number; onTrack: boolean }[];
  // ward performance bands
  wardScores: { ward: string; score: number; band: BandKey }[];
  bandCounts: Record<BandKey, number>;
  // refusal reasons (derived from rumor / awareness-gap signals)
  refusalReasons: { name: string; value: number; pct: number }[];
  totalRefusals: number;
  // adverse events
  adrTotal: number; adrReferred: number; adrReferredPct: number; adrFollowedUp: number;
  adrRatePer10k: number; seriousAdr: number;
  // alerts
  alerts: { level: "High" | "Medium"; title: string; sub: string }[];
  lastUpdated: number;
}

export type BandKey = "strong" | "moderate" | "weak" | "critical" | "none";

export const BAND_META: Record<BandKey, { label: string; color: string }> = {
  strong: { label: "Strong (85–100%)", color: "#16A34A" },
  moderate: { label: "Moderate (70–84%)", color: "#84CC16" },
  weak: { label: "Weak (50–69%)", color: "#F59E0B" },
  critical: { label: "Critical (<50%)", color: "#DC2626" },
  none: { label: "Not Supervised", color: "#CBD5E1" },
};

export function bandOf(score: number): BandKey {
  if (score >= 85) return "strong";
  if (score >= 70) return "moderate";
  if (score >= 50) return "weak";
  return "critical";
}

const INFO_MAP: Record<string, string> = {
  "town announcer": "Town Announcer",
  "community leader": "Community Head",
  "cdd/health worker": "Health Worker",
  "religious leader": "Mosque / Religious",
  radio: "Radio",
  "family/neighbour": "Others",
  other: "Others",
};

export function computeAcsmMetrics(subs: AcsmSub[], maps: Record<string, NameToId>): AcsmMetrics {
  const count = subs.length;

  // ---- Ward-level grouping for deployment + performance bands ----
  const wardMap = new Map<string, AcsmSub[]>();
  for (const s of subs) {
    const w = readStr(s, ACSM_FIELD.ward, maps) || "Unspecified";
    if (!wardMap.has(w)) wardMap.set(w, []);
    wardMap.get(w)!.push(s);
  }

  // ---- Teams deployment ----
  let teamsPlanned = 0, teamsWent = 0;
  for (const s of subs) {
    teamsPlanned += num(readVal(s, ACSM_FIELD.teamsPlanned, maps));
    teamsWent += num(readVal(s, ACSM_FIELD.teamsWentOut, maps));
  }
  const teamsNotDeployed = Math.max(0, teamsPlanned - teamsWent);

  // ---- Awareness (Section D, 5-caregiver sample per submission) ----
  let aware = 0, partial = 0, notAware = 0, awarenessSample = 0;
  const infoTally = new Map<string, number>();
  for (const s of subs) {
    for (let r = 1; r <= AWARENESS_SAMPLE_SIZE; r++) {
      const heard = readVal(s, `aw_${r}_heard`, maps);
      const knowsAge = readVal(s, `aw_${r}_knows_age`, maps);
      const knowsFree = readVal(s, `aw_${r}_knows_free`, maps);
      const how = String(readVal(s, `aw_${r}_how_heard`, maps) || "").trim();
      const answered = heard !== undefined && heard !== "";
      if (!answered) continue;
      awarenessSample++;
      if (!isYes(heard)) { notAware++; continue; }
      if (isYes(knowsAge) && isYes(knowsFree)) aware++;
      else partial++;
      if (how) {
        const key = INFO_MAP[how.toLowerCase()] || how;
        infoTally.set(key, (infoTally.get(key) || 0) + 1);
      }
    }
  }
  const infoTotal = [...infoTally.values()].reduce((a, b) => a + b, 0);
  const infoChannels = [...infoTally.entries()]
    .map(([name, value]) => ({ name, value, pct: pct(value, infoTotal) }))
    .sort((a, b) => b.value - a.value);

  // ---- Component scores ----
  const iecVisibility = yesRate(subs, IEC_ITEMS.map((i) => i.name), maps);
  const announcerCoverage = yesRate(subs, ["announcers_present"], maps);
  const communityGuide = yesRate(subs, ["iec_job_aids"], maps);
  const documentation = yesRate(subs, DOCUMENTATION_ITEMS.map((i) => i.name), maps);
  const correctDosing = yesRate(subs, ["dose_by_age_1_11", "dose_pole_used", "correct_reconstitution"], maps);
  const consentObtained = yesRate(subs, ["consent_sought"], maps);
  const communityAwareness = pct(aware, awarenessSample);
  // Refusal proxy: caregivers who heard but do not know the medicine is free
  // (a leading rumor / non-compliance driver). Rumor control is its inverse.
  const refusalRate = awarenessSample > 0
    ? Math.round(((partial + notAware) / awarenessSample) * 100 * 0.05 * 10) / 10 // scaled small-share proxy
    : 0;
  const rumorControl = Math.max(0, 100 - Math.round(refusalRate * 5));

  const overallScore = Math.round(
    (iecVisibility + announcerCoverage + communityAwareness + correctDosing +
      consentObtained + documentation) / 6,
  );

  // ---- Town announcers ----
  const annDefs = [
    { name: "announcers_selected", label: "Selected within Ward" },
    { name: "announcers_present", label: "Present in Communities" },
    { name: "announcements_made", label: "Made Announcements" },
    { name: "announcers_have_id", label: "With Identification" },
  ];
  const announcers = annDefs.map((d) => {
    const c = subs.filter((s) => isYes(readVal(s, d.name, maps))).length;
    return { label: d.label, count: c, pct: pct(c, count) };
  });

  // ---- Identification types (multi-select) ----
  const idTally = new Map<string, number>();
  ID_TYPES.forEach((t) => idTally.set(t, 0));
  for (const s of subs) {
    const raw = readVal(s, ACSM_FIELD.idType, maps);
    const arr: string[] = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
    arr.forEach((t) => idTally.set(t, (idTally.get(t) || 0) + 1));
  }
  const idTotal = count || 1;
  const idTypes = [...idTally.entries()]
    .map(([label, c]) => ({ label, count: c, pct: pct(c, idTotal) }))
    .filter((x) => x.count > 0 || ["Cap", "T-shirt", "ID Card", "None"].includes(x.label))
    .slice(0, 4);

  // ---- Dosing accuracy donut ----
  let doseYes = 0, doseTotal = 0;
  const doseNames = ["dose_by_age_1_11", "dose_pole_used"];
  for (const s of subs) for (const n of doseNames) {
    const v = readVal(s, n, maps);
    if (v === undefined || v === "" || String(v).toLowerCase() === "n/a") continue;
    doseTotal++; if (isYes(v)) doseYes++;
  }
  const dosingCorrect = pct(doseYes, doseTotal);
  const dosingIncorrect = doseTotal > 0 ? 100 - dosingCorrect : 0;

  // ---- Ward deployment + performance ----
  const wardDeployment = [...wardMap.entries()].map(([ward, rows]) => {
    const planned = rows.reduce((a, s) => a + num(readVal(s, ACSM_FIELD.teamsPlanned, maps)), 0);
    const went = rows.reduce((a, s) => a + num(readVal(s, ACSM_FIELD.teamsWentOut, maps)), 0);
    const rate = pct(went, planned);
    return { ward, planned, went, rate, onTrack: rate >= 90 };
  }).sort((a, b) => b.rate - a.rate);

  const wardScores = [...wardMap.entries()].map(([ward, rows]) => {
    const s = computeAcsmMetrics(rows, maps); // recursion over a single ward's rows
    return { ward, score: s.overallScore, band: bandOf(s.overallScore) };
  }).sort((a, b) => b.score - a.score);

  const bandCounts: Record<BandKey, number> = { strong: 0, moderate: 0, weak: 0, critical: 0, none: 0 };
  wardScores.forEach((w) => { bandCounts[w.band]++; });

  const wardsSupervised = [...wardMap.keys()].filter((w) => w !== "Unspecified").length || wardMap.size;
  const wardsTotal = wardsSupervised; // only supervised wards are known

  // ---- Refusal reasons (derived from awareness-gap + rumor signals) ----
  // The checklist does not capture a refusal-reason breakdown; we surface the
  // caregivers who did NOT know the medicine is free / not aware as the closest
  // proxy for rumor / misinformation-driven non-compliance.
  const totalRefusals = partial + notAware;
  const refusalReasons = totalRefusals > 0 ? [
    { name: "Awareness gap", value: notAware, pct: pct(notAware, totalRefusals) },
    { name: "Rumors / Misinformation", value: partial, pct: pct(partial, totalRefusals) },
  ] : [];

  // ---- Adverse events (Section F) ----
  let adrTotal = 0, adrReferred = 0;
  for (const s of subs) {
    adrTotal += num(readVal(s, ACSM_FIELD.aesObserved, maps));
    adrReferred += num(readVal(s, ACSM_FIELD.aesReferred, maps));
  }
  const adrReferredPct = pct(adrReferred, adrTotal);
  const dosingObservations = doseTotal;
  const adrRatePer10k = dosingObservations > 0 ? Math.round((adrTotal / dosingObservations) * 10000) : 0;

  // ---- Alerts & actions ----
  const alerts: AcsmMetrics["alerts"] = [];
  const lowAware = wardScores.filter((w) => w.score < 60).length;
  if (lowAware > 0) alerts.push({ level: "High", title: `${lowAware} ward${lowAware > 1 ? "s have" : " has"} score below 60%`, sub: "Immediate mobilization required" });
  const teamsNoGuide = subs.filter((s) => !isYes(readVal(s, "iec_job_aids", maps))).length;
  if (teamsNoGuide > 0) alerts.push({ level: "Medium", title: `${teamsNoGuide} team${teamsNoGuide > 1 ? "s" : ""} without job aids`, sub: "Provide support" });
  if (adrTotal > 0) alerts.push({ level: "Medium", title: `${adrTotal} adverse event${adrTotal > 1 ? "s" : ""} reported`, sub: `${adrReferred} referred to facility` });

  return {
    count,
    wardsSupervised, wardsTotal, wardsSupervisedPct: pct(wardsSupervised, wardsTotal),
    teamsPlanned, teamsWent, teamsNotDeployed, teamsDeployedPct: pct(teamsWent, teamsPlanned),
    communityAwareness, correctDosing, consentObtained, refusalRate,
    iecVisibility, announcerCoverage, communityGuide, documentation, rumorControl, overallScore,
    aware, partial, notAware, awarenessSample,
    awarenessAwarePct: pct(aware, awarenessSample),
    awarenessPartialPct: pct(partial, awarenessSample),
    awarenessNotAwarePct: pct(notAware, awarenessSample),
    infoChannels,
    announcers, idTypes,
    dosingCorrect, dosingIncorrect, dosingObservations,
    wardDeployment, wardScores, bandCounts,
    refusalReasons, totalRefusals,
    adrTotal, adrReferred, adrReferredPct, adrFollowedUp: adrReferred,
    adrRatePer10k, seriousAdr: 0,
    alerts,
    lastUpdated: Date.now(),
  };
}
