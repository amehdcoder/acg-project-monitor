// Ground verification of the livelihood shortlist — and the judgement the
// system forms from it.
//
// A shortlist produced from records is a proposal, not a decision. A verifier
// goes to the house, sees what is actually there, and records it. Those visits
// are then used the way an experienced officer uses experience:
//
//   1. Every visit produces an OBSERVED vulnerability, scored from what the eye
//      can confirm at the door (shelter, cooking pot, assets, work, dependants,
//      the limb). That is the ground truth.
//   2. The system compares what it predicted with what was seen, and learns a
//      correction — overall, per community, per band, and for people whose
//      score rests only on the record because no questionnaire was done. The
//      correction is shrunk towards zero until enough visits support it, so a
//      single surprising house never rewrites the model.
//   3. Corrected scores re-rank the list automatically, and every adjustment is
//      stated in plain words, so the committee can see why the machine changed
//      its mind.
//   4. The system also decides WHO to send the verifier to next: people near
//      the cut-off line, people scored on record alone, and communities where
//      it has been wrong before — the same instinct a supervisor has about
//      which names on a list to spot-check.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TargetingResult } from "./livelihood";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface LivelihoodVerificationRow {
  id: string;
  project_id: string;
  module_id: string | null;
  opportunity_id: string | null;
  beneficiary_id: string;
  assessment_id: string | null;
  visit_date: string;
  verifier_id: string | null;
  verifier_name: string | null;
  verifier_role: string | null;
  latitude: number | null;
  longitude: number | null;
  finding: string;
  observed: Record<string, unknown>;
  observed_vulnerability: number | null;
  predicted_vulnerability: number | null;
  recommendation: string | null;
  notes: string | null;
  created_at: string;
}

export const FINDINGS = [
  { value: "confirmed", label: "Confirmed — as the record says", tone: "success" as const },
  { value: "worse", label: "Worse off than the record says", tone: "danger" as const },
  { value: "better", label: "Better off than the record says", tone: "warning" as const },
  { value: "not_found", label: "Not found at the address", tone: "neutral" as const },
  { value: "relocated", label: "Has moved away", tone: "neutral" as const },
  { value: "refused", label: "Refused the visit", tone: "neutral" as const },
  { value: "ineligible", label: "Not eligible (duplicate, deceased, other programme)", tone: "danger" as const },
];

export const RECOMMENDATIONS = [
  { value: "enrol", label: "Enrol — proceed to the opportunity" },
  { value: "enrol_with_support", label: "Enrol, but with care or documents sorted first" },
  { value: "waitlist", label: "Move to the waitlist" },
  { value: "replace", label: "Replace with the next person on the list" },
  { value: "reassess", label: "Re-assess — the record does not match the home" },
  { value: "refer_safeguarding", label: "Refer to the safeguarding officer" },
];

export const VERIFIER_ROLES = [
  { value: "cdd", label: "Community-directed distributor" },
  { value: "focal_person", label: "Facility focal person" },
  { value: "chew", label: "Community health worker" },
  { value: "livelihood_officer", label: "Livelihood officer" },
  { value: "supervisor", label: "Supervisor / M&E" },
  { value: "committee", label: "Community selection committee" },
];

/* ------------------------------------------------------------------ */
/* What the verifier can see at the door                               */
/* ------------------------------------------------------------------ */

export interface ObservationField {
  name: string;
  label: string;
  hint?: string;
  options: { value: string; label: string; weight: number }[];
}

const ob = (
  name: string, label: string, options: [string, string, number][], hint?: string,
): ObservationField => ({
  name, label, hint,
  options: options.map(([value, l, weight]) => ({ value, label: l, weight })),
});

/**
 * Ten things a verifier can confirm with their own eyes in fifteen minutes.
 * No hearsay, no repeated questionnaire — only what is visible or countable.
 */
