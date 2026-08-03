/**
 * Derivations powering the ML Intelligence Hub.
 *
 * Every figure here is computed from the *live* flattened Kobo dataset that the
 * Checklist Dashboard already holds (and which is filtered by the shared
 * dashboard filter bar) — there is no static or seeded data in this module.
 */
import { resolveChecklistValue, splitMulti } from "@/components/IntegratedSupervisory/checklistSchema";

export type Row = Record<string, unknown>;

export const s = (v: unknown) => String(v ?? "").trim();
export const isYes = (v: unknown) => s(v).toLowerCase() === "yes";
const lbl = (field: string, v: unknown) => resolveChecklistValue(field, v) || s(v);


/* ------------------------------------------- medicine offer / swallow codes */
/**
 * The Kobo choice lists for these two questions are NOT Yes/No — they are
 * "Offered all required" / "Offered (but not all required)" / "Not offered any
 * required" and "Swallowed all offered" / "Swallowed (but not all offered)" /
 * "Did not swallow any offered". Testing them with a Yes/No comparison made
 * every derived metric collapse to zero, so they are decoded explicitly here.
 */
const OFFER_NONE = "Not_offered_any_required_1";
const SWALLOW_NONE = "Did_not_swallow_any_offered_1";

export const wasOffered = (r: Row): boolean => {
  const c = s(r.Were_you_OFFERED_the_medicine_s);
  if (!c) return false;
  if (c === OFFER_NONE) return false;
  const label = lbl("Were_you_OFFERED_the_medicine_s", c).toLowerCase();
  if (/^\s*(no|none)\b/.test(label) || /not\s*offered/.test(label)) return false;
  return true;
};

export const didSwallow = (r: Row): boolean => {
  const c = s(r.swallow);
  if (!c) return false;
  if (c === SWALLOW_NONE) return false;
  const label = lbl("swallow", c).toLowerCase();
  if (/did\s*not\s*swallow/.test(label) || /^\s*(no|none)\b/.test(label)) return false;
  return true;
};

/** Respondent answered the offer question at all (denominator membership). */
export const answeredOffer = (r: Row): boolean => s(r.Were_you_OFFERED_the_medicine_s) !== "";

/* ------------------------------------------------------------------- GPS */

export interface Gps { lat: number; long: number; altitude: number; accuracy: number }

export function parseGps(v: unknown): Gps | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude), long = Number(o.long ?? o.lon ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
    return { lat, long, altitude: Number(o.altitude) || 0, accuracy: Number(o.accuracy) || 0 };
  }
  const parts = s(v).split(/[\s,]+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { lat: parts[0], long: parts[1], altitude: parts[2] || 0, accuracy: parts[3] || 0 };
}

export interface MapPointRow {
  key: string; lat: number; long: number; accuracy: number;
  community: string; ward: string; lga: string; state: string;
  campaign: string; offered: boolean; swallowed: boolean;
}

export function mapPoints(respondents: Row[]): MapPointRow[] {
  const out: MapPointRow[] = [];
  respondents.forEach((r, i) => {
    const g = parseGps(r.GPS_of_Household);
    if (!g) return;
    out.push({
      key: `${s(r.parent_uuid)}-${r.respondent_index ?? i}`,
      lat: g.lat, long: g.long, accuracy: g.accuracy,
      community: s(r.COMMUNITIES) || "—", ward: s(r.Ward) || "—",
      lga: s(r.LGA) || "—", state: s(r.State) || "—",
      campaign: lbl("MDA_Campaign_Type", r.MDA_Campaign_Type) || "—",
      offered: wasOffered(r),
      swallowed: didSwallow(r),
    });
  });
  return out;
}

/* --------------------------------------------------------------- coverage */

export function coverage(respondents: Row[]) {
  let offered = 0, swallowed = 0;
  for (const r of respondents) {
    if (wasOffered(r)) offered++;
    if (didSwallow(r)) swallowed++;
  }
  return { offered, swallowed, rate: offered ? (swallowed / offered) * 100 : 0, total: respondents.length };
}

/* -------------------------------------------------------------- coldspots */

export interface Coldspot {
  key: string; state: string; lga: string; ward: string;
  progress: number; households: number; teams: number;
  risk: "Critical" | "High" | "Moderate" | "Low";
}

