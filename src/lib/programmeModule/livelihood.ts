// Livelihood & economic empowerment targeting.
//
// How a seasoned livelihood officer selects people affected by NTDs for an
// empowerment opportunity, written down so the device can do it consistently
// for a whole register in a second:
//
//   1. Nobody is ranked on opinion. Every person carries a vulnerability score
//      built from five domains that a household economic assessment would look
//      at anyway — economic deprivation, dependency burden, disease and
//      disability burden, social exclusion, and shocks and coping.
//   2. Most of that score is already in the record: registration details
//      (occupation, income source, vulnerability status, disability, living
//      arrangement, caregiver), the disease condition (morbidity stage, acute
//      attacks, surgery status), and follow-up behaviour (missed appointments,
//      home-visit outcomes). The questionnaire only asks what the record cannot
//      answer.
//   3. Vulnerability decides WHO is prioritised. Readiness decides WHAT they
//      are offered — a very vulnerable person with no working capacity is not
//      dropped, they are routed to consumption support and self-care first,
//      then to the productive grant. That is the graduation approach.
//   4. The shortlist respects the number of places available and the inclusion
//      floors the programme committed to (women, persons with disabilities),
//      one place per household, and community spread — exactly the horse-
//      trading a selection committee does on paper.
//
// Everything is deterministic and explained: each score comes with the reasons
// that produced it, so a committee can defend or overturn it.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BeneficiaryRow } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface LivelihoodOpportunityRow {
  id: string;
  project_id: string;
  module_id: string | null;
  title: string;
  partner: string | null;
  opportunity_type: string | null;
  target_beneficiaries: number;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community?: string | null;
  /** Where the training / market / venue actually sits, for travel analysis. */
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  start_date: string | null;
  quota_women_pct: number;
  quota_disability_pct: number;
  one_per_household: boolean;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface LivelihoodAssessmentRow {
  id: string;
  project_id: string;
  module_id: string | null;
  beneficiary_id: string;
  opportunity_id: string | null;
  answers: Record<string, unknown>;
  vulnerability_score: number;
  readiness_score: number;
  priority_band: string | null;
  domain_scores: Record<string, number>;
  recommended_package: string | null;
  decision: string;
  decision_notes: string | null;
  assessed_on: string;
  created_at: string;
}

export const OPPORTUNITY_TYPES = [
  { value: "cash_grant", label: "Productive cash grant / start-up capital" },
  { value: "vsla", label: "Savings group (VSLA) membership" },
  { value: "skills", label: "Vocational skills training & tool kit" },
  { value: "agric", label: "Agricultural input / livestock package" },
  { value: "petty_trade", label: "Petty trade / micro-enterprise support" },
  { value: "apprenticeship", label: "Apprenticeship placement" },
  { value: "employment", label: "Wage employment / job linkage" },
  { value: "other", label: "Other empowerment opportunity" },
];