export const OBSERVATION_FIELDS: ObservationField[] = [
  ob("shelter_seen", "Condition of the dwelling", [
    ["none", "No dwelling of their own", 1],
    ["poor", "Leaking, mud or makeshift", 0.8],
    ["basic", "Basic but sound", 0.4],
    ["good", "Good condition", 0],
  ]),
  ob("cooking_seen", "Food being prepared / stored in the home", [
    ["nothing", "Nothing to cook today", 1],
    ["one_day", "Enough for today only", 0.7],
    ["week", "Stock for about a week", 0.3],
    ["ample", "Ample stock", 0],
  ]),
  ob("assets_seen", "Productive assets seen (stock, tools, livestock, land)", [
    ["none", "None", 1], ["one", "One", 0.7], ["few", "Two or three", 0.35], ["many", "Several", 0],
  ]),
  ob("working_seen", "Was the person working or able to work?", [
    ["bedbound", "Bed-bound", 1],
    ["not_working", "Not working, though at home", 0.8],
    ["light", "Doing light work", 0.45],
    ["working", "Working normally", 0.1],
  ]),
  ob("limb_seen", "Condition of the affected limb / eye / skin", [
    ["severe", "Severe — open wound, gross swelling, blind", 1],
    ["moderate", "Moderate, visibly limiting", 0.65],
    ["mild", "Mild", 0.3],
    ["none", "No visible problem", 0],
  ]),
  ob("dependants_seen", "Dependants present in the compound", [
    ["five_plus", "Five or more", 1], ["three_four", "Three or four", 0.7],
    ["one_two", "One or two", 0.4], ["none", "None", 0],
  ]),
  ob("children_school", "School-age children at home during school hours", [
    ["all", "All at home", 1], ["some", "Some at home", 0.6], ["none", "All in school", 0],
  ]),
  ob("water_seen", "Water and sanitation at the home", [
    ["none", "No safe water, no latrine", 1],
    ["one", "One of the two", 0.6],
    ["both", "Both available", 0],
  ]),
  ob("support_seen", "Other support reaching this household", [
    ["none", "None from anyone", 1],
    ["family", "Family help only", 0.6],
    ["programme", "Already on another programme", 0.1],
  ]),
  ob("neighbour_view", "What neighbours / community leaders say about need", [
    ["most_needy", "Among the most needy here", 1],
    ["needy", "Needy", 0.7],
    ["average", "About average for the community", 0.35],
    ["not_needy", "Not among the needy", 0],
  ], "A community check stops a well-connected name from crowding out a poorer one."),
];

