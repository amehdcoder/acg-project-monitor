// Builder-editable definition for the Integrated MDA Supervisory Checklist.
//
// This produces a standard `forms`-table payload (a flat array mixing
// FormGroup + Question objects exactly like FormBuilder writes) so the form
// is 100% editable inside the Form Builder: fields, logic (relevant),
// validation, cascade selects (State -> LGA) and groups can all be changed.
//
// It is flagged with settings.isMdaChecklist + settings.coverageEvaluation so
// the FormFiller renders the MDA-branded experience and offers the linked
// Coverage Evaluation Survey (3D) at the end with one common submit.

import type { Question, FormGroup, QuestionOption } from "@/components/FormBuilder/types";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";

export const MDA_CHECKLIST_NAME = "Integrated MDA Supervisory Checklist";
export const MDA_CHECKLIST_DESCRIPTION =
  "Integrated NTD MDA Supervision Tool — 12-section supervisory checklist with auto-scoring and linked Coverage Evaluation Survey (3D).";

let _seq = 0;
const uid = (p: string) => `${p}_${(++_seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const opt = (label: string, value?: string, parentValue?: string): QuestionOption => ({
  id: uid("o"),
  label,
  value: value ?? slug(label),
  ...(parentValue ? { parentValue } : {}),
});

const yesNo = (extra: string[] = []) => [opt("Yes"), opt("No"), ...extra.map((e) => opt(e))];

type Q = Partial<Question> & { type: Question["type"]; label: string; name: string };
const q = (def: Q): Question => ({
  id: uid("q"),
  required: false,
  ...def,
});

// ---- State -> LGA -> Ward cascade (identical source to the Geo Microplanning page) ----
function buildGeographyQuestions(): { state: Question; lga: Question; ward: Question } {
  const stateOptions: QuestionOption[] = getAllStates().map((s) => opt(s, slug(s)));

  const state = q({
    type: "select_one",
    name: "state",
    label: "State",
    required: true,
    hint: "Select the state of the supervisory visit",
    choice: { searchable: true, layout: "dropdown" },
    options: stateOptions,
  });

  const lgaOptions: QuestionOption[] = [];
  const wardOptions: QuestionOption[] = [];
  getAllStates().forEach((s) => {
    const sv = slug(s);
    getLGAsForState(s).forEach((l) => {
      const lv = `${sv}__${slug(l)}`;
      lgaOptions.push(opt(l, lv, sv));
      getWardsForLGA(s, l).forEach((w) => wardOptions.push(opt(w, `${lv}__${slug(w)}`, lv)));
    });
  });

  const lga = q({
    type: "select_one",
    name: "lga",
    label: "LGA",
    required: true,
    hint: "Filtered by the selected State",
    cascadeParentId: state.id,
    choice: { searchable: true, layout: "dropdown" },
    options: lgaOptions,
  });

  const ward = q({
    type: "select_one",
    name: "ward",
    label: "Ward",
    required: true,
    hint: "Filtered by the selected LGA",
    cascadeParentId: lga.id,
    choice: { searchable: true, layout: "dropdown" },
    options: wardOptions,
  });

  return { state, lga, ward };
}

const group = (label: string, questions: Question[]): FormGroup => ({
  id: uid("grp"),
  name: slug(label),
  label,
  questions,
});

/**
 * Build a fresh MDA Supervisory Checklist form payload.
 * Returns the `questions` array (groups) and the `settings` object ready to
 * insert into the `forms` table.
 */
export function buildMdaSupervisoryChecklist(): {
  name: string;
  description: string;
  questions: FormGroup[];
  settings: Record<string, any>;
} {
  _seq = 0;
  const { state, lga, ward } = buildGeographyQuestions();

  const groups: FormGroup[] = [
    // 1
    group("1. General Information", [
      q({ type: "date", name: "date_supervision", label: "Date of Supervision", required: true, dateSettings: { defaultTo: "today" } }),
      q({ type: "time", name: "time_supervision", label: "Time of Supervision", required: true }),
      q({ type: "text", name: "supervisor_name", label: "Name of Supervisor", required: true }),
      q({ type: "text", name: "phone_number", label: "Phone Number", required: true, text: { mask: "phone", placeholder: "0803 123 4567" } }),
      q({ type: "text", name: "email", label: "Email (if available)", text: { mask: "email", placeholder: "name@example.org" } }),
      q({
        type: "select_one", name: "role_position", label: "Role / Position", required: true,
        options: [opt("LGA NTD Supervisor"), opt("State NTD Officer"), opt("Federal / National Officer"), opt("M&E Officer"), opt("Implementing Partner Supervisor"), opt("Other")],
      }),
      state,
      lga,
      q({ type: "text", name: "ward", label: "Ward", required: true }),
      q({ type: "text", name: "community", label: "Name of Community / Settlement", required: true }),
      q({
        type: "select_one", name: "location_type", label: "Location Type", required: true,
        options: [opt("Community"), opt("Health Facility"), opt("School"), opt("Market"), opt("Other")],
      }),
      q({ type: "geopoint", name: "geolocation", label: "Geolocation (Auto)", required: true, hint: "Capture GPS at the point of supervision", geo: { minAccuracyMeters: 50, captureAltitude: true } }),
      q({ type: "image", name: "location_photos", label: "Photos of Location", media: { maxCount: 4, cameraOnly: true, watermark: true } }),
    ]),

    // 2
    group("2. Planning & Preparation", [
      q({ type: "select_one", name: "microplan_available", label: "Is the microplan available on site?", required: true, options: yesNo(["Partial"]) }),
      q({ type: "select_one", name: "training_conducted", label: "Was CDD training conducted before MDA?", options: yesNo() }),
      q({ type: "number", name: "num_cdds_trained", label: "Number of CDDs trained", number: { kind: "integer", showStepper: true } }),
      q({ type: "select_one", name: "commodities_available", label: "Were commodities available before start?", options: yesNo(["Partial"]) }),
      q({ type: "select_one", name: "social_mobilization_done", label: "Was social mobilization carried out?", options: yesNo() }),
      q({ type: "text", name: "planning_notes", label: "Planning observations", text: { multiline: true, rows: 3 } }),
    ]),

    // 3
    group("3. CDD Assessment", [
      q({ type: "number", name: "cdds_planned", label: "CDDs planned", number: { kind: "integer" } }),
      q({ type: "number", name: "cdds_present", label: "CDDs present / active", number: { kind: "integer" } }),
      q({ type: "select_one", name: "cdds_wearing_id", label: "Are CDDs wearing visible ID?", options: [opt("Yes"), opt("No"), opt("Some")] }),
      q({ type: "select_one", name: "cdds_have_job_aids", label: "Do CDDs have job aids / dosing charts?", options: yesNo() }),
      q({ type: "select_one", name: "cdd_knows_dosing", label: "Can CDD correctly explain dosing?", options: yesNo(["Partial"]) }),
      q({ type: "range", name: "cdd_performance_rating", label: "Overall CDD performance", validation: { min: 0, max: 100 }, range: { step: 5, showValueBubble: true, minLabel: "Poor", midLabel: "Fair", maxLabel: "Excellent" } }),
    ]),

    // 4
    group("4. Service Delivery Observation", [
      q({ type: "select_one", name: "correct_dosing_observed", label: "Correct dosing observed?", options: [opt("Yes"), opt("No"), opt("Not observed")] }),
      q({ type: "select_one", name: "height_pole_used", label: "Height pole / dose pole used?", options: [opt("Yes"), opt("No"), opt("Not applicable")] }),
      q({ type: "select_one", name: "directly_observed_treatment", label: "Directly Observed Treatment (DOT) practiced?", options: yesNo() }),
      q({ type: "select_one", name: "adverse_events_managed", label: "Were any adverse events managed correctly?", options: [opt("Yes"), opt("No"), opt("Not applicable")] }),
      q({ type: "text", name: "delivery_notes", label: "Service delivery observations", text: { multiline: true, rows: 3 } }),
    ]),

    // 5
    group("5. Registers & Data Management", [
      q({ type: "select_one", name: "registers_available", label: "Are treatment registers available?", required: true, options: yesNo() }),
      q({ type: "select_one", name: "registers_uptodate", label: "Are registers up to date?", options: yesNo(["Partial"]) }),
      q({ type: "select_one", name: "tally_matches_register", label: "Does the tally match the register?", options: yesNo() }),
      q({ type: "select_one", name: "summary_form_completed", label: "Is the daily summary form completed?", options: yesNo() }),
    ]),

    // 6
    group("6. Inventory & Supplies", [
      q({ type: "number", name: "opening_balance", label: "Opening balance (tablets)", number: { kind: "integer" } }),
      q({ type: "number", name: "received", label: "Quantity received", number: { kind: "integer" } }),
      q({ type: "number", name: "used", label: "Quantity used", number: { kind: "integer" } }),
      q({ type: "calculate", name: "stock_balance", label: "Closing balance (auto)", calculation: "${opening_balance} + ${received} - ${used}", calc: { visible: true, decimalPlaces: 0 } }),
      q({ type: "select_one", name: "stockout_observed", label: "Was any stock-out observed?", options: yesNo() }),
    ]),

    // 7
    group("7. Community Engagement", [
      q({ type: "select_one", name: "town_announcer_used", label: "Was a town announcer / crier used?", options: yesNo() }),
      q({ type: "select_one", name: "community_leaders_involved", label: "Were community leaders involved?", options: yesNo() }),
      q({ type: "number", name: "refusals_reported", label: "Number of refusals reported", number: { kind: "integer" } }),
      q({ type: "text", name: "refusal_reasons", label: "Main reasons for refusal", relevant: "${refusals_reported} > 0", text: { multiline: true, rows: 2 } }),
    ]),

    // 8
    group("8. Adverse Events & Safety", [
      q({ type: "number", name: "aes_reported", label: "Adverse events (AEs) reported", number: { kind: "integer" } }),
      q({ type: "number", name: "serious_aes", label: "Serious adverse events (SAEs)", number: { kind: "integer" } }),
      q({ type: "select_one", name: "referral_done", label: "Was referral done for SAE(s)?", relevant: "${serious_aes} > 0", options: [opt("Yes"), opt("No"), opt("Not applicable")] }),
      q({ type: "text", name: "safety_notes", label: "Safety observations", text: { multiline: true, rows: 2 } }),
    ]),

    // 9
    group("9. Household Verification", [
      q({ type: "number", name: "hh_visited", label: "Households visited", number: { kind: "integer" } }),
      q({ type: "number", name: "hh_with_member_treated", label: "Households with at least one member treated", number: { kind: "integer" } }),
      q({ type: "number", name: "persons_eligible", label: "Eligible persons", number: { kind: "integer" } }),
      q({ type: "number", name: "persons_treated", label: "Persons treated", number: { kind: "integer" } }),
      q({ type: "calculate", name: "verified_coverage", label: "Verified coverage % (auto)", calculation: "round(${persons_treated} div ${persons_eligible} * 100, 1)", calc: { visible: true, decimalPlaces: 1 } }),
    ]),

    // 10
    group("10. Cross-cutting Checks", [
      q({ type: "select_one", name: "gender_inclusion", label: "Are both sexes equitably reached?", options: yesNo() }),
      q({ type: "select_one", name: "pwd_considered", label: "Are persons with disabilities considered?", options: yesNo() }),
      q({ type: "select_one", name: "waste_disposal_proper", label: "Is waste disposal proper?", options: yesNo() }),
    ]),

    // 11
    group("11. Summary & Scoring", [
      q({ type: "note", name: "summary_note", label: "These values power the supervision summary cards and the Operations dashboard.", note: { style: "info" } }),
      q({ type: "number", name: "implementation_score", label: "Implementation Score (%)", required: true, validation: { min: 0, max: 100, message: "Enter a value between 0 and 100" }, number: { kind: "integer", unit: "%" } }),
      q({ type: "select_one", name: "risk_category", label: "Risk Category", required: true, options: [opt("Low"), opt("Medium"), opt("High")] }),
      q({ type: "number", name: "individuals_treated", label: "Individuals Treated (this visit area)", number: { kind: "integer" } }),
      q({ type: "number", name: "coverage_achieved", label: "Coverage Achieved (%)", validation: { min: 0, max: 100 }, number: { kind: "decimal", decimalPlaces: 1, unit: "%" } }),
      q({ type: "text", name: "overall_summary", label: "Overall supervisory summary", text: { multiline: true, rows: 3 } }),
    ]),

    // 12
    group("12. Corrective Actions", [
      q({ type: "text", name: "issues_identified", label: "Issues identified", text: { multiline: true, rows: 3 } }),
      q({ type: "text", name: "corrective_actions", label: "Corrective actions agreed", text: { multiline: true, rows: 3 } }),
      q({ type: "text", name: "responsible_person", label: "Responsible person" }),
      q({ type: "date", name: "action_deadline", label: "Action deadline" }),
      q({ type: "signature", name: "supervisor_signature", label: "Supervisor signature", signature: { requirePrintedName: true } }),
      q({ type: "acknowledge", name: "attestation", label: "Attestation", required: true, acknowledge: { statement: "I confirm the above observations are accurate and were made during this supervisory visit." } }),
    ]),
  ];

  const settings: Record<string, any> = {
    allowAnonymous: false,
    requireLocation: true,
    offlineEnabled: true,
    autoSave: true,
    isMdaChecklist: true,
    coverageEvaluation: true,
    campaignType: "MDA (Mass Drug Administration)",
  };

  return { name: MDA_CHECKLIST_NAME, description: MDA_CHECKLIST_DESCRIPTION, questions: groups, settings };
}