export function coldspots(parents: Row[], respondents: Row[]): Coldspot[] {
  const m = new Map<string, { state: string; lga: string; ward: string; hh: number; sw: number; teams: Set<string> }>();
  for (const r of respondents) {
    const key = `${s(r.State)}|${s(r.LGA)}|${s(r.Ward)}`;
    const rec = m.get(key) ?? { state: s(r.State) || "—", lga: s(r.LGA) || "—", ward: s(r.Ward) || "—", hh: 0, sw: 0, teams: new Set<string>() };
    rec.hh += 1;
    if (didSwallow(r)) rec.sw += 1;
    m.set(key, rec);
  }
  for (const p of parents) {
    const key = `${s(p.State)}|${s(p.LGA)}|${s(p.Ward)}`;
    const rec = m.get(key);
    if (rec) rec.teams.add(lbl("Independent_Monitor_s_Name", p.Independent_Monitor_s_Name) || s(p._submitted_by) || "unknown");
  }
  return [...m.entries()]
    .map(([key, r]) => {
      const progress = r.hh ? Math.round((r.sw / r.hh) * 100) : 0;
      return {
        key, state: r.state, lga: r.lga, ward: r.ward,
        progress, households: r.hh, teams: r.teams.size || 1,
        risk: (progress < 40 ? "Critical" : progress < 60 ? "High" : progress < 80 ? "Moderate" : "Low") as Coldspot["risk"],
      };
    })
    .sort((a, b) => a.progress - b.progress);
}

/* -------------------------------------------------------------- refusal NLP */

const TOPIC_RULES: { topic: string; re: RegExp; sentiment: number }[] = [
  { topic: "Fear of side effects", re: /side\s*effect|afraid|fear|scared|reaction|sick/i, sentiment: -0.62 },
  { topic: "Religious / mistrust", re: /religio|belief|pastor|imam|trust|rumou?r|refus/i, sentiment: -0.71 },
  { topic: "Poor timing / absent", re: /time|timing|absent|farm|market|travel|school|not\s*at\s*home|came\s*when/i, sentiment: -0.28 },
  { topic: "Ate nothing / empty stomach", re: /breakfast|eat|ate|food|empty\s*stomach|hungry/i, sentiment: -0.19 },
  { topic: "Team never arrived", re: /never\s*came|no\s*cdd|not\s*visited|team.*not|did\s*not\s*come|no\s*drug|stock/i, sentiment: -0.55 },
  { topic: "Illness / pregnancy exclusion", re: /ill|sick\s*person|pregnan|breastfeed|too\s*young|age/i, sentiment: -0.12 },
];

export function classifyRefusal(text: string): { topic: string; sentiment: number } {
  const t = text.trim();
  if (!t) return { topic: "Unclassified", sentiment: -0.2 };
  const hit = TOPIC_RULES.find((r) => r.re.test(t));
  return hit ? { topic: hit.topic, sentiment: hit.sentiment } : { topic: "Other stated reason", sentiment: -0.3 };
}

const refusalText = (r: Row) =>
  [
    lbl("Reason_respondent_DID_NOT_SWAL", r.Reason_respondent_DID_NOT_SWAL),
    s(r.OTHER_REASON_why_res_ALLOW_the_medicine_s),
  ].filter(Boolean).join(" ");

/**
 * Every respondent who did not end up swallowing is a coverage loss and is
 * classified — those with a stated reason by keyword rules, those never reached
 * by the distribution team as a supply-side gap, and the remainder as
 * "Reason not recorded" so the totals always reconcile with the coverage KPIs.
 */
function classifyRespondent(r: Row): { topic: string; sentiment: number } | null {
  if (!answeredOffer(r)) return null;
  if (didSwallow(r)) return null;
  const txt = refusalText(r);
  if (txt) return classifyRefusal(txt);
  if (!wasOffered(r)) return { topic: "Team never arrived", sentiment: -0.55 };
  return { topic: "Reason not recorded", sentiment: -0.2 };
}