export const DECISIONS = [
  { value: "assessed", label: "Assessed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "selected", label: "Selected" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "not_eligible", label: "Not eligible" },
  { value: "declined", label: "Declined the offer" },
];

/* ------------------------------------------------------------------ */
/* The assessment form                                                 */
/* ------------------------------------------------------------------ */

export interface AssessmentField {
  name: string;
  label: string;
  hint?: string;
  type: "select" | "number" | "text";
  options?: { value: string; label: string; /** 0 = not vulnerable, 1 = most vulnerable */ weight: number }[];
  /** For numbers: value that counts as fully vulnerable. */
  max?: number;
  invert?: boolean;
}

export interface AssessmentSection {
  key: DomainKey | "readiness" | "protection" | "preference";
  title: string;
  intro: string;
  fields: AssessmentField[];
}

export type DomainKey =
  | "economic" | "dependency" | "disease" | "exclusion" | "shocks" | "access";

const sel = (
  name: string, label: string,
  options: [string, string, number][],
  hint?: string,
): AssessmentField => ({
  name, label, hint, type: "select",
  options: options.map(([value, l, weight]) => ({ value, label: l, weight })),
});

/**
 * The questionnaire. Short on purpose — 24 questions an enumerator can finish
 * in one sitting at the household, none of them duplicating the registration
 * form or the clinical record.
 */
export const ASSESSMENT_SECTIONS: AssessmentSection[] = [
  {
    key: "economic",
    title: "Household economy",
    intro: "What the household actually lives on, not what it is expected to earn.",
    fields: [
      sel("income_monthly", "Total household income last month", [
        ["none", "No income at all", 1],
        ["under_10k", "Below ₦10,000", 0.9],
        ["10_30k", "₦10,000 – ₦30,000", 0.7],
        ["30_60k", "₦30,000 – ₦60,000", 0.45],
        ["60_120k", "₦60,000 – ₦120,000", 0.2],
        ["over_120k", "Above ₦120,000", 0],
      ]),
      sel("income_regularity", "How regular is that income?", [
        ["none", "No earner in the household", 1],
        ["seasonal", "Seasonal only", 0.8],
        ["irregular", "Irregular / daily hustle", 0.6],
        ["regular", "Regular monthly income", 0.1],
      ]),
      sel("meals_per_day", "Meals eaten yesterday by the adults", [
        ["none", "No full meal", 1],
        ["one", "One meal", 0.85],
        ["two", "Two meals", 0.45],
        ["three", "Three or more", 0],
      ], "Food security is the fastest honest read on deprivation."),
      sel("food_worry", "In the last month, did the household go a whole day without eating?", [
        ["often", "Often", 1], ["sometimes", "Sometimes", 0.6],
        ["rarely", "Rarely", 0.3], ["never", "Never", 0],
      ]),
      sel("productive_assets", "Productive assets owned (land, livestock, machine, shop stock)", [
        ["none", "None", 1], ["one", "One small asset", 0.7],
        ["some", "Two or three", 0.35], ["several", "Several / substantial", 0],
      ]),
      sel("housing", "Housing", [
        ["homeless", "No fixed shelter", 1],
        ["shared", "Sheltered by relatives / charity", 0.8],
        ["rented_poor", "Rented, poor condition", 0.6],
        ["owned_poor", "Owned, poor condition", 0.4],
        ["adequate", "Adequate housing", 0],
      ]),
      sel("debt", "Household debt burden", [
        ["crippling", "Borrowing to eat / debt cannot be repaid", 1],
        ["moderate", "Some debt, being repaid", 0.5],
        ["none", "No debt", 0],
      ]),
    ],
  },
  {
    key: "dependency",
    title: "Who depends on this person",
    intro: "Dependency decides how thin any income is spread.",
    fields: [
      { name: "dependants", label: "People depending on this household's income", type: "number", max: 10 },
      { name: "children_under_5", label: "Children under five in the household", type: "number", max: 4 },
      { name: "children_out_of_school", label: "School-age children currently out of school", type: "number", max: 4 },
      sel("other_earners", "Other working adults in the household", [
        ["none", "None — this person is the only one", 1],
        ["one", "One other", 0.5],
        ["two_plus", "Two or more", 0],
      ]),
      sel("care_burden", "Time spent caring for a sick or disabled family member", [
        ["full_time", "Full time — cannot work", 1],
        ["most_days", "Most days", 0.7],
        ["occasional", "Occasionally", 0.3],
        ["none", "None", 0],
      ]),
    ],
  },
  {
    key: "disease",
    title: "Effect of the condition on earning",
    intro: "The NTD-specific part: what the disease costs this person in work and money.",
    fields: [
      { name: "workdays_lost", label: "Workdays lost to the condition in the last month", type: "number", max: 20 },
      sel("work_capacity", "Ability to do their usual work today", [
        ["none", "Cannot work at all", 1],
        ["severe", "Severely limited", 0.8],
        ["some", "Limited but working", 0.5],
        ["full", "Works normally", 0.1],
      ]),
      sel("mobility", "Getting to the market or farm", [
        ["housebound", "Housebound", 1],
        ["assisted", "Only with help", 0.75],
        ["painful", "Alone, but with pain or difficulty", 0.45],
        ["normal", "No difficulty", 0],
      ]),
      sel("treatment_cost", "Money spent on this condition each month", [
        ["catastrophic", "More than the household earns", 1],
        ["heavy", "A large share of income", 0.7],
        ["small", "A small amount", 0.3],
        ["none", "Nothing", 0],
      ]),
      sel("lost_livelihood", "Has the condition already ended a trade or job?", [
        ["yes_permanent", "Yes — lost it permanently", 1],
        ["yes_reduced", "Yes — had to reduce it", 0.65],
        ["no", "No", 0],
      ]),
    ],
  },
  {
    key: "exclusion",
    title: "Stigma, voice and social protection",
    intro: "Exclusion is why affected people stay poor even where programmes exist.",
    fields: [
      sel("stigma", "Experience of stigma because of the condition", [
        ["severe", "Excluded from gatherings, market or worship", 1],
        ["moderate", "Talked about, avoided by some", 0.6],
        ["mild", "Occasional remarks", 0.3],
        ["none", "None", 0],
      ]),
      sel("group_membership", "Belongs to any savings, farming or trade group", [
        ["none", "Belongs to none", 1],
        ["inactive", "Member but inactive", 0.5],
        ["active", "Active member", 0],
      ]),
      sel("social_protection", "Receiving any grant, cash transfer or aid now", [
        ["none", "Nothing at all", 1],
        ["one_off", "One-off support received before", 0.5],
        ["current", "Currently receiving support", 0],
      ], "Programmes should reach those no other programme reached."),
      sel("decision_power", "Control over how household money is spent", [
        ["none", "No say at all", 1],
        ["little", "Little say", 0.6],
        ["shared", "Shared decisions", 0.2],
        ["full", "Decides", 0],
      ]),
      sel("id_documents", "Has identification (NIN, voter card, BVN)", [
        ["none", "None", 0.7], ["one", "One document", 0.3], ["full", "NIN and bank/BVN", 0],
      ], "Missing documents block payment — flag for support, not for exclusion."),
    ],
  },
  {
    key: "shocks",
    title: "Shocks and coping",
    intro: "Recent shocks tell you who is falling, not just who is poor.",
    fields: [
      sel("recent_shock", "Major shock in the last 12 months", [
        ["multiple", "More than one (death, flood, displacement, theft, illness)", 1],
        ["one", "One shock", 0.6],
        ["none", "None", 0],
      ]),
      sel("coping", "How the household coped", [
        ["harmful", "Sold productive assets, withdrew children, begged", 1],
        ["borrowing", "Borrowed or reduced meals", 0.7],
        ["savings", "Used savings or family help", 0.3],
        ["none", "Did not need to cope", 0],
      ]),
      sel("displacement", "Displacement status", [
        ["idp", "Displaced and not returned", 1],
        ["returnee", "Returned within the last year", 0.6],
        ["host", "Hosting displaced relatives", 0.3],
        ["none", "Not affected", 0],
      ]),
    ],
  },
  {
    key: "access",
    title: "Where they live & reaching care",
    intro:
      "Distance is not a detail. A person who walks three hours to the clinic pays for it in "
      + "transport, lost trading days and missed treatment — and will pay the same price to reach "
      + "a training centre or a market.",
    fields: [
      sel("facility_travel_time", "Time to reach the health facility they are registered at", [
        ["over_2h", "More than 2 hours", 1],
        ["1_2h", "1 – 2 hours", 0.75],
        ["30_60m", "30 – 60 minutes", 0.45],
        ["under_30m", "Under 30 minutes", 0.1],
      ]),
      sel("transport_mode", "How they normally travel", [
        ["walk", "On foot only", 1],
        ["hired", "Hired okada / taxi each time", 0.75],
        ["shared", "Shared public transport", 0.5],
        ["own", "Own transport", 0],
      ]),
      sel("transport_cost", "Return transport cost for one visit", [
        ["cannot_afford", "Cannot afford it at all", 1],
        ["high", "More than a day's income", 0.8],
        ["moderate", "About half a day's income", 0.45],
        ["low", "Little or nothing", 0],
      ]),
      sel("road_access", "Road condition to the community", [
        ["cut_off", "Cut off in the rains / by water", 1],
        ["poor", "Poor, passable with difficulty", 0.65],
        ["fair", "Fair", 0.3],
        ["good", "Good all year", 0],
      ]),
      sel("missed_for_distance", "Has distance or transport already made them miss treatment?", [
        ["often", "Often", 1], ["sometimes", "Sometimes", 0.6],
        ["once", "Once", 0.3], ["never", "Never", 0],
      ]),
      {
        name: "travel_willingness_km",
        label: "Furthest they can travel for the opportunity (km)",
        type: "number", max: 20, invert: true,
        hint: "Used to check the venue is actually reachable — not to score vulnerability.",
      },
    ],
  },
  {
    key: "preference",
    title: "What they want to do — in their own words",
    intro:
      "The single best predictor of whether support survives the first year is whether the person "
      + "chose the trade themselves. Their choice and their reason carry real weight in the ranking.",
    fields: [
      sel("preferred_opportunity", "Livelihood they would most like to be supported with",
        OPPORTUNITY_TYPES.map((o) => [o.value, o.label, 0] as [string, string, number])),
      sel("preferred_second", "Second choice if the first is not offered",
        [["none", "No second choice", 0] as [string, string, number],
          ...OPPORTUNITY_TYPES.map((o) => [o.value, o.label, 0] as [string, string, number])]),
      sel("preference_reason", "Main reason for that choice", [
        ["existing_skill", "Already knows the trade", 0],
        ["market_demand", "There is demand for it here", 0],
        ["fits_condition", "It is work the condition allows", 0],
        ["low_capital", "It needs little capital to keep running", 0],
        ["family_support", "Family can help run it", 0],
        ["quick_income", "It brings money in quickly", 0],
        ["only_option", "It is the only thing available", 0],
        ["other", "Other reason", 0],
      ]),
      { name: "preference_narrative", label: "Why, in their own words", type: "text" },
      sel("preference_strength", "How settled is this choice?", [
        ["decided", "Decided — has thought it through", 0],
        ["leaning", "Leaning towards it", 0],
        ["open", "Open to advice", 0],
        ["unsure", "Does not know yet", 0],
      ]),
      sel("prior_experience", "Experience in the preferred livelihood", [
        ["ran_it", "Has run it before", 0],
        ["helped", "Helped someone run it", 0],
        ["trained", "Trained but never practised", 0],
        ["none", "No experience", 0],
      ]),
      sel("accepts_alternative", "Would they accept a different package if this one is full?", [
        ["yes", "Yes, gladly", 0], ["maybe", "Possibly, with discussion", 0], ["no", "No", 0],
      ]),
      sel("start_timeline", "How soon could they start?", [
        ["now", "Immediately", 0], ["one_month", "Within a month", 0],
        ["after_treatment", "After treatment or surgery", 0], ["unsure", "Not sure", 0],
      ]),
    ],
  },
  {
    key: "readiness",
    title: "Readiness for the opportunity",
    intro:
      "Not used to exclude anyone. It decides which package fits — productive grant now, "
      + "or care and consumption support first, then the grant.",
    fields: [
      sel("interest", "Interest in taking up an opportunity", [
        ["high", "Strongly wants it", 1], ["some", "Interested with support", 0.6],
        ["unsure", "Unsure", 0.3], ["no", "Not interested now", 0],
      ]),
      sel("skill_base", "Existing trade or skill to build on", [
        ["strong", "Has run a trade before", 1], ["some", "Some experience", 0.6],
        ["none", "None", 0.2],
      ]),
      sel("time_available", "Hours a day available for the activity", [
        ["four_plus", "Four or more", 1], ["two_four", "Two to four", 0.7],
        ["under_two", "Under two", 0.3], ["none", "None", 0],
      ]),
      sel("market_access", "Distance to a market or customers", [
        ["in_community", "In the community", 1], ["under_5km", "Under 5 km", 0.7],
        ["5_15km", "5 – 15 km", 0.4], ["over_15km", "Over 15 km", 0.1],
      ]),
      sel("numeracy", "Can keep simple records / count money", [
        ["yes", "Yes", 1], ["with_help", "With help", 0.6], ["no", "No", 0.2],
      ]),
      sel("support_person", "Family member who will support the activity", [
        ["yes", "Yes", 1], ["maybe", "Possibly", 0.5], ["no", "No", 0],
      ]),
    ],
  },
  {
    key: "protection",
    title: "Protection & consent",
    intro: "Nobody is put on a list without knowing, and risk is checked before money moves.",
    fields: [
      sel("consent", "Consents to be considered and assessed", [
        ["yes", "Yes", 0], ["no", "No", 1],
      ]),
      sel("protection_risk", "Any safeguarding or protection concern", [
        ["yes", "Yes — refer to the safeguarding officer", 1],
        ["no", "No concern", 0],
      ]),
      { name: "assessor_note", label: "Assessor's note", type: "text" },
    ],
  },
];

export const ALL_FIELDS: AssessmentField[] =
  ASSESSMENT_SECTIONS.flatMap((s) => s.fields);

export const fieldByName = (name: string) => ALL_FIELDS.find((f) => f.name === name);

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** How much each domain counts towards the vulnerability score. */
export const DOMAIN_WEIGHTS: Record<DomainKey, number> = {
  economic: 0.28,
  dependency: 0.13,
  disease: 0.23,
  exclusion: 0.13,
  shocks: 0.10,
  access: 0.13,
};

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  economic: "Economic deprivation",
  dependency: "Dependency burden",
  disease: "Disease & disability burden",
  exclusion: "Exclusion & social protection gap",
  shocks: "Shocks & harmful coping",
  access: "Distance, transport & reaching care",
};

