// Builder-editable definitions for the Treatment Data Reporting Tools.
//
// Two validated NTD field tools, produced as standard `forms`-table payloads
// (a flat array of FormGroup objects exactly like FormBuilder writes) so they
// are 100% editable inside the Form Builder:
//
//   1. Community/Village/School Summary Form (Level 1)
//   2. Community Treatment Register (NTD Treatment Register — Village/School)
//
// Both are flagged with settings.microplanLocationCascade so the FormFiller
// drives their State → LGA → Ward → FLHF → Community → Settlement fields from
// the populated microplan, with the same "received medicine but not in the
// microplan" provision as the Integrated MDA Supervisory Checklist.

import type { Question, FormGroup, QuestionOption } from "@/components/FormBuilder/types";

export const COMMUNITY_SUMMARY_FORM_NAME = "Community/Village/School Summary Form (Level 1)";
export const COMMUNITY_SUMMARY_FORM_DESCRIPTION =
  "NTD Level-1 community summary — registered population, treatments by age/sex, adverse events, disability status and drug management. Microplan-driven location with off-microplan provision. Fully editable in the Form Builder.";

export const COMMUNITY_TREATMENT_REGISTER_NAME = "Community Treatment Register (NTD)";
export const COMMUNITY_TREATMENT_REGISTER_DESCRIPTION =
  "Village/School-based NTD treatment register — person-level roster with medicines given, treatment by age/sex and coverage review. Microplan-driven location with off-microplan provision. Fully editable in the Form Builder.";