export function refusalTopics(respondents: Row[]) {
  const m = new Map<string, { count: number; sentiment: number }>();
  let analysed = 0;
  for (const r of respondents) {
    const hit = classifyRespondent(r);
    if (!hit) continue;
    analysed++;
    const rec = m.get(hit.topic) ?? { count: 0, sentiment: hit.sentiment };
    rec.count += 1; rec.sentiment = hit.sentiment;
    m.set(hit.topic, rec);
  }
  return {
    analysed,
    topics: [...m.entries()]
      .map(([topic, v]) => ({ topic, count: v.count, sentiment: v.sentiment }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

export function wardRefusalTopics(respondents: Row[]) {
  const m = new Map<string, Map<string, number>>();
  const sentiments = new Map<string, number[]>();
  for (const r of respondents) {
    const hit = classifyRespondent(r);
    if (!hit) continue;
    const ward = s(r.Ward) || "—";
    const inner = m.get(ward) ?? new Map<string, number>();
    inner.set(hit.topic, (inner.get(hit.topic) ?? 0) + 1);
    m.set(ward, inner);
    sentiments.set(ward, [...(sentiments.get(ward) ?? []), hit.sentiment]);
  }
  return [...m.entries()]
    .map(([ward, inner]) => {
      const total = [...inner.values()].reduce((a, b) => a + b, 0);
      const [dominant, n] = [...inner.entries()].sort((a, b) => b[1] - a[1])[0];
      const sl = sentiments.get(ward) ?? [];
      return {
        ward, dominant, total,
        share: total ? Math.round((n / total) * 100) : 0,
        sentiment: sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : 0,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

/* --------------------------------------------------------------------- SAE */

export interface SaeRow {
  id: string; at: string; flhf: string; community: string; ward: string; lga: string;
  campaign: string; symptom: string;
  severity: "Critical" | "High" | "Low";
  oddsRatio: number; ciLow: number; ciHigh: number;
}

/** Haldane-corrected odds ratio of an SAE in this campaign vs. all others. */
function campaignOdds(parents: Row[], campaign: string) {
  let a = 0, b = 0, c = 0, d = 0;
  for (const p of parents) {
    const inGroup = (lbl("MDA_Campaign_Type", p.MDA_Campaign_Type) || "—") === campaign;
    const sae = isYes(lbl("Any_SAE_Complain", p.Any_SAE_Complain));
    if (inGroup && sae) a++; else if (inGroup) b++; else if (sae) c++; else d++;
  }
  a += 0.5; b += 0.5; c += 0.5; d += 0.5;
  const or = (a * d) / (b * c);
  const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  return { or, low: Math.exp(Math.log(or) - 1.96 * se), high: Math.exp(Math.log(or) + 1.96 * se) };
}

export function saeStream(parents: Row[]): SaeRow[] {
  return parents
    .filter((p) => isYes(lbl("Any_SAE_Complain", p.Any_SAE_Complain)))
    .map((p) => {
      const campaign = lbl("MDA_Campaign_Type", p.MDA_Campaign_Type) || "—";
      const { or, low, high } = campaignOdds(parents, campaign);
      const types = splitMulti(p.If_YES_what_type_of_SAE)
        .map((code) => resolveChecklistValue("If_YES_what_type_of_SAE", code) || code)
        .filter(Boolean);
      const symptom = [types.join(", "), s(p.Specify_the_OTHER_type_of_SAE)].filter(Boolean).join(" · ") || "Unspecified adverse event";
      return {
        id: `SAE-${s(p._id) || s(p._uuid).slice(0, 6)}`,
        at: s(p._submission_time),
        flhf: s(p.FLHF) || "—", community: s(p.COMMUNITIES) || "—",
        ward: s(p.Ward) || "—", lga: s(p.LGA) || "—",
        campaign, symptom,
        severity: (low > 1.5 ? "Critical" : low > 1 ? "High" : "Low") as SaeRow["severity"],
        oddsRatio: or, ciLow: low, ciHigh: high,
      };
    })
    .sort((x, y) => (x.at < y.at ? 1 : -1));
}

/* -------------------------------------------------------------------- WASH */

export function washMatrix(respondents: Row[]) {
  const cells = new Map<string, { n: number; sw: number }>();
  const waters = new Set<string>(), latrines = new Set<string>();
  for (const r of respondents) {
    const water = splitMulti(r.What_water_source_i_your_class_household)
      .map((c) => resolveChecklistValue("What_water_source_i_your_class_household", c) || c)[0];
    const latrine = lbl("What_type_of_Laterin_our_school_household", r.What_type_of_Laterin_our_school_household);
    if (!water || !latrine) continue;
    waters.add(water); latrines.add(latrine);
    const k = `${water}|${latrine}`;
    const rec = cells.get(k) ?? { n: 0, sw: 0 };
    rec.n += 1;
    if (didSwallow(r)) rec.sw += 1;
    cells.set(k, rec);
  }
  const rows = [...waters].sort().map((water) => ({
    source: water,
    cells: [...latrines].sort().map((latrine) => {
      const c = cells.get(`${water}|${latrine}`);
      return { latrine, n: c?.n ?? 0, pct: c && c.n ? Math.round((c.sw / c.n) * 100) : null };
    }),
  }));
  return { columns: [...latrines].sort(), rows };
}

export function washHotspots(respondents: Row[]) {
  const m = new Map<string, { state: string; lga: string; ward: string; community: string; n: number; sw: number; water: Map<string, number>; latrine: Map<string, number> }>();
  for (const r of respondents) {
    const key = `${s(r.State)}|${s(r.LGA)}|${s(r.Ward)}|${s(r.COMMUNITIES)}`;
    const rec = m.get(key) ?? {
      state: s(r.State) || "—", lga: s(r.LGA) || "—", ward: s(r.Ward) || "—",
      community: s(r.COMMUNITIES) || "—", n: 0, sw: 0, water: new Map(), latrine: new Map(),
    };
    rec.n += 1;
    if (didSwallow(r)) rec.sw += 1;
    const w = splitMulti(r.What_water_source_i_your_class_household)
      .map((c) => resolveChecklistValue("What_water_source_i_your_class_household", c) || c)[0];
    if (w) rec.water.set(w, (rec.water.get(w) ?? 0) + 1);
    const l = lbl("What_type_of_Laterin_our_school_household", r.What_type_of_Laterin_our_school_household);
    if (l) rec.latrine.set(l, (rec.latrine.get(l) ?? 0) + 1);
    m.set(key, rec);
  }
  const top = (x: Map<string, number>) => [...x.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return [...m.values()]
    .filter((r) => r.n > 0)
    .map((r) => ({
      state: r.state, lga: r.lga, ward: r.ward, community: r.community,
      compliance: Math.round((r.sw / r.n) * 100),
      households: r.n, water: top(r.water), latrine: top(r.latrine),
    }))
    .sort((a, b) => a.compliance - b.compliance)
    .slice(0, 12);
}

/* --------------------------------------------------------------- integrity */

export interface AnomalyRow {
  id: string; submission: string; enumerator: string; ward: string;
  reason: string; score: number;
}

const GPS_ACCURACY_LIMIT = 20;

export function anomalies(parents: Row[], respondents: Row[]): AnomalyRow[] {
  const out: AnomalyRow[] = [];
  const byParent = new Map<string, Row[]>();
  for (const r of respondents) {
    const k = s(r.parent_uuid) || s(r.parent_id);
    byParent.set(k, [...(byParent.get(k) ?? []), r]);
  }

  for (const p of parents) {
    const sub = s(p._id) || s(p._uuid).slice(0, 8) || "—";
    const who = lbl("Independent_Monitor_s_Name", p.Independent_Monitor_s_Name) || s(p._submitted_by) || "unknown";
    const ward = s(p.Ward) || "—";
    const kids = byParent.get(s(p._uuid) || s(p._id)) ?? [];

    const worst = kids
      .map((r) => parseGps(r.GPS_of_Household)?.accuracy ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    if (worst > GPS_ACCURACY_LIMIT) {
      out.push({
        id: `AN-${sub}-gps`, submission: sub, enumerator: who, ward,
        reason: `GPS accuracy ${Math.round(worst)} m exceeds the ${GPS_ACCURACY_LIMIT} m field threshold`,
        score: Math.min(0.99, 0.5 + worst / 200),
      });
    }

    if (kids.length > 1) {
      const sig = new Set(kids.map((r) => `${s(r.Were_you_OFFERED_the_medicine_s)}|${s(r.swallow)}|${s(r.What_type_of_Laterin_our_school_household)}|${s(r.Reason_respondent_DID_NOT_SWAL)}`));
      if (sig.size === 1 && kids.length >= 4) {
        out.push({
          id: `AN-${sub}-pattern`, submission: sub, enumerator: who, ward,
          reason: `Identical answer pattern repeated across ${kids.length} respondents`,
          score: Math.min(0.97, 0.6 + kids.length * 0.04),
        });
      }
    }

    const noGps = kids.filter((r) => !parseGps(r.GPS_of_Household)).length;
    if (kids.length > 0 && noGps === kids.length) {
      out.push({
        id: `AN-${sub}-nogps`, submission: sub, enumerator: who, ward,
        reason: `No household GPS captured for any of ${kids.length} respondent record(s)`,
        score: 0.68,
      });
    }
  }

  // Respondent-count outliers (> mean + 2 SD across the filtered set)
  const counts = parents.map((p) => Number(p.respondent_count) || 0);
  if (counts.length > 4) {
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
    parents.forEach((p, i) => {
      if (sd > 0 && counts[i] > mean + 2 * sd) {
        const sub = s(p._id) || s(p._uuid).slice(0, 8) || "—";
        out.push({
          id: `AN-${sub}-volume`, submission: sub,
          enumerator: lbl("Independent_Monitor_s_Name", p.Independent_Monitor_s_Name) || s(p._submitted_by) || "unknown",
          ward: s(p.Ward) || "—",
          reason: `${counts[i]} respondents in one checklist (mean ${mean.toFixed(1)} ± ${sd.toFixed(1)})`,
          score: 0.74,
        });
      }
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}