export interface TargetingInput {
  beneficiary: BeneficiaryRow;
  answers?: Record<string, unknown>;
  /** Highest morbidity stage number recorded (1–7), if any. */
  morbidityStage?: number | null;
  acuteAttacks?: number | null;
  surgeryPending?: boolean;
  /** Follow-up behaviour. */
  missedVisits?: number;
  lastVisitDaysAgo?: number | null;
  homeVisitOutcomes?: string[];
  /** Loss-to-follow-up score, 0–100, when already computed. */
  ltfuScore?: number | null;
  /** Straight-line km from the person's home to the facility holding the case. */
  distanceToFacilityKm?: number | null;
  /** Straight-line km from the person's home to where the opportunity runs. */
  distanceToOpportunityKm?: number | null;
  /** Type of support on offer, so the person's own preference can be matched. */
  opportunityType?: string | null;
  /** How well the person's location matches the opportunity's location filters. */
  locationTier?: "ward" | "lga" | "state" | "outside" | null;
}

export interface TargetingResult {
  beneficiaryId: string;
  name: string;
  caseId: string;
  vulnerability: number;
  readiness: number;
  band: "extreme" | "high" | "moderate" | "low";
  domains: Record<DomainKey, number>;
  reasons: string[];
  package: string;
  /** Questions still unanswered — a fuller assessment moves the score. */
  completeness: number;
  flags: string[];
  female: boolean;
  disability: boolean;
  householdId: string | null;
  community: string;
  consentGiven: boolean;
  protectionConcern: boolean;
  /** Distance analysis. */
  distanceToFacilityKm: number | null;
  distanceToOpportunityKm: number | null;
  locationTier: "ward" | "lga" | "state" | "outside" | "unknown";
  /** The person's own stated choice. */
  preferenceChoice: string | null;
  preferenceLabel: string | null;
  preferenceReason: string | null;
  preferenceNarrative: string | null;
  /** 0–100: how well the offer matches what they asked for. */
  preferenceFit: number;
  preferenceNotes: string[];
  travelWillingnessKm: number | null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const answerWeight = (field: AssessmentField, value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "number") {
    const n = num(value);
    if (n == null) return null;
    const max = field.max || 10;
    return Math.max(0, Math.min(1, n / max));
  }
  const opt = field.options?.find((o) => o.value === String(value));
  return opt ? opt.weight : null;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const text = (v: unknown) => String(v ?? "").toLowerCase();

/**
 * Signals read straight from the record, so a person is never scored as
 * "not vulnerable" simply because nobody has filled the questionnaire yet.
 */
const recordSignals = (input: TargetingInput) => {
  const p = (input.beneficiary.profile || {}) as Record<string, unknown>;
  const reasons: string[] = [];
  const add: Partial<Record<DomainKey, number[]>> = {};
  const push = (d: DomainKey, v: number) => { (add[d] ||= []).push(clamp01(v)); };

  const vuln = text(p.vulnerability_status ?? p.vulnerability);
  if (vuln.includes("extreme")) { push("economic", 1); reasons.push("Registered as extremely vulnerable."); }
  if (vuln.includes("displaced") || vuln.includes("idp")) { push("shocks", 0.9); reasons.push("Internally displaced."); }
  if (vuln.includes("female-headed")) { push("dependency", 0.8); reasons.push("Female-headed household."); }
  if (vuln.includes("child-headed")) { push("dependency", 1); reasons.push("Child-headed household."); }
  if (vuln.includes("elderly")) { push("dependency", 0.8); reasons.push("Elderly without a caregiver."); }

  const occ = text(p.occupation);
  if (occ.includes("unemployed")) { push("economic", 1); reasons.push("Unemployed at registration."); }
  else if (occ.includes("daily wage") || occ.includes("informal")) { push("economic", 0.75); reasons.push("Casual, day-to-day work only."); }
  else if (occ.includes("homemaker")) push("economic", 0.6);

  const inc = text(p.income_source);
  if (inc.includes("no regular income")) { push("economic", 1); reasons.push("No regular income source recorded."); }
  else if (inc.includes("casual") || inc.includes("remittance") || inc.includes("humanitarian")) push("economic", 0.7);

  const dis = text(p.disability_status ?? p.disability);
  const hasDisability = dis.startsWith("yes") || dis.includes("difficulty") || dis.includes("cannot");
  if (hasDisability) { push("disease", 0.8); reasons.push("Living with a disability."); }

  const living = text(p.living_arrangement);
  if (living.includes("alone")) { push("exclusion", 0.7); reasons.push("Lives alone."); }
  if (living.includes("no fixed")) { push("economic", 1); reasons.push("No fixed shelter."); }

  const care = text(p.caregiver_availability);
  if (care.includes("no caregiver")) { push("dependency", 0.8); reasons.push("No caregiver available."); }

  const marital = text(p.marital_status);
  if (marital.includes("widow")) { push("dependency", 0.7); reasons.push("Widowed."); }

  const size = num(p.household_size);
  if (size != null && size >= 6) { push("dependency", Math.min(1, size / 12)); reasons.push(`Large household (${size} people).`); }

  const cond = text(p.primary_condition ?? p.primary_health_condition);
  if (cond && !cond.includes("none")) push("disease", 0.45);

  // Clinical burden
  if (input.morbidityStage) {
    const s = clamp01((input.morbidityStage - 1) / 6);
    push("disease", Math.max(0.4, s));
    if (input.morbidityStage >= 4) reasons.push(`Advanced morbidity (stage ${input.morbidityStage}) — heavy effect on work.`);
  }
  if (input.acuteAttacks && input.acuteAttacks > 0) {
    push("disease", clamp01(input.acuteAttacks / 6));
    reasons.push(`${input.acuteAttacks} acute attack${input.acuteAttacks === 1 ? "" : "s"} in the last year.`);
  }
  if (input.surgeryPending) { push("disease", 0.7); reasons.push("Waiting for surgery."); }

  // Follow-up behaviour — repeated misses usually mean cost and distance.
  if (input.missedVisits && input.missedVisits > 0) {
    push("economic", clamp01(input.missedVisits / 3));
    reasons.push(`Missed ${input.missedVisits} scheduled visit${input.missedVisits === 1 ? "" : "s"} — often a cost barrier.`);
  }
  if (input.ltfuScore != null && input.ltfuScore >= 55) {
    push("exclusion", clamp01(input.ltfuScore / 100));
    reasons.push("High risk of dropping out of care.");
  }
  for (const o of input.homeVisitOutcomes || []) {
    if (o === "not_found" || o === "travelled") push("shocks", 0.5);
    if (o === "refused") { push("exclusion", 0.7); reasons.push("Declined care at a home visit — needs re-engagement."); }
    if (o === "relocated") { push("shocks", 0.8); reasons.push("Reported to have relocated."); }
  }

  // Distance — measured, not asked. Remoteness is a vulnerability in itself and
  // it is the reason many affected people never convert support into income.
  const dFac = input.distanceToFacilityKm;
  if (dFac != null && dFac > 0) {
    push("access", clamp01(dFac / 15));
    if (dFac >= 10) reasons.push(`Lives ${dFac.toFixed(1)} km from the facility holding the case — a real cost every visit.`);
  }
  const dOpp = input.distanceToOpportunityKm;
  if (dOpp != null && dOpp > 0) {
    push("access", clamp01(dOpp / 25) * 0.6);
    if (dOpp >= 20) reasons.push(`${dOpp.toFixed(1)} km from where the opportunity runs — check transport before enrolling.`);
  }
  if (input.locationTier === "outside") reasons.push("Lives outside the area this opportunity covers.");

  return { add, reasons };
};

export const scoreLivelihood = (input: TargetingInput): TargetingResult => {
  const answers = input.answers || {};
  const domainValues: Record<DomainKey, number[]> = {
    economic: [], dependency: [], disease: [], exclusion: [], shocks: [], access: [],
  };

  let answered = 0;
  let askable = 0;
  const readinessValues: number[] = [];

  for (const section of ASSESSMENT_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === "text") continue;
      askable += 1;
      const w = answerWeight(f, answers[f.name]);
      if (w == null) continue;
      answered += 1;
      if (section.key === "readiness") readinessValues.push(w);
      else if (section.key === "protection" || section.key === "preference") continue;
      else domainValues[section.key].push(w);
    }
  }

  const signals = recordSignals(input);
  (Object.keys(domainValues) as DomainKey[]).forEach((d) => {
    domainValues[d].push(...(signals.add[d] || []));
  });

  const domains = {} as Record<DomainKey, number>;
  let vulnerability = 0;
  let weightUsed = 0;
  (Object.keys(DOMAIN_WEIGHTS) as DomainKey[]).forEach((d) => {
    const vals = domainValues[d];
    if (!vals.length) { domains[d] = 0; return; }
    // Mean, pulled towards the worst answer: one catastrophic item should not
    // be averaged away by five mild ones — the way an officer actually reads it.
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const worst = Math.max(...vals);
    const v = clamp01(mean * 0.65 + worst * 0.35);
    domains[d] = Math.round(v * 100);
    vulnerability += v * DOMAIN_WEIGHTS[d];
    weightUsed += DOMAIN_WEIGHTS[d];
  });
  const vulnScore = Math.round((weightUsed ? vulnerability / weightUsed : 0) * 100);

  const baseReadiness = readinessValues.length
    ? Math.round((readinessValues.reduce((a, b) => a + b, 0) / readinessValues.length) * 100)
    : 0;

  /* --- The person's own choice -------------------------------------- */
  const choice = String(answers.preferred_opportunity ?? "") || null;
  const second = String(answers.preferred_second ?? "") || null;
  const offer = input.opportunityType || null;
  const strength = String(answers.preference_strength ?? "");
  const experience = String(answers.prior_experience ?? "");
  const accepts = String(answers.accepts_alternative ?? "");
  const preferenceNotes: string[] = [];

  let fit = 50; // nothing asked yet — neutral, never a penalty
  if (choice && offer) {
    if (choice === offer) {
      fit = 88;
      preferenceNotes.push("This is the livelihood they asked for themselves.");
    } else if (second && second === offer) {
      fit = 68;
      preferenceNotes.push("Their second choice — they said they would take it.");
    } else if (accepts === "yes") {
      fit = 52;
      preferenceNotes.push(`Wanted ${OPPORTUNITY_TYPES.find((o) => o.value === choice)?.label || choice}, but is glad to take this instead.`);
    } else if (accepts === "maybe") {
      fit = 40;
      preferenceNotes.push("Asked for something else — willing to discuss this one.");
    } else {
      fit = 18;
      preferenceNotes.push("Asked for a different livelihood and does not want this one — discuss before offering a place.");
    }
  } else if (choice && !offer) {
    fit = 60;
  }
  if (strength === "decided") fit += 8;
  else if (strength === "unsure") fit -= 8;
  if (experience === "ran_it") { fit += 8; preferenceNotes.push("Has run this kind of trade before."); }
  else if (experience === "none" && fit > 30) fit -= 4;
  if (String(answers.start_timeline ?? "") === "now") fit += 4;
  if (String(answers.start_timeline ?? "") === "after_treatment") {
    preferenceNotes.push("Can only start after treatment or surgery — sequence care first.");
  }
  const preferenceFit = Math.max(0, Math.min(100, Math.round(fit)));
  if (String(answers.preference_reason ?? "") === "only_option") {
    preferenceNotes.push("Chose it because nothing else is available — check the market before investing.");
  }

  // Readiness is what the person can do AND what they actually want to do.
  const readiness = readinessValues.length
    ? Math.round(baseReadiness * 0.7 + preferenceFit * 0.3)
    : preferenceFit && choice ? Math.round(preferenceFit * 0.6) : 0;

  const travelWillingnessKm = (() => {
    const n = num(answers.travel_willingness_km);
    return n != null && n > 0 ? n : null;
  })();

  const band: TargetingResult["band"] =
    vulnScore >= 75 ? "extreme" : vulnScore >= 60 ? "high" : vulnScore >= 40 ? "moderate" : "low";

  const consentGiven = String(answers.consent ?? "") !== "no";
  const protectionConcern = String(answers.protection_risk ?? "") === "yes";

  const flags: string[] = [];
  if (!consentGiven) flags.push("Has not consented");
  if (protectionConcern) flags.push("Safeguarding concern — refer before enrolling");
  if (String(answers.id_documents ?? "") === "none") flags.push("No ID — support enrolment for payment");
  if (String(answers.work_capacity ?? "") === "none") flags.push("Cannot work today — care first");
  if (choice && offer && choice !== offer && accepts === "no") {
    flags.push("Prefers a different livelihood");
  }
  if (travelWillingnessKm != null && input.distanceToOpportunityKm != null
    && input.distanceToOpportunityKm > travelWillingnessKm) {
    flags.push(`Venue is ${Math.round(input.distanceToOpportunityKm)} km away — further than they can travel`);
  }
  if ((input.distanceToFacilityKm ?? 0) >= 15) flags.push("Very far from the facility — plan outreach");

  const choiceLabel = choice
    ? OPPORTUNITY_TYPES.find((o) => o.value === choice)?.label || choice : null;

  const pkg = (() => {
    if (band === "low") return "Not a priority for this round — keep on the register.";
    const wanted = choiceLabel ? ` Build it around their own choice: ${choiceLabel.toLowerCase()}.` : "";
    if (readiness >= 70) {
      return (band === "extreme"
        ? "Productive grant with close mentoring, plus three months of consumption support."
        : "Productive grant or skills package — ready to start.") + wanted;
    }
    if (readiness >= 40) {
      return "Group-based support first (savings group and skills), then a grant at the next cycle." + wanted;
    }
    return "Care and consumption support first — morbidity management, self-care and cash for basics; "
      + "re-assess for a productive package in three months." + wanted;
  })();

  const reasons = [...signals.reasons];
  const worstDomain = (Object.keys(domains) as DomainKey[])
    .sort((a, b) => domains[b] - domains[a])[0];
  if (worstDomain && domains[worstDomain] > 0) {
    reasons.unshift(`${DOMAIN_LABELS[worstDomain]} is the strongest driver (${domains[worstDomain]}/100).`);
  }
  if (!reasons.length) reasons.push("No vulnerability signals recorded yet — complete the assessment.");

  const p = (input.beneficiary.profile || {}) as Record<string, unknown>;
  const sex = text(p.gender ?? p.sex);
  const dis = text(p.disability_status ?? p.disability);

  return {
    beneficiaryId: input.beneficiary.id,
    name: input.beneficiary.full_name,
    caseId: input.beneficiary.case_id,
    vulnerability: vulnScore,
    readiness,
    band,
    domains,
    reasons,
    package: pkg,
    completeness: askable ? Math.round((answered / askable) * 100) : 0,
    flags,
    female: sex.startsWith("f"),
    disability: dis.startsWith("yes") || dis.includes("difficulty") || dis.includes("cannot"),
    householdId: (input.beneficiary as unknown as { household_id?: string }).household_id || null,
    community: input.beneficiary.village || input.beneficiary.ward || "—",
    consentGiven,
    protectionConcern,
    distanceToFacilityKm: input.distanceToFacilityKm ?? null,
    distanceToOpportunityKm: input.distanceToOpportunityKm ?? null,
    locationTier: input.locationTier || "unknown",
    preferenceChoice: choice,
    preferenceLabel: choiceLabel,
    preferenceReason: String(answers.preference_reason ?? "") || null,
    preferenceNarrative: String(answers.preference_narrative ?? "") || null,
    preferenceFit,
    preferenceNotes,
    travelWillingnessKm,
  };
};