let _seq = 0;
const uid = (p: string) => `${p}_${(++_seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const opt = (label: string, value?: string): QuestionOption => ({
  id: uid("o"),
  label,
  value: value ?? slug(label),
});

type Q = Partial<Question> & { type: Question["type"]; label: string; name: string };
const q = (def: Q): Question => ({
  id: uid("q"),
  required: false,
  ...def,
});

const group = (label: string, questions: Question[], extra: Partial<FormGroup> = {}): FormGroup => ({
  id: uid("grp"),
  name: slug(label),
  label,
  questions,
  ...extra,
});

// Geography questions whose VALUES are populated by <MdaLocationCascade> from
// the microplan. They are suppressed from raw rendering by the FormFiller and
// filled by the cascade (which also offers the off-microplan provision).
// Names must match MdaLocationCascade's QUESTION_NAME map exactly.
function geoQuestions(opts: { requireSettlement?: boolean } = {}): Question[] {
  return [
    q({ type: "text", name: "state", label: "State", required: true }),
    q({ type: "text", name: "lga", label: "LGA", required: true }),
    q({ type: "text", name: "ward", label: "Ward", required: true }),
    q({ type: "text", name: "flhf_name", label: "Front-Line Health Facility (FLHF)", required: true }),
    q({ type: "text", name: "community", label: "Community / Village / School", required: true }),
    q({ type: "text", name: "settlement_name", label: "Settlement", required: !!opts.requireSettlement }),
  ];
}

const num = (name: string, label: string, extra: Partial<Question> = {}): Question =>
  q({ type: "number", name, label, number: { kind: "integer", showStepper: true } as any, ...extra });

// ──────────────────────────────────────────────────────────────────────────
// 1. Community/Village/School Summary Form (Level 1)
// ──────────────────────────────────────────────────────────────────────────
export function buildCommunitySummaryForm(): {
  name: string;
  description: string;
  questions: FormGroup[];
  settings: Record<string, any>;
} {
  _seq = 0;

  const groups: FormGroup[] = [
    // 1 — Identification
    group("1. Identification", [
      q({ type: "note", name: "ident_note", label: "Provide location and reporting details." }),
      ...geoQuestions(),
      q({
        type: "select_multiple", name: "targeted_diseases", label: "Targeted Disease(s) Treated", required: true,
        choice: { layout: "list" } as any,
        options: [
          opt("Onchocerciasis"), opt("Lymphatic Filariasis"), opt("Schistosomiasis"),
          opt("Soil-Transmitted Helminths"), opt("Trachoma"),
        ],
      }),
      q({ type: "text", name: "annual_treatment_round", label: "Annual Treatment Round", required: true, text: { placeholder: "e.g., 1, 2, 2024" } as any }),
      q({ type: "date", name: "start_date_treatment", label: "Start Date of Treatment", required: true }),
      q({ type: "date", name: "end_date_treatment", label: "End Date of Treatment", required: true }),
      q({ type: "date", name: "reporting_date", label: "Reporting Date", required: true, dateSettings: { defaultTo: "today" } as any }),
      q({ type: "geopoint", name: "geolocation", label: "Geolocation (Auto)", geo: { minAccuracyMeters: 50 } as any }),
    ]),

    // 2 — Registered Population
    group("2. Registered Population", [
      q({ type: "note", name: "pop_note", label: "Enter population and household figures." }),
      num("pop_males", "Number of Males"),
      num("pop_females", "Number of Females"),
      num("total_households", "Total Households / Arms of Class"),
      num("children_0_4", "Total Children 0–4 years"),
      num("children_5_14", "Total Children 5–14 years"),
      num("persons_15_plus", "Total Persons 15 years and above"),
      q({ type: "note", name: "trachoma_bands_note", label: "<strong>Trachoma Age Bands</strong>" }),
      num("trachoma_0_5m", "0–5 months"),
      num("trachoma_6m_6y", "6 months – 6 years"),
      num("trachoma_7_15y", "7–15 years"),
    ]),

    // 3 — Treatments & Adverse Events
    group("3. Treatments & Adverse Events", [
      q({ type: "note", name: "treat_note", label: "<strong>Treatment (Oncho, LF, Schisto, STH)</strong> — record treatments by age and sex." }),
      // Ivermectin
      num("ivm_males_treated", "Ivermectin — Males Treated"),
      num("ivm_females_treated", "Ivermectin — Females Treated"),
      // Albendazole
      num("alb_males_treated", "Albendazole — Males Treated"),
      num("alb_females_treated", "Albendazole — Females Treated"),
      // Praziquantel
      num("pzq_males_treated", "Praziquantel — Males Treated"),
      num("pzq_females_treated", "Praziquantel — Females Treated"),
      // Mebendazole
      num("meb_males_treated", "Mebendazole — Males Treated"),
      num("meb_females_treated", "Mebendazole — Females Treated"),

      q({ type: "note", name: "trachoma_treat_note", label: "<strong>Treatment (Trachoma)</strong>" }),
      num("azt_tabs_treated", "Azithromycin Tablets — Treated"),
      num("azt_pos_treated", "Azithromycin POS — Treated"),
      num("teo_treated", "Tetracycline Eye Ointment — Treated"),

      q({ type: "note", name: "ae_note", label: "<strong>Adverse Events</strong>" }),
      num("adverse_events_total", "Total number of adverse events"),
      num("adverse_events_referred", "No. of cases referred to health facility"),

      q({ type: "note", name: "disability_note", label: "<strong>Disability Status Treatment</strong>" }),
      num("disab_visually_impaired", "Visually Impaired"),
      num("disab_hearing_impaired", "Hearing Impaired"),
      num("disab_lymphoedema", "Lymphoedema"),
      num("disab_hydrocele", "Hydrocele"),
      num("disab_others", "Others"),
    ]),

    // 4 — Medicines & CI Information
    group("4. Medicines & CI Information", [
      q({ type: "note", name: "drug_note", label: "<strong>Medicines / Drug Management</strong> — record inventory for each medicine (Received, Used, Loss). Balance is auto-calculated." }),
      // Ivermectin
      num("ivm_received", "Ivermectin — No. Received"),
      num("ivm_used", "Ivermectin — No. Used"),
      num("ivm_loss", "Ivermectin — No. Loss"),
      q({ type: "calculate", name: "ivm_balance", label: "Ivermectin — Balance", calculation: "${ivm_received} - ${ivm_used} - ${ivm_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Albendazole
      num("alb_received", "Albendazole — No. Received"),
      num("alb_used", "Albendazole — No. Used"),
      num("alb_loss", "Albendazole — No. Loss"),
      q({ type: "calculate", name: "alb_balance", label: "Albendazole — Balance", calculation: "${alb_received} - ${alb_used} - ${alb_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Praziquantel (TAB)
      num("pzq_tab_received", "Praziquantel (TAB) — No. Received"),
      num("pzq_tab_used", "Praziquantel (TAB) — No. Used"),
      num("pzq_tab_loss", "Praziquantel (TAB) — No. Loss"),
      q({ type: "calculate", name: "pzq_tab_balance", label: "Praziquantel (TAB) — Balance", calculation: "${pzq_tab_received} - ${pzq_tab_used} - ${pzq_tab_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Mebendazole
      num("meb_received", "Mebendazole — No. Received"),
      num("meb_used", "Mebendazole — No. Used"),
      num("meb_loss", "Mebendazole — No. Loss"),
      q({ type: "calculate", name: "meb_balance", label: "Mebendazole — Balance", calculation: "${meb_received} - ${meb_used} - ${meb_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Azithromycin (TAB)
      num("azt_tab_received", "Azithromycin (TAB) — No. Received"),
      num("azt_tab_used", "Azithromycin (TAB) — No. Used"),
      num("azt_tab_loss", "Azithromycin (TAB) — No. Loss"),
      q({ type: "calculate", name: "azt_tab_balance", label: "Azithromycin (TAB) — Balance", calculation: "${azt_tab_received} - ${azt_tab_used} - ${azt_tab_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Tetracycline Eye Ointment
      num("teo_received", "Tetracycline Eye Ointment — No. Received"),
      num("teo_used", "Tetracycline Eye Ointment — No. Used"),
      num("teo_loss", "Tetracycline Eye Ointment — No. Loss"),
      q({ type: "calculate", name: "teo_balance", label: "Tetracycline Eye Ointment — Balance", calculation: "${teo_received} - ${teo_used} - ${teo_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),
      // Azithromycin POS
      num("azt_pos_received", "Azithromycin POS — No. Received"),
      num("azt_pos_used", "Azithromycin POS — No. Used"),
      num("azt_pos_loss", "Azithromycin POS — No. Loss"),
      q({ type: "calculate", name: "azt_pos_balance", label: "Azithromycin POS — Balance", calculation: "${azt_pos_received} - ${azt_pos_used} - ${azt_pos_loss}", calc: { visible: true, decimalPlaces: 0 } as any }),

      q({ type: "note", name: "ci_note", label: "<strong>CI (CDDs or Teachers) Information</strong>" }),
      num("ci_males", "Number of Male CIs"),
      num("ci_females", "Number of Female CIs"),
      num("ci_total", "Total Number of CIs"),
      num("ci_trained", "Number of Trained CIs"),

      q({ type: "note", name: "sign_note", label: "<strong>Signatures</strong>" }),
      q({ type: "signature", name: "sign_cdd_teacher", label: "Community Distributor / Teacher — Name / Signature / Date" }),
      q({ type: "signature", name: "sign_supervisor", label: "Community Supervisor / Head Teacher — Name / Signature / Date" }),
    ]),
  ];

  return {
    name: COMMUNITY_SUMMARY_FORM_NAME,
    description: COMMUNITY_SUMMARY_FORM_DESCRIPTION,
    questions: groups,
    settings: {
      offlineEnabled: true,
      autoSave: true,
      requireLocation: false,
      microplanLocationCascade: true,
      isTreatmentDataTool: true,
      treatmentTool: "community_summary",
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Community Treatment Register (NTD — Village/School Based Register)
// ──────────────────────────────────────────────────────────────────────────
export function buildCommunityTreatmentRegister(): {
  name: string;
  description: string;
  questions: FormGroup[];
  settings: Record<string, any>;
} {
  _seq = 0;

  const groups: FormGroup[] = [
    // 1 — Register Setup
    group("1. Register Setup", [
      q({ type: "note", name: "setup_note", label: "Enter location and register details." }),
      ...geoQuestions(),
      q({ type: "note", name: "team_note", label: "<strong>Team & Contacts</strong>" }),
      q({ type: "text", name: "cdd_name", label: "Name of CDD", required: true }),
      q({ type: "text", name: "cdd_phone", label: "CDD Phone No.", text: { mask: "phone", placeholder: "0803 123 4567" } as any }),
      q({ type: "text", name: "village_head_name", label: "Name of Village Head" }),
      q({ type: "text", name: "village_head_phone", label: "Village Head Phone No.", text: { mask: "phone", placeholder: "0803 123 4567" } as any }),
      q({ type: "text", name: "teacher_name", label: "Name of Teacher" }),
      q({ type: "text", name: "head_teacher_name", label: "Head Teacher" }),
      q({ type: "note", name: "reg_details_note", label: "<strong>Register Details</strong>" }),
      q({ type: "date", name: "date_treatment", label: "Date of Treatment", required: true, dateSettings: { defaultTo: "today" } as any }),
      q({ type: "text", name: "household_no", label: "Household No.", required: true, text: { placeholder: "HH-001" } as any }),
      q({ type: "geopoint", name: "geolocation", label: "Geolocation (Auto)", geo: { minAccuracyMeters: 50 } as any }),
    ]),

    // 2 — Household / Person Roster + treatment (one repeat per person)
    group(
      "2. Household / Person Roster",
      [
        q({ type: "note", name: "roster_note", label: "Add each person in this household. Record their details, then the medicines given." }),
        q({ type: "text", name: "person_name", label: "Full Name", required: true }),
        q({ type: "select_one", name: "person_sex", label: "Sex", required: true, options: [opt("Male"), opt("Female")] }),
        q({
          type: "select_one", name: "person_age_band", label: "Age Band", required: true,
          options: [opt("0–4 yrs", "0_4"), opt("5–14 yrs", "5_14"), opt("15+ yrs", "15_plus")],
        }),
        q({ type: "select_one", name: "person_disability", label: "Disability Status", options: [opt("Normal"), opt("Disabled")] }),

        q({ type: "note", name: "meds_note", label: "<strong>Medicines Given</strong> — enter quantity given (0 if not given)." }),
        num("med_ivm", "IVM (Ivermectin)"),
        num("med_alb", "ALB (Albendazole)"),
        num("med_pzq", "PZQ (Praziquantel)"),
        num("med_meb", "MEB (Mebendazole)"),
        num("med_azt_tabs", "AZT Tabs (Azithromycin Tablets)"),
        num("med_azt_pos", "AZT Pos (Azithromycin POS)"),
        num("med_teo", "TEO (Tetracycline Eye Ointment)"),
        q({ type: "select_one", name: "person_treated", label: "Treated?", required: true, options: [opt("Yes"), opt("No")] }),
        q({ type: "text", name: "person_remark", label: "Remark (optional)", text: { multiline: true, rows: 2 } as any }),
      ],
      { repeat: true },
    ),

    // 3 — Review & Submission
    group("3. Review & Submission", [
      q({ type: "note", name: "review_note", label: "Confirm and submit the treatment register. Coverage totals are computed from the person roster above." }),
      q({ type: "select_one", name: "offline_confirm", label: "Data captured on this device — confirm before submitting", options: [opt("Confirmed")] }),
      q({ type: "text", name: "register_remarks", label: "General remarks", text: { multiline: true, rows: 3 } as any }),
      q({ type: "signature", name: "register_signature", label: "Recorder Signature" }),
    ]),
  ];

  return {
    name: COMMUNITY_TREATMENT_REGISTER_NAME,
    description: COMMUNITY_TREATMENT_REGISTER_DESCRIPTION,
    questions: groups,
    settings: {
      offlineEnabled: true,
      autoSave: true,
      requireLocation: false,
      microplanLocationCascade: true,
      isTreatmentDataTool: true,
      treatmentTool: "community_treatment_register",
    },
  };
}
