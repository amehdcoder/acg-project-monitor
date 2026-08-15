// See Clear — Plateau Comprehensive and Inclusive Eye Health Project
// "Monitoring, Evaluation and Learning Checklist" XLSForm generator.
//
// Produces an ODK / KoboToolbox-compatible .xlsx (survey / choices / settings)
// that matches the in-app checklist schema field-for-field, so submissions
// received by `supabase/functions/kobo-webhook?form_type=seeclear` map cleanly
// into `public.seeclear_monitoring` and light up the See Clear dashboard.
//
// Design notes (the "beautiful form" bit):
//   • `theme-grid pages` — each section becomes its own swipeable page with a
//     responsive 2-column grid on tablets.
//   • Markdown section banners (note rows) with emoji + bold titles.
//   • Live score feedback: calculated section scores and an overall readiness
//     percentage with a colour-coded band shown back to the enumerator.
//   • Cascading Plateau State → LGA → Ward selects, GPS with manual fallback,
//     required photo evidence, and dual signature capture.

import * as XLSX from "xlsx";
import {
  GENERAL_QUESTIONS, HR_QUESTIONS, INFRA_QUESTIONS, EQUIPMENT_ITEMS,
  FACILITY_LEVELS, OWNERSHIP_TYPES, FUNCTIONAL_STATUS,
  CHALLENGE_OPTIONS, RECOMMENDATION_OPTIONS, EVIDENCE_SLOTS,
  type YesNoQ,
} from "./definition";
import { getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";

const SURVEY_HEADER = [
  "type", "name", "label", "hint", "required", "required_message",
  "constraint", "constraint_message", "relevant", "calculation",
  "choice_filter", "appearance", "default", "read_only",
] as const;

const CHOICES_HEADER = ["list_name", "name", "label", "state", "lga"] as const;
const SETTINGS_HEADER = ["form_title", "form_id", "version", "style", "instance_name"] as const;

type Row = (string | number)[];
type SurveyKey = (typeof SURVEY_HEADER)[number];

const q = (r: Partial<Record<SurveyKey, string>>): Row =>
  SURVEY_HEADER.map((h) => (r as any)[h] ?? "");

const ch = (list: string, name: string, label: string, state = "", lga = ""): Row =>
  [list, name, label, state, lga];

export const sanitizeName = (s: string) =>
  (s || "x").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "x";

export const SEECLEAR_XFORM_PREFIX = "seeclear_mel_checklist";
const PROJECT_STATE = "Plateau";

/** Banner note used to open each page — renders as a styled section header. */
const banner = (name: string, emoji: string, title: string, subtitle: string): Row =>
  q({
    type: "note",
    name,
    label: `### ${emoji} ${title}\n_${subtitle}_`,
  });

function yesNoBlock(qs: YesNoQ[]): Row[] {
  return qs.map((item) =>
    q({
      type: `select_one yes_no`,
      name: item.key,
      label: `${item.label}`,
      hint: item.good === "yes" ? "Expected answer: Yes" : "Expected answer: No",
      required: "yes",
      required_message: "Please answer this item before continuing.",
      appearance: "minimal horizontal-compact",
    }),
  );
}

/** XPath sum expression scoring 1 point per question answered the "good" way. */
function yesNoScoreExpr(qs: YesNoQ[]): string {
  return qs.map((item) => `if(\${${item.key}} = '${item.good}', 1, 0)`).join(" + ");
}

function equipScoreExpr(): string {
  return EQUIPMENT_ITEMS
    .map((it) => `if(\${${it.key}} = 'func', 2, if(\${${it.key}} = 'nonfunc', 1, 0))`)
    .join(" + ");
}

function equipMaxExpr(): string {
  return EQUIPMENT_ITEMS
    .map((it) => `if(\${${it.key}} = 'na', 0, 2)`)
    .join(" + ");
}

export interface SeeClearXlsFormOptions {
  /** Overrides the generated form_id (useful when re-deploying a Kobo asset). */
  formId?: string;
  versionInt?: number | null;
}

export function buildSeeClearXlsForm(options: SeeClearXlsFormOptions = {}): XLSX.WorkBook {
  const stamp = (options.versionInt ?? Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""))).toString();
  const formId = options.formId || `${SEECLEAR_XFORM_PREFIX}_${stamp}`;
  const title = "See Clear — Eye Health Facility Monitoring, Evaluation & Learning Checklist";

  const survey: Row[] = [SURVEY_HEADER as unknown as Row];
  const choices: Row[] = [CHOICES_HEADER as unknown as Row];

  // ── Metadata ──────────────────────────────────────────────────────────
  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));

  // ── Cover page ────────────────────────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "cover", label: "Welcome", appearance: "field-list" }));
  survey.push(q({
    type: "note", name: "cover_note",
    label:
      "# 👁️ See Clear\n" +
      "## Plateau Comprehensive and Inclusive Eye Health Project\n" +
      "**Monitoring, Evaluation and Learning Checklist**\n\n" +
      "---\n" +
      "This checklist assesses eye health service readiness at facility level across " +
      "**four domains** — General Assessment, Human Resources, Infrastructure & Utilities, " +
      "and Equipment & Medical Supplies.\n\n" +
      "**Before you start**\n" +
      "1. Introduce yourself to the officer-in-charge and explain the purpose of the visit.\n" +
      "2. Verify observations physically — do not rely on report alone.\n" +
      "3. Capture GPS **inside** the facility compound.\n" +
      "4. Photographic evidence is required for the front view, eye clinic room and registers.\n\n" +
      "_All fields marked * are mandatory. Swipe forward to begin._",
  }));
  survey.push(q({ type: "end_group", name: "cover_end" }));

  // ── Section 1 — Visit & facility profile ──────────────────────────────
  survey.push(q({ type: "begin_group", name: "facility_info", label: "1. Facility Information", appearance: "field-list" }));
  survey.push(banner("s1_banner", "🏥", "Facility Information", "Where, when and who — the identity of this monitoring visit."));
  survey.push(q({
    type: "date", name: "date_of_visit", label: "Date of visit", required: "yes",
    default: "today()", constraint: ". <= today()",
    constraint_message: "The date of visit cannot be in the future.",
    appearance: "no-calendar",
  }));
  survey.push(q({
    type: "select_one state_list", name: "state", label: "State", required: "yes",
    default: PROJECT_STATE, appearance: "minimal",
  }));
  survey.push(q({
    type: "select_one lga_list", name: "lga", label: "Local Government Area (LGA)", required: "yes",
    choice_filter: "state=${state}", appearance: "minimal",
  }));
  survey.push(q({
    type: "select_one ward_list", name: "ward", label: "Ward", required: "yes",
    choice_filter: "lga=${lga}", appearance: "minimal",
  }));
  survey.push(q({ type: "text", name: "community", label: "Community / Settlement", required: "yes" }));
  survey.push(q({ type: "text", name: "facility_name", label: "Name of health facility", required: "yes", hint: "Write the full registered facility name." }));
  survey.push(q({ type: "select_one facility_level", name: "facility_level", label: "Level of facility", required: "yes", appearance: "horizontal-compact" }));
  survey.push(q({ type: "select_one ownership", name: "ownership", label: "Ownership", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "text", name: "ownership_other", label: "Specify ownership", required: "yes", relevant: "${ownership} = 'other'" }));
  survey.push(q({ type: "select_one functional_status", name: "functional_status", label: "Functional status of the facility", required: "yes", appearance: "horizontal-compact" }));
  survey.push(q({ type: "geopoint", name: "gps_location", label: "Facility GPS coordinates", required: "yes", hint: "Stand within the facility compound and wait for accuracy below 10 m." }));
  survey.push(q({
    type: "decimal", name: "manual_latitude", label: "Latitude (only if GPS fails)",
    constraint: ". >= -90 and . <= 90", constraint_message: "Latitude must be between -90 and 90.",
  }));
  survey.push(q({
    type: "decimal", name: "manual_longitude", label: "Longitude (only if GPS fails)",
    constraint: ". >= -180 and . <= 180", constraint_message: "Longitude must be between -180 and 180.",
  }));
  survey.push(q({ type: "calculate", name: "gps_lat", calculation: "if(${gps_location} = '', ${manual_latitude}, selected-at(${gps_location}, 0))" }));
  survey.push(q({ type: "calculate", name: "gps_lng", calculation: "if(${gps_location} = '', ${manual_longitude}, selected-at(${gps_location}, 1))" }));
  survey.push(q({ type: "calculate", name: "gps_accuracy", calculation: "if(${gps_location} = '', '', selected-at(${gps_location}, 3))" }));
  survey.push(q({ type: "end_group", name: "facility_info_end" }));

  // ── Section 1b — Focal person & team ──────────────────────────────────
  survey.push(q({ type: "begin_group", name: "focal", label: "2. Focal Person & Monitoring Team", appearance: "field-list" }));
  survey.push(banner("s2_banner", "🧑‍⚕️", "Focal Person & Monitoring Team", "Who received the team and who conducted the visit."));
  survey.push(q({ type: "text", name: "focal_name", label: "Name of facility focal person", required: "yes" }));
  survey.push(q({ type: "text", name: "focal_designation", label: "Designation of focal person", required: "yes" }));
  survey.push(q({
    type: "text", name: "focal_phone", label: "Phone number of focal person", required: "yes",
    constraint: "regex(., '^[0-9+][0-9 -]{7,17}$')",
    constraint_message: "Enter a valid phone number (8–18 digits).",
  }));
  survey.push(q({ type: "end_group", name: "focal_end" }));

  survey.push(q({ type: "begin_repeat", name: "team_members", label: "Monitoring team member", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "member_name", label: "Team member name", required: "yes" }));
  survey.push(q({ type: "text", name: "member_role", label: "Role / organisation", required: "yes" }));
  survey.push(q({ type: "end_repeat", name: "team_members_end" }));

  // ── Section 2 — General assessment ────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "general_section", label: "3. General Facility Assessment", appearance: "field-list" }));
  survey.push(banner("s3_banner", "✅", "General Facility Assessment", `Six observation items — maximum score ${GENERAL_QUESTIONS.length}.`));
  yesNoBlock(GENERAL_QUESTIONS).forEach((r) => survey.push(r));
  survey.push(q({ type: "calculate", name: "general_score", calculation: yesNoScoreExpr(GENERAL_QUESTIONS) }));
  survey.push(q({
    type: "note", name: "general_score_note",
    label: `**Section score: ${"${general_score}"} / ${GENERAL_QUESTIONS.length}**`,
  }));
  survey.push(q({ type: "end_group", name: "general_section_end" }));

  // ── Section 3 — Human resources ───────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "hr_section", label: "4. Human Resources", appearance: "field-list" }));
  survey.push(banner("s4_banner", "👥", "Human Resources", `Staffing, training and supervision — maximum score ${HR_QUESTIONS.length}.`));
  survey.push(q({
    type: "integer", name: "staff_on_duty", label: "Number of staff on duty today", required: "yes",
    constraint: ". >= 0 and . <= 500", constraint_message: "Enter a number between 0 and 500.",
  }));
  yesNoBlock(HR_QUESTIONS).forEach((r) => survey.push(r));
  survey.push(q({ type: "calculate", name: "hr_score", calculation: yesNoScoreExpr(HR_QUESTIONS) }));
  survey.push(q({ type: "calculate", name: "hr_max", calculation: String(HR_QUESTIONS.length) }));
  survey.push(q({
    type: "note", name: "hr_score_note",
    label: `**Section score: ${"${hr_score}"} / ${HR_QUESTIONS.length}**`,
  }));
  survey.push(q({ type: "end_group", name: "hr_section_end" }));

  // ── Section 4 — Infrastructure ────────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "infra_section", label: "5. Infrastructure & Utilities", appearance: "field-list" }));
  survey.push(banner("s5_banner", "🏗️", "Infrastructure & Utilities", `Space, power, water and accessibility — maximum score ${INFRA_QUESTIONS.length}.`));
  yesNoBlock(INFRA_QUESTIONS).forEach((r) => survey.push(r));
  survey.push(q({ type: "calculate", name: "infra_score", calculation: yesNoScoreExpr(INFRA_QUESTIONS) }));
  survey.push(q({ type: "calculate", name: "infra_max", calculation: String(INFRA_QUESTIONS.length) }));
  survey.push(q({
    type: "note", name: "infra_score_note",
    label: `**Section score: ${"${infra_score}"} / ${INFRA_QUESTIONS.length}**`,
  }));
  survey.push(q({ type: "end_group", name: "infra_section_end" }));

  // ── Section 5 — Equipment ─────────────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "equipment_section", label: "6. Equipment & Medical Supplies", appearance: "field-list" }));
  survey.push(banner("s6_banner", "🔬", "Equipment & Medical Supplies", "Score 2 = available & functional, 1 = available but not functional, 0 = not available."));
  survey.push(q({ type: "note", name: "equip_basic_note", label: "**Basic eye care items**" }));
  EQUIPMENT_ITEMS.filter((i) => i.group === "basic").forEach((it) => {
    survey.push(q({
      type: "select_one equip_status", name: it.key, label: it.label,
      required: "yes", appearance: "minimal",
    }));
  });
  survey.push(q({ type: "note", name: "equip_adv_note", label: "**Advanced / specialist equipment**" }));
  EQUIPMENT_ITEMS.filter((i) => i.group === "advanced").forEach((it) => {
    survey.push(q({
      type: "select_one equip_status", name: it.key, label: it.label,
      required: "yes", appearance: "minimal",
    }));
  });
  survey.push(q({ type: "calculate", name: "equip_score", calculation: equipScoreExpr() }));
  survey.push(q({ type: "calculate", name: "equip_max", calculation: equipMaxExpr() }));
  survey.push(q({
    type: "note", name: "equip_score_note",
    label: `**Equipment score: ${"${equip_score}"} / ${"${equip_max}"}**`,
  }));
  survey.push(q({ type: "end_group", name: "equipment_section_end" }));

  // ── Section 6 — Referrals & service data ──────────────────────────────
  survey.push(q({ type: "begin_group", name: "referral_section", label: "7. Referrals & Service Data", appearance: "field-list" }));
  survey.push(banner("s7_banner", "🔁", "Referrals & Service Data", "Referral performance since the last monitoring visit."));
  survey.push(q({
    type: "integer", name: "referrals_made", label: "Number of eye care referrals made", required: "yes",
    constraint: ". >= 0", constraint_message: "Cannot be negative.",
  }));
  survey.push(q({
    type: "integer", name: "referrals_completed", label: "Number of referrals completed / attended",
    required: "yes",
    constraint: ". >= 0 and . <= ${referrals_made}",
    constraint_message: "Completed referrals cannot exceed referrals made.",
  }));
  survey.push(q({
    type: "calculate", name: "referral_rate",
    calculation: "if(${referrals_made} > 0, round((${referrals_completed} div ${referrals_made}) * 100, 1), 0)",
  }));
  survey.push(q({
    type: "note", name: "referral_note",
    label: `**Referral completion rate: ${"${referral_rate}"}%**`,
  }));
  survey.push(q({ type: "end_group", name: "referral_section_end" }));

  // ── Section 7 — Readiness summary ─────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "score_section", label: "8. Readiness Summary", appearance: "field-list" }));
  survey.push(q({
    type: "calculate", name: "total_score",
    calculation: "${general_score} + ${hr_score} + ${infra_score} + ${equip_score}",
  }));
  survey.push(q({
    type: "calculate", name: "total_max",
    calculation: `${GENERAL_QUESTIONS.length} + ${HR_QUESTIONS.length} + ${INFRA_QUESTIONS.length} + \${equip_max}`,
  }));
  survey.push(q({
    type: "calculate", name: "readiness_score",
    calculation: "if(${total_max} > 0, round((${total_score} div ${total_max}) * 100, 0), 0)",
  }));
  survey.push(q({
    type: "calculate", name: "readiness_band",
    calculation:
      "if(${readiness_score} >= 80, 'Good', " +
      "if(${readiness_score} >= 60, 'Fair', " +
      "if(${readiness_score} >= 40, 'Poor', 'Critical')))",
  }));
  survey.push(q({
    type: "note", name: "readiness_note",
    label:
      "### 📊 Facility Readiness\n" +
      `**${"${readiness_score}"}%** — ${"${readiness_band}"}\n\n` +
      `Total points: ${"${total_score}"} of ${"${total_max}"}\n\n` +
      "| Domain | Score |\n|---|---|\n" +
      `| General | ${"${general_score}"} / ${GENERAL_QUESTIONS.length} |\n` +
      `| Human resources | ${"${hr_score}"} / ${HR_QUESTIONS.length} |\n` +
      `| Infrastructure | ${"${infra_score}"} / ${INFRA_QUESTIONS.length} |\n` +
      `| Equipment | ${"${equip_score}"} / ${"${equip_max}"} |`,
  }));
  survey.push(q({ type: "end_group", name: "score_section_end" }));

  // ── Section 8 — Evidence ──────────────────────────────────────────────
  survey.push(q({ type: "begin_group", name: "evidence_section", label: "9. Photographic Evidence", appearance: "field-list" }));
  survey.push(banner("s9_banner", "📷", "Photographic Evidence", "Geo-tagged photos verify the visit — required shots are marked *."));
  EVIDENCE_SLOTS.forEach((slot) => {
    survey.push(q({
      type: "image", name: `evidence_${slot.slot}`, label: slot.label,
      required: slot.required ? "yes" : "",
      required_message: "This photograph is required as evidence of the visit.",
      appearance: "annotate",
    }));
  });
  survey.push(q({ type: "end_group", name: "evidence_section_end" }));

  // ── Section 9 — Learning, challenges & sign-off ───────────────────────
  survey.push(q({ type: "begin_group", name: "learning_section", label: "10. Learning, Challenges & Sign-off", appearance: "field-list" }));
  survey.push(banner("s10_banner", "📝", "Learning, Challenges & Sign-off", "Document what was learned and agree next steps with the facility."));
  survey.push(q({
    type: "select_multiple challenges", name: "key_challenges", label: "Key challenges observed",
    required: "yes", hint: "Select all that apply.",
  }));
  survey.push(q({ type: "text", name: "key_challenges_other", label: "Other challenge (specify)", relevant: "selected(${key_challenges}, 'other')", required: "yes" }));
  survey.push(q({
    type: "select_multiple recommendations", name: "recommendations", label: "Recommendations / agreed actions",
    required: "yes", hint: "Select all that apply.",
  }));
  survey.push(q({ type: "text", name: "recommendations_other", label: "Other recommendation (specify)", relevant: "selected(${recommendations}, 'other')", required: "yes" }));
  survey.push(q({ type: "text", name: "critical_gap", label: "Single most critical gap to escalate", required: "yes" }));
  survey.push(q({
    type: "text", name: "remarks", label: "General remarks & lessons learned", required: "yes",
    appearance: "multiline",
    constraint: "string-length(.) >= 10",
    constraint_message: "Please write at least 10 characters.",
  }));
  survey.push(q({ type: "image", name: "officer_signature", label: "Monitoring officer signature", required: "yes", appearance: "signature" }));
  survey.push(q({ type: "image", name: "incharge_signature", label: "Officer-in-charge signature", required: "yes", appearance: "signature" }));
  survey.push(q({
    type: "note", name: "closing_note",
    label: "### ✅ Thank you\nReview your answers, then tap **Submit**. Data syncs automatically to the See Clear Monitoring Dashboard.",
  }));
  survey.push(q({ type: "end_group", name: "learning_section_end" }));

  // ── Choices ───────────────────────────────────────────────────────────
  choices.push(ch("yes_no", "yes", "Yes"));
  choices.push(ch("yes_no", "no", "No"));

  FACILITY_LEVELS.forEach((o) => choices.push(ch("facility_level", o.value, o.label)));
  OWNERSHIP_TYPES.forEach((o) => choices.push(ch("ownership", o.value, o.label)));
  FUNCTIONAL_STATUS.forEach((o) => choices.push(ch("functional_status", o.value, o.label)));

  choices.push(ch("equip_status", "func", "Available & Functional (2)"));
  choices.push(ch("equip_status", "nonfunc", "Available but Not Functional (1)"));
  choices.push(ch("equip_status", "unavailable", "Not Available (0)"));
  choices.push(ch("equip_status", "na", "Not Applicable"));

  CHALLENGE_OPTIONS.forEach((c) => choices.push(ch("challenges", sanitizeName(c), c)));
  choices.push(ch("challenges", "other", "Other (specify)"));
  RECOMMENDATION_OPTIONS.forEach((c) => choices.push(ch("recommendations", sanitizeName(c), c)));
  choices.push(ch("recommendations", "other", "Other (specify)"));

  // Plateau State cascade (project geography).
  choices.push(ch("state_list", PROJECT_STATE, PROJECT_STATE));
  const lgas = getLGAsForState(PROJECT_STATE);
  lgas.forEach((lga) => {
    choices.push(ch("lga_list", lga, lga, PROJECT_STATE));
    getWardsForLGA(PROJECT_STATE, lga).forEach((ward) => {
      choices.push(ch("ward_list", `${sanitizeName(lga)}__${sanitizeName(ward)}`, ward, PROJECT_STATE, lga));
    });
  });

  const settings: Row[] = [
    SETTINGS_HEADER as unknown as Row,
    [title, formId, stamp, "theme-grid pages", "concat(${facility_name}, ' — ', ${lga}, ' (', ${date_of_visit}, ')')"],
  ];

  const wb = XLSX.utils.book_new();
  const surveySheet = XLSX.utils.aoa_to_sheet(survey);
  surveySheet["!cols"] = [
    { wch: 26 }, { wch: 24 }, { wch: 56 }, { wch: 40 }, { wch: 10 },
    { wch: 30 }, { wch: 34 }, { wch: 34 }, { wch: 30 }, { wch: 46 },
    { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 10 },
  ];
  const choicesSheet = XLSX.utils.aoa_to_sheet(choices);
  choicesSheet["!cols"] = [{ wch: 22 }, { wch: 34 }, { wch: 40 }, { wch: 16 }, { wch: 22 }];
  const settingsSheet = XLSX.utils.aoa_to_sheet(settings);
  settingsSheet["!cols"] = [{ wch: 60 }, { wch: 34 }, { wch: 12 }, { wch: 20 }, { wch: 60 }];

  XLSX.utils.book_append_sheet(wb, surveySheet, "survey");
  XLSX.utils.book_append_sheet(wb, choicesSheet, "choices");
  XLSX.utils.book_append_sheet(wb, settingsSheet, "settings");
  return wb;
}

export function downloadSeeClearXlsForm(options: SeeClearXlsFormOptions = {}): string {
  const wb = buildSeeClearXlsForm(options);
  const filename = `see_clear_mel_checklist_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