export const BAND_LABELS: Record<TargetingResult["band"], string> = {
  extreme: "Extremely vulnerable",
  high: "Highly vulnerable",
  moderate: "Moderately vulnerable",
  low: "Lower vulnerability",
};

export const BAND_TONE: Record<TargetingResult["band"], "danger" | "warning" | "neutral" | "success"> = {
  extreme: "danger", high: "warning", moderate: "neutral", low: "success",
};

/* ------------------------------------------------------------------ */
/* Shortlisting against the number of places                           */
/* ------------------------------------------------------------------ */

export interface ShortlistOptions {
  target: number;
  quotaWomenPct?: number;
  quotaDisabilityPct?: number;
  onePerHousehold?: boolean;
  /** Only consider people in this location, when the opportunity is local. */
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
}

export interface ShortlistEntry {
  result: TargetingResult;
  rank: number;
  /** Why this person made the list. */
  basis: string;
}

export interface ShortlistOutcome {
  selected: ShortlistEntry[];
  waitlist: ShortlistEntry[];
  excluded: { result: TargetingResult; why: string }[];
  summary: {
    target: number;
    selected: number;
    women: number;
    womenPct: number;
    disability: number;
    disabilityPct: number;
    communities: number;
    meanVulnerability: number;
    quotaWomenMet: boolean;
    quotaDisabilityMet: boolean;
    /** Preference & distance analysis of the selected list. */
    ownChoice: number;
    meanPreferenceFit: number;
    meanDistanceKm: number | null;
    farFromVenue: number;
  };
}