/** Observed vulnerability, 0–100, from what was seen. */
export const scoreObservation = (observed: Record<string, unknown>): { score: number; answered: number } => {
  const values: number[] = [];
  for (const f of OBSERVATION_FIELDS) {
    const v = observed[f.name];
    if (v === undefined || v === null || v === "") continue;
    const opt = f.options.find((o) => o.value === String(v));
    if (opt) values.push(opt.weight);
  }
  if (!values.length) return { score: 0, answered: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const worst = Math.max(...values);
  return { score: Math.round(Math.max(0, Math.min(1, mean * 0.7 + worst * 0.3)) * 100), answered: values.length };
};

/* ------------------------------------------------------------------ */
/* Learning from the visits                                            */
/* ------------------------------------------------------------------ */

const CONFIDENCE_PRIOR = 8;

export interface Calibration {
  visits: number;
  usable: number;
  /** Mean signed error (predicted − observed). Positive = the system over-scores. */
  bias: number;
  /** Mean absolute error, in points. */
  error: number;
  /** Share of visits where the ground agreed with the record. */
  agreement: number;
  confidence: number;
  byCommunity: Record<string, { n: number; bias: number }>;
  byBand: Record<string, { n: number; bias: number }>;
  /** Bias for people scored on the record alone (no questionnaire). */
  recordOnlyBias: number;
  recordOnlyN: number;
  /** Ground-truth verdicts that override any score. */
  disqualified: Set<string>;
  verified: Map<string, LivelihoodVerificationRow>;
  lessons: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const shrink = (bias: number, n: number) => (n ? bias * (n / (n + CONFIDENCE_PRIOR)) : 0);

/**
 * Turns the visit history into the judgement the system applies from now on.
 * Deliberately conservative: corrections only grow as the evidence grows.
 */
export const learnFromVerifications = (
  rows: LivelihoodVerificationRow[],
  communityOf: (beneficiaryId: string) => string,
  completenessOf: (beneficiaryId: string) => number,
): Calibration => {
  // Newest visit per person wins — a place can be re-verified.
  const latest = new Map<string, LivelihoodVerificationRow>();
  for (const r of [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    latest.set(r.beneficiary_id, r);
  }
  const visits = [...latest.values()];
  const usable = visits.filter(
    (v) => v.observed_vulnerability != null && v.predicted_vulnerability != null
      && ["confirmed", "worse", "better"].includes(v.finding),
  );

  const errors = usable.map((v) => (v.predicted_vulnerability as number) - (v.observed_vulnerability as number));
  const bias = mean(errors);
  const error = mean(errors.map(Math.abs));
  const agreement = visits.length
    ? visits.filter((v) => v.finding === "confirmed").length / visits.length
    : 0;

  const byCommunity: Calibration["byCommunity"] = {};
  const byBand: Calibration["byBand"] = {};
  const recordOnly: number[] = [];

  for (const v of usable) {
    const e = (v.predicted_vulnerability as number) - (v.observed_vulnerability as number);
    const c = communityOf(v.beneficiary_id) || "—";
    (byCommunity[c] ||= { n: 0, bias: 0 });
    byCommunity[c].n += 1;
    byCommunity[c].bias += e;
    const band = String((v.observed as Record<string, unknown>).__band || "") || "unknown";
    (byBand[band] ||= { n: 0, bias: 0 });
    byBand[band].n += 1;
    byBand[band].bias += e;
    if (completenessOf(v.beneficiary_id) < 25) recordOnly.push(e);
  }
  for (const k of Object.keys(byCommunity)) byCommunity[k].bias /= byCommunity[k].n;
  for (const k of Object.keys(byBand)) byBand[k].bias /= byBand[k].n;

  const disqualified = new Set(
    visits.filter((v) => ["ineligible", "relocated"].includes(v.finding)).map((v) => v.beneficiary_id),
  );

  const lessons: string[] = [];
  const n = usable.length;
  if (!visits.length) {
    lessons.push("No ground verification yet — the ranking is still the record's opinion, not a confirmed list.");
  } else {
    lessons.push(
      `${visits.length} household${visits.length === 1 ? "" : "s"} verified on the ground; the record matched what was seen in ${Math.round(agreement * 100)}% of them.`,
    );
    if (n >= 3) {
      const b = shrink(bias, n);
      if (b > 4) lessons.push(`The scoring runs about ${Math.round(b)} points too generous — every score is now pulled down by that much until visits say otherwise.`);
      else if (b < -4) lessons.push(`The scoring understates need by about ${Math.round(-b)} points — every score is now lifted by that much.`);
      else lessons.push("Scores match the ground closely; no overall correction is being applied.");
      lessons.push(`Typical distance between the score and what the verifier found is ${Math.round(error)} points.`);
    } else {
      lessons.push("Too few visits to correct the scoring yet — at least three are needed before the system adjusts itself.");
    }
    const worstCommunity = Object.entries(byCommunity)
      .filter(([, v]) => v.n >= 3)
      .sort((a, b) => Math.abs(b[1].bias) - Math.abs(a[1].bias))[0];
    if (worstCommunity && Math.abs(worstCommunity[1].bias) > 8) {
      lessons.push(
        `In ${worstCommunity[0]} the record is consistently ${worstCommunity[1].bias > 0 ? "kinder" : "harsher"} than the home visit, so scores there are adjusted separately.`,
      );
    }
    if (recordOnly.length >= 3 && Math.abs(mean(recordOnly)) > 6) {
      lessons.push(
        `People scored from the file alone come out ${mean(recordOnly) > 0 ? "too high" : "too low"} — they are corrected and pushed to the top of the verification queue.`,
      );
    }
    if (disqualified.size) {
      lessons.push(`${disqualified.size} name${disqualified.size === 1 ? " was" : "s were"} removed outright after the visit (moved away or not eligible).`);
    }
  }

  return {
    visits: visits.length,
    usable: n,
    bias,
    error,
    agreement,
    confidence: Math.round((n / (n + CONFIDENCE_PRIOR)) * 100),
    byCommunity,
    byBand,
    recordOnlyBias: mean(recordOnly),
    recordOnlyN: recordOnly.length,
    disqualified,
    verified: latest,
    lessons,
  };
};

export interface AdjustedResult extends TargetingResult {
  /** Score before the system corrected itself. */
  predicted: number;
  /** Points added or removed by learning and by the visit itself. */
  adjustment: number;
  verification: LivelihoodVerificationRow | null;
  verdict: "unverified" | "confirmed" | "worse" | "better" | "removed" | "unreachable";
  /** Why the number moved. */
  adjustmentReasons: string[];
  /** 0–100: how sure the system is about this person's number. */
  certainty: number;
}

/**
 * Applies everything learned to one person's score.
 *
 * A verified person keeps the ground truth, blended towards the record only as
 * far as the questionnaire supports it. An unverified person is corrected by
 * the learned bias for their community and band. Nobody verified as gone or
 * ineligible stays on the list.
 */
export const applyCalibration = (
  r: TargetingResult,
  cal: Calibration,
): AdjustedResult => {
  const v = cal.verified.get(r.beneficiaryId) || null;
  const reasons: string[] = [];
  let score = r.vulnerability;
  let verdict: AdjustedResult["verdict"] = "unverified";
  let certainty = Math.round(35 + r.completeness * 0.45);

  if (v) {
    if (["ineligible", "relocated"].includes(v.finding)) {
      verdict = "removed";
      certainty = 100;
      reasons.push(v.finding === "relocated" ? "Verified as moved away." : "Verified as not eligible.");
    } else if (["not_found", "refused"].includes(v.finding)) {
      verdict = "unreachable";
      certainty = 55;
      reasons.push(v.finding === "refused" ? "Refused the verification visit." : "Not found at the address.");
    } else if (v.observed_vulnerability != null) {
      verdict = v.finding as AdjustedResult["verdict"];
      // Ground truth carries most of the weight; the file still counts for the
      // things a visit cannot see (income history, clinical record).
      score = Math.round(v.observed_vulnerability * 0.7 + r.vulnerability * 0.3);
      certainty = 92;
      const diff = score - r.vulnerability;
      reasons.push(
        diff === 0
          ? "Home visit agreed with the record."
          : `Home visit ${diff > 0 ? "raised" : "lowered"} the score by ${Math.abs(diff)} points.`,
      );
    }
  } else if (cal.usable >= 3) {
    const communityBias = cal.byCommunity[r.community];
    const b = communityBias && communityBias.n >= 3
      ? shrink(communityBias.bias, communityBias.n)
      : shrink(cal.bias, cal.usable);
    let delta = -b;
    if (r.completeness < 25 && cal.recordOnlyN >= 3) delta += -shrink(cal.recordOnlyBias, cal.recordOnlyN) * 0.5;
    if (Math.abs(delta) >= 1) {
      score = Math.max(0, Math.min(100, Math.round(score + delta)));
      reasons.push(
        `Corrected by ${delta > 0 ? "+" : ""}${Math.round(delta)} from what verifiers found in ${communityBias && communityBias.n >= 3 ? r.community : "this project"}.`,
      );
    }
    certainty = Math.min(80, certainty + Math.round(cal.confidence * 0.15));
  }

  const band: TargetingResult["band"] =
    score >= 75 ? "extreme" : score >= 60 ? "high" : score >= 40 ? "moderate" : "low";

  return {
    ...r,
    vulnerability: score,
    band,
    predicted: r.vulnerability,
    adjustment: score - r.vulnerability,
    verification: v,
    verdict,
    adjustmentReasons: reasons,
    certainty,
    flags: verdict === "removed"
      ? [...r.flags, "Removed after verification"]
      : verdict === "unreachable"
        ? [...r.flags, "Could not be verified"]
        : r.flags,
    consentGiven: verdict === "removed" ? false : r.consentGiven,
  };
};

/**
 * Who the verifier should visit next: the names where a mistake would actually
 * change who gets a place — around the cut-off line, thin records first, and
 * communities the system has already been wrong about.
 */
export const verificationQueue = (
  ranked: AdjustedResult[],
  places: number,
  cal: Calibration,
): { result: AdjustedResult; priority: number; why: string }[] => {
  const cut = ranked[Math.max(0, places - 1)]?.vulnerability ?? 0;
  return ranked
    .filter((r) => !r.verification)
    .map((r) => {
      let priority = 0;
      const why: string[] = [];
      const distance = Math.abs(r.vulnerability - cut);
      if (distance <= 8) { priority += 45; why.push("sits on the cut-off line"); }
      else if (distance <= 16) { priority += 25; why.push("close to the cut-off"); }
      if (r.completeness < 25) { priority += 30; why.push("scored from the file only"); }
      else if (r.completeness < 60) { priority += 15; why.push("assessment incomplete"); }
      const cb = cal.byCommunity[r.community];
      if (cb && cb.n >= 3 && Math.abs(cb.bias) > 8) { priority += 20; why.push(`${r.community} has been misread before`); }
      if (r.band === "extreme") { priority += 10; why.push("claims extreme vulnerability"); }
      return { result: r, priority, why: why.join(", ") || "routine spot-check" };
    })
    .sort((a, b) => b.priority - a.priority);
};

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

export const useLivelihoodVerifications = (projectId?: string) => {
  const [rows, setRows] = useState<LivelihoodVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("livelihood_verifications")
      .select("*").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(2000);
    setRows((data as LivelihoodVerificationRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  return { verifications: rows, loading, reload: load };
};

export const saveVerification = async (payload: {
  id?: string;
  project_id: string;
  module_id?: string | null;
  opportunity_id?: string | null;
  beneficiary_id: string;
  assessment_id?: string | null;
  visit_date: string;
  verifier_name?: string | null;
  verifier_role?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  finding: string;
  observed: Record<string, unknown>;
  observed_vulnerability: number | null;
  predicted_vulnerability: number | null;
  recommendation?: string | null;
  notes?: string | null;
}) => {
  const { data: auth } = await supabase.auth.getUser();
  const { id, ...rest } = payload;
  const row = { ...rest, verifier_id: auth.user?.id || null };
  const q = id
    ? db.from("livelihood_verifications").update(row).eq("id", id)
    : db.from("livelihood_verifications").insert(row);
  const { error } = await q;
  if (error) throw error;
};