/**
 * Builds the selection list for exactly the number of places available:
 * highest vulnerability first, inclusion floors honoured by reserving places
 * for the highest-scoring women and persons with disabilities, one place per
 * household, and people without consent or with an open safeguarding concern
 * held back rather than quietly enrolled.
 */
export const buildShortlist = (
  results: TargetingResult[],
  opts: ShortlistOptions,
  locationOf?: (r: TargetingResult) => { state?: string | null; lga?: string | null; ward?: string | null },
): ShortlistOutcome => {
  const excluded: { result: TargetingResult; why: string }[] = [];
  const eligible: TargetingResult[] = [];

  for (const r of results) {
    const loc = locationOf?.(r) || {};
    if (opts.state && loc.state && loc.state !== opts.state) {
      excluded.push({ result: r, why: `Outside ${opts.state}` }); continue;
    }
    if (opts.lga && loc.lga && loc.lga !== opts.lga) {
      excluded.push({ result: r, why: `Outside ${opts.lga} LGA` }); continue;
    }
    if (opts.ward && loc.ward && loc.ward !== opts.ward) {
      excluded.push({ result: r, why: `Outside ${opts.ward} ward` }); continue;
    }
    if (!r.consentGiven) { excluded.push({ result: r, why: "Has not consented" }); continue; }
    if (r.protectionConcern) {
      excluded.push({ result: r, why: "Safeguarding concern — refer before enrolling" }); continue;
    }
    if (r.band === "low") { excluded.push({ result: r, why: "Lower vulnerability than the pool" }); continue; }
    eligible.push(r);
  }

  // Need comes first, but a place given to someone who wants a different trade
  // is a place wasted — so the person's own stated choice shapes the order too.
  const suitability = (r: TargetingResult) =>
    r.vulnerability * 0.75 + r.preferenceFit * 0.25;

  const order = (a: TargetingResult, b: TargetingResult) =>
    suitability(b) - suitability(a)
    || b.vulnerability - a.vulnerability
    || b.domains.disease - a.domains.disease
    || b.readiness - a.readiness
    || a.name.localeCompare(b.name);

  const basisFor = (r: TargetingResult, lead: string) => {
    const bits = [lead];
    if (r.preferenceLabel && r.preferenceFit >= 80) bits.push("asked for this livelihood themselves");
    else if (r.preferenceLabel && r.preferenceFit < 30) bits.push(`would rather do ${r.preferenceLabel.toLowerCase()}`);
    if (r.distanceToOpportunityKm != null) bits.push(`${r.distanceToOpportunityKm.toFixed(1)} km from the venue`);
    return bits.join(" · ");
  };

  const pool = [...eligible].sort(order);
  const target = Math.max(0, Math.floor(opts.target || 0));
  const womenNeeded = Math.ceil((target * (opts.quotaWomenPct ?? 0)) / 100);
  const disabilityNeeded = Math.ceil((target * (opts.quotaDisabilityPct ?? 0)) / 100);

  const picked: ShortlistEntry[] = [];
  const usedHouseholds = new Set<string>();
  const taken = new Set<string>();

  const canTake = (r: TargetingResult) => {
    if (taken.has(r.beneficiaryId)) return false;
    if (opts.onePerHousehold && r.householdId && usedHouseholds.has(r.householdId)) return false;
    return true;
  };
  const take = (r: TargetingResult, basis: string) => {
    taken.add(r.beneficiaryId);
    if (r.householdId) usedHouseholds.add(r.householdId);
    picked.push({ result: r, rank: picked.length + 1, basis: basisFor(r, basis) });
  };

  // 1. Reserve the inclusion floors with the most vulnerable who qualify.
  for (const r of pool) {
    if (picked.length >= target) break;
    if (picked.filter((e) => e.result.female).length >= womenNeeded) break;
    if (r.female && canTake(r)) take(r, "Vulnerability rank, counted towards the women's floor");
  }
  for (const r of pool) {
    if (picked.length >= target) break;
    if (picked.filter((e) => e.result.disability).length >= disabilityNeeded) break;
    if (r.disability && canTake(r)) take(r, "Vulnerability rank, counted towards the disability floor");
  }
  // 2. Fill the rest strictly on vulnerability.
  for (const r of pool) {
    if (picked.length >= target) break;
    if (canTake(r)) take(r, "Vulnerability rank");
  }
  // 3. If one-per-household left places empty, release the rule for the rest.
  if (picked.length < target && opts.onePerHousehold) {
    for (const r of pool) {
      if (picked.length >= target) break;
      if (!taken.has(r.beneficiaryId)) take(r, "Second place in a household — places still open");
    }
  }

  picked.sort((a, b) => order(a.result, b.result));
  picked.forEach((e, i) => { e.rank = i + 1; });

  const waitlist = pool
    .filter((r) => !taken.has(r.beneficiaryId))
    .slice(0, Math.max(5, Math.ceil(target * 0.3)))
    .map((r, i) => ({ result: r, rank: i + 1, basis: "Next in line if a place opens" }));

  const women = picked.filter((e) => e.result.female).length;
  const disability = picked.filter((e) => e.result.disability).length;
  const communities = new Set(picked.map((e) => e.result.community)).size;
  const meanVulnerability = picked.length
    ? Math.round(picked.reduce((a, e) => a + e.result.vulnerability, 0) / picked.length)
    : 0;
  const ownChoice = picked.filter((e) => e.result.preferenceFit >= 80).length;
  const meanPreferenceFit = picked.length
    ? Math.round(picked.reduce((a, e) => a + e.result.preferenceFit, 0) / picked.length)
    : 0;
  const dists = picked.map((e) => e.result.distanceToOpportunityKm).filter((d): d is number => d != null);
  const meanDistanceKm = dists.length
    ? Math.round((dists.reduce((a, b) => a + b, 0) / dists.length) * 10) / 10
    : null;
  const farFromVenue = picked.filter((e) =>
    e.result.travelWillingnessKm != null && e.result.distanceToOpportunityKm != null
    && e.result.distanceToOpportunityKm > e.result.travelWillingnessKm).length;

  return {
    selected: picked,
    waitlist,
    excluded,
    summary: {
      target,
      selected: picked.length,
      women,
      womenPct: picked.length ? Math.round((women / picked.length) * 100) : 0,
      disability,
      disabilityPct: picked.length ? Math.round((disability / picked.length) * 100) : 0,
      communities,
      meanVulnerability,
      quotaWomenMet: women >= womenNeeded,
      quotaDisabilityMet: disability >= disabilityNeeded,
      ownChoice,
      meanPreferenceFit,
      meanDistanceKm,
      farFromVenue,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

export const useLivelihoodOpportunities = (projectId?: string) => {
  const [rows, setRows] = useState<LivelihoodOpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("livelihood_opportunities")
      .select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    setRows((data as LivelihoodOpportunityRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  return { opportunities: rows, loading, reload: load };
};

export const useLivelihoodAssessments = (projectId?: string) => {
  const [rows, setRows] = useState<LivelihoodAssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("livelihood_assessments")
      .select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(2000);
    setRows((data as LivelihoodAssessmentRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  /** Latest assessment per beneficiary. */
  const byBeneficiary = new Map<string, LivelihoodAssessmentRow>();
  for (const r of rows) if (!byBeneficiary.has(r.beneficiary_id)) byBeneficiary.set(r.beneficiary_id, r);

  return { assessments: rows, byBeneficiary, loading, reload: load };
};

export const saveAssessment = async (payload: {
  id?: string;
  project_id: string;
  module_id?: string | null;
  beneficiary_id: string;
  opportunity_id?: string | null;
  answers: Record<string, unknown>;
  result: TargetingResult;
  decision?: string;
  decision_notes?: string | null;
}) => {
  const { data: auth } = await supabase.auth.getUser();
  const row = {
    project_id: payload.project_id,
    module_id: payload.module_id || null,
    beneficiary_id: payload.beneficiary_id,
    opportunity_id: payload.opportunity_id || null,
    answers: payload.answers,
    vulnerability_score: payload.result.vulnerability,
    readiness_score: payload.result.readiness,
    priority_band: payload.result.band,
    domain_scores: payload.result.domains,
    recommended_package: payload.result.package,
    decision: payload.decision || "assessed",
    decision_notes: payload.decision_notes || null,
    assessed_by: auth.user?.id || null,
  };
  const q = payload.id
    ? db.from("livelihood_assessments").update(row).eq("id", payload.id)
    : db.from("livelihood_assessments").insert(row);
  const { error } = await q;
  if (error) throw error;
};

export const setAssessmentDecision = async (id: string, decision: string, notes?: string) => {
  const { error } = await db.from("livelihood_assessments")
    .update({ decision, decision_notes: notes ?? null }).eq("id", id);
  if (error) throw error;
};

export const saveOpportunity = async (
  payload: Partial<LivelihoodOpportunityRow> & { project_id: string; title: string },
) => {
  const { data: auth } = await supabase.auth.getUser();
  const { id, created_at, ...rest } = payload as Record<string, unknown> & { id?: string };
  void created_at;
  const q = id
    ? db.from("livelihood_opportunities").update(rest).eq("id", id)
    : db.from("livelihood_opportunities").insert({ ...rest, created_by: auth.user?.id });
  const { error } = await q;
  if (error) throw error;
};
