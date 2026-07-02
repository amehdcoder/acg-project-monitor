// Special Form Studio — full-fidelity starter presets.
//
// Each preset seeds a COMPLETE, ready-to-use special form (every section +
// field of the real production form) AND pre-wires a linked monitoring
// dashboard (dashboardEnabled + KPI hints) so the Owner can start collecting
// and monitoring immediately — then customize everything freely.
//
// The four flagship presets (Bloomberg, See Clear, Integrated MDA Supervisory
// Checklist, SARMAAN/SAIRF) are generated from the exact same definition
// modules that power the real forms, so they are faithful, editable copies —
// not simplified look-alikes.

import type { FormGroup, Question, QuestionType, QuestionOption } from "@/components/FormBuilder/types";
import { DEFAULT_FORM_THEME, type FormTheme } from "@/lib/formTheme";
import { buildMdaSupervisoryChecklist } from "@/lib/mdaSupervisoryChecklist";
import {
  ALL_CLASSES,
  OPERATIONAL_STATUS,
  NOT_FOUND_REASONS,
} from "@/lib/bloomberg/definition";
import {
  FACILITY_LEVELS,
  OWNERSHIP_TYPES,
  FUNCTIONAL_STATUS,
  GENERAL_QUESTIONS,
  HR_QUESTIONS,
  INFRA_QUESTIONS,
  EQUIPMENT_ITEMS,
  EQUIP_STATUS_META,
  CHALLENGE_OPTIONS,
  RECOMMENDATION_OPTIONS,
  EVIDENCE_SLOTS,
  type EquipStatus,
} from "@/lib/seeclear/definition";
import {
  IRF_CATEGORY_FORMS,
  ACCEPTANCE_LEVELS,
  MINISTRY_DEPARTMENTS,
  OTHER_OPTION,
  type IrfCategoryField,
} from "@/lib/irf/categoryForms";

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Question with an AUTO-generated (label-derived, random-suffixed) name. */
function q(type: QuestionType, label: string, extra: Partial<Question> = {}): Question {
  return {
    id: uid(),
    type,
    label,
    name: `${slug(label)}_${uid().slice(0, 4)}`,
    required: false,
    ...extra,
  };
}

/** Question with an EXPLICIT stable name — use for anything the dashboard references. */
function qn(type: QuestionType, name: string, label: string, extra: Partial<Question> = {}): Question {
  return { id: uid(), type, label, name, required: false, ...extra };
}

function opts(...labels: string[]): QuestionOption[] {
  return labels.map((l) => ({ id: uid(), label: l, value: slug(l) }));
}

function optPairs(pairs: { label: string; value: string }[]): QuestionOption[] {
  return pairs.map((p) => ({ id: uid(), label: p.label, value: p.value }));
}

function section(label: string, questions: Question[]): FormGroup {
  return { id: uid(), name: `sec_${uid()}`, label, questions };
}

export type WidgetKind = "kpi" | "bar" | "donut" | "table" | "filter";
export type WidgetAgg = "sum" | "count" | "avg" | "distinct";

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  /** Question `name` this widget reads. Optional for count-of-submissions cards. */
  field?: string;
  agg: WidgetAgg;
  title: string;
  color?: string;
  /** Grid span (1 = half width, 2 = full width). */
  span?: 1 | 2;
}

export interface DashboardLayout {
  accent: string;
  background?: string;
  columns?: number;
  density?: "compact" | "comfortable";
}

export interface DashboardConfig {
  enabled: true;
  /** Primary metric fields (question names) surfaced as KPI cards. Legacy. */
  kpiFields: string[];
  /** Field used for status/completion breakdown, if any. Legacy. */
  statusField?: string;
  /** Field used for geography/location grouping, if any. Legacy. */
  geoField?: string;
  accent: string;
  /** Drag-and-drop widget layout. Supersedes legacy fields when present. */
  widgets?: DashboardWidget[];
  /** Saved dashboard theming/layout. */
  layout?: DashboardLayout;
}


export interface StudioPreset {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  theme: FormTheme;
  sections: () => FormGroup[];
  dashboard: () => DashboardConfig;
}

function theme(primary: string, accent: string, headerBg: string): FormTheme {
  return {
    ...DEFAULT_FORM_THEME,
    enabled: true,
    cardStyle: "elevated",
    density: "comfortable",
    light: { ...DEFAULT_FORM_THEME.light, primary, accent, headerBg, headerText: "#ffffff" },
  };
}

// Common geography cascade fields (plain selects/text — fully editable).
function stateField() {
  return qn("select_one", "state", "State", {
    required: true,
    options: opts("Kano", "Jigawa", "Sokoto", "Plateau", "Katsina", "Bauchi", "Kaduna"),
  });
}

// ============================================================================
// BLOOMBERG — School Enrolment Validation (complete)
// ============================================================================
function bloombergSections(): FormGroup[] {
  const enrolmentQs: Question[] = [];
  ALL_CLASSES.forEach((c) => {
    enrolmentQs.push(
      qn("number", `enrol_${c.key}_male`, `${c.label} — Male`, { number: { kind: "integer" }, validation: { min: 0 } } as Partial<Question>),
    );
    enrolmentQs.push(
      qn("number", `enrol_${c.key}_female`, `${c.label} — Female`, { number: { kind: "integer" }, validation: { min: 0 } } as Partial<Question>),
    );
  });

  const maleRefs = ALL_CLASSES.map((c) => `\${enrol_${c.key}_male}`).join(" + ");
  const femaleRefs = ALL_CLASSES.map((c) => `\${enrol_${c.key}_female}`).join(" + ");

  return [
    section("School Identification", [
      stateField(),
      qn("text", "lga", "LGA", { required: true }),
      qn("text", "ward", "Ward"),
      qn("text", "location", "Community / Location"),
      qn("text", "school_name", "School name", { required: true }),
      qn("text", "school_code", "School code"),
      qn("select_one", "ownership", "Ownership", { options: opts("Public / LEA", "Private", "Faith-based") }),
      qn("select_one", "school_level", "School level", { options: opts("Primary", "Junior Secondary", "Senior Secondary", "Combined") }),
      qn("geopoint", "school_gps", "School GPS", { required: true }),
    ]),
    section("Verification", [
      qn("select_one", "school_exists", "Was the school found / does it exist?", {
        required: true,
        options: opts("Yes", "No"),
      }),
      qn("select_one", "not_found_reason", "If not found, reason", {
        options: optPairs(NOT_FOUND_REASONS),
        relevant: "${school_exists} = 'no'",
      }),
      qn("select_one", "operational_status", "Operational status", {
        options: optPairs(OPERATIONAL_STATUS),
        relevant: "${school_exists} = 'yes'",
      }),
      qn("text", "head_teacher", "Head teacher name"),
      qn("text", "head_phone", "Head teacher phone", { text: { mask: "phone", placeholder: "0803 123 4567" } } as Partial<Question>),
      qn("date", "date_of_visit", "Date of visit", { required: true }),
    ]),
    section("Enrolment (by class & sex)", enrolmentQs),
    section("Totals", [
      qn("calculate", "total_male", "Total male", { calculation: maleRefs } as Partial<Question>),
      qn("calculate", "total_female", "Total female", { calculation: femaleRefs } as Partial<Question>),
      qn("calculate", "grand_total", "Grand total enrolment", { calculation: `${maleRefs} + ${femaleRefs}` } as Partial<Question>),
      qn("select_one", "validation_status", "Validation status", {
        required: true,
        options: opts("Validated", "Partially validated", "Not validated"),
      }),
    ]),
    section("Evidence & Sign-off", [
      qn("image", "photo_signboard", "Photo — School signboard", { required: true }),
      qn("image", "photo_register", "Photo — Enrolment register"),
      qn("image", "photo_premises", "Photo — School premises"),
      qn("signature", "validator_signature", "Validator signature", { required: true }),
    ]),
  ];
}

// ============================================================================
// SEE CLEAR — Eye Health Facility Monitoring Checklist (complete)
// ============================================================================
function yesNoBlock(items: { key: string; label: string }[]): Question[] {
  return items.map((it) => qn("select_one", it.key, it.label, { required: true, options: opts("Yes", "No") }));
}

function seeclearSections(): FormGroup[] {
  const equipStatusOpts: QuestionOption[] = (Object.keys(EQUIP_STATUS_META) as EquipStatus[]).map((k) => ({
    id: uid(),
    label: EQUIP_STATUS_META[k].label,
    value: k,
  }));

  const equipmentQs = EQUIPMENT_ITEMS.map((it) =>
    qn("select_one", `equip_${it.key}`, it.label, { required: it.group === "basic", options: equipStatusOpts.map((o) => ({ ...o, id: uid() })) }),
  );

  return [
    section("Facility Profile", [
      qn("text", "facility_name", "Facility name", { required: true }),
      qn("select_one", "facility_level", "Facility level", { required: true, options: optPairs(FACILITY_LEVELS) }),
      qn("select_one", "ownership_type", "Ownership", { options: optPairs(OWNERSHIP_TYPES) }),
      qn("select_one", "functional_status", "Functional status", { required: true, options: optPairs(FUNCTIONAL_STATUS) }),
      stateField(),
      qn("text", "lga", "LGA", { required: true }),
      qn("text", "ward", "Ward"),
      qn("text", "focal_name", "Focal person name"),
      qn("text", "focal_phone", "Focal person phone", { text: { mask: "phone" } } as Partial<Question>),
      qn("text", "focal_designation", "Focal person designation"),
      qn("number", "staff_on_duty", "Staff on duty", { number: { kind: "integer" } } as Partial<Question>),
      qn("geopoint", "gps", "Facility GPS", { required: true }),
    ]),
    section("General Facility Assessment", yesNoBlock(GENERAL_QUESTIONS)),
    section("Human Resources", yesNoBlock(HR_QUESTIONS)),
    section("Infrastructure & Utilities", yesNoBlock(INFRA_QUESTIONS)),
    section("Equipment & Medical Supplies", equipmentQs),
    section("Referrals", [
      qn("number", "referrals_made", "Referrals made", { number: { kind: "integer" } } as Partial<Question>),
      qn("number", "referrals_completed", "Referrals completed", { number: { kind: "integer" } } as Partial<Question>),
    ]),
    section("Challenges & Recommendations", [
      qn("select_multiple", "challenges", "Challenges observed", { options: opts(...CHALLENGE_OPTIONS) }),
      qn("select_multiple", "recommendations", "Recommendations", { options: opts(...RECOMMENDATION_OPTIONS) }),
      qn("select_one", "critical_gap", "Any critical gap requiring urgent action?", { options: opts("Yes", "No") }),
    ]),
    section(
      "Evidence",
      EVIDENCE_SLOTS.map((e) => qn("image", `photo_${e.slot}`, e.label, { required: e.required })),
    ),
    section("Sign-off", [
      qn("signature", "incharge_signature", "Officer-in-charge signature", { required: true }),
      qn("signature", "officer_signature", "Monitoring officer signature", { required: true }),
    ]),
  ];
}

// ============================================================================
// SARMAAN / SAIRF — ACSM Indicator Reporting (all four category forms)
// ============================================================================
function irfFieldToQuestion(f: IrfCategoryField): Question {
  const extra: Partial<Question> = { required: !!f.required, hint: f.what };
  const name = f.column || f.key;
  switch (f.type) {
    case "number":
      return qn("number", name, f.label, { ...extra, number: { kind: "integer" } } as Partial<Question>);
    case "longtext":
      return qn("text", name, f.label, { ...extra, appearance: "multiline", text: { multiline: true } } as Partial<Question>);
    case "text":
      return qn("text", name, f.label, extra);
    case "date":
      return qn("date", name, f.label, extra);
    case "boolean":
      return qn("select_one", name, f.label, { ...extra, options: opts("Yes", "No") });
    case "acceptance":
      return qn("select_one", name, f.label, { ...extra, options: opts(...ACCEPTANCE_LEVELS) });
    case "select": {
      const base = [...(f.options || [])];
      if (f.allowOther) base.push(OTHER_OPTION);
      return qn("select_one", name, f.label, { ...extra, options: opts(...base) });
    }
    default:
      return qn("text", name, f.label, extra);
  }
}

function sarmaanSections(): FormGroup[] {
  const groups: FormGroup[] = [
    section("Reporting Context", [
      stateField(),
      qn("select_one", "lga", "LGA", {
        options: opts("Ungogo", "Nasarawa", "Fagge", "Dala", "Gwale", "Tarauni", "Kumbotso"),
      }),
      qn("text", "ward", "Ward"),
      qn("date", "reporting_month", "Reporting month", { required: true }),
      qn("select_one", "reporting_level", "Reporting level", { required: true, options: opts("State", "LGA") }),
      qn("text", "focal_person_name", "Focal person name", { required: true }),
      qn("text", "focal_person_phone", "Focal person phone", { text: { mask: "phone" } } as Partial<Question>),
      qn("select_one", "activity_category", "Activity category", {
        required: true,
        options: opts(...IRF_CATEGORY_FORMS.map((c) => c.name)),
      }),
    ]),
  ];

  // Each real category form becomes a set of sections, relevant to the category.
  IRF_CATEGORY_FORMS.forEach((cat) => {
    const rel = `\${activity_category} = '${slug(cat.name)}'`;
    if (cat.perMinistry) {
      groups.push(
        section(`${cat.short} — Ministry / Department`, [
          qn("select_one", "ministry_department", "Ministry / department engaged", {
            options: opts(...MINISTRY_DEPARTMENTS),
            relevant: rel,
          }),
        ]),
      );
    }
    cat.groups.forEach((g) => {
      const qs = g.fields.map((f) => {
        const question = irfFieldToQuestion(f);
        question.relevant = rel;
        return question;
      });
      groups.push(section(`${cat.short} — ${g.activity}`, qs));
    });
  });

  groups.push(
    section("Narrative & Evidence", [
      qn("text", "narrative", "Narrative summary", { appearance: "multiline", text: { multiline: true } } as Partial<Question>),
      qn("image", "evidence_photo", "Activity photo (with consent)"),
      qn("select_one", "photo_consent", "Photo consent obtained?", { options: opts("Yes", "No") }),
      qn("geopoint", "gps", "GPS location", { required: true }),
    ]),
  );

  return groups;
}

// ============================================================================
// INTEGRATED SUPERVISORY CHECKLIST — Programme Implementation Learning (complete)
// Sections A–M from the Integrated Supervisory Checklist & Learning Dashboard doc.
// ============================================================================
function ynp(name: string, label: string, extra: Partial<Question> = {}): Question {
  return qn("select_one", name, label, { options: opts("Yes", "No", "Partly"), ...extra });
}
function yn(name: string, label: string, extra: Partial<Question> = {}): Question {
  return qn("select_one", name, label, { options: opts("Yes", "No"), ...extra });
}
function ynpna(name: string, label: string, extra: Partial<Question> = {}): Question {
  return qn("select_one", name, label, { options: opts("Yes", "No", "Partly", "N/A"), ...extra });
}
function longtext(name: string, label: string, extra: Partial<Question> = {}): Question {
  return qn("text", name, label, { appearance: "multiline", text: { multiline: true }, ...extra } as Partial<Question>);
}
function score10(name: string, label: string): Question {
  return qn("number", name, label, { number: { kind: "integer" }, validation: { min: 0, max: 10 }, hint: "Score out of 10" } as Partial<Question>);
}

function supervisoryLearningSections(): FormGroup[] {
  return [
    // ---- Section A ----
    section("A. Supervisor & Visit Information", [
      qn("date", "date_of_supervision", "Date of supervision", { required: true }),
      qn("text", "supervisor_name", "Name of supervisor", { required: true }),
      qn("text", "supervisor_designation", "Supervisor designation / organization", { hint: "State / LGA / partner supervisor" }),
      stateField(),
      qn("text", "lga", "LGA", { required: true }),
      qn("text", "ward", "Ward"),
      qn("text", "community", "Community / settlement / facility visited", { required: true }),
      qn("geopoint", "gps", "GPS coordinate of supervision location", { required: true }),
      qn("select_one", "type_of_visit", "Type of visit", {
        required: true,
        options: opts("Routine", "Spot check", "Follow-up", "Verification", "Problem-solving"),
      }),
      qn("select_multiple", "activity_supervised", "Activity being supervised", {
        required: true,
        options: opts("Stakeholder advocacy", "LGA-level advocacy", "Community dialogue", "Awareness creation", "Non-compliance resolution", "IEC materials", "Other"),
      }),
      yn("team_present", "Implementing team present during visit?"),
      longtext("persons_interviewed", "Names / designations of persons interviewed", { hint: "Include staff, leaders, beneficiaries, health workers" }),
      yn("activity_observed", "Was the activity observed directly?"),
      qn("select_multiple", "verification_source", "Main source of verification", {
        options: opts("Observation", "Attendance", "Photos", "Minutes", "Interview", "Register", "Report", "Audio/Video"),
      }),
    ]),

    // ---- Section B ----
    section("B. Activity Planning & Preparedness", [
      qn("select_one", "in_workplan", "Was the activity included in the approved workplan or microplan?", { options: opts("Yes", "No", "Not sure") }),
      ynp("clear_objective", "Was there a clear objective for the activity?", { hint: "Score 2/0/1" }),
      ynp("target_defined", "Was the target audience clearly defined before the activity?", { hint: "Score 2/0/1" }),
      ynp("roles_assigned", "Were roles and responsibilities assigned before implementation?", { hint: "Score 2/0/1" }),
      ynp("tools_available", "Were activity tools/materials available before implementation?", { hint: "Score 2/0/1" }),
      ynp("conducted_as_planned", "Was the activity conducted at the planned time and location?", { hint: "Score 2/0/1" }),
      longtext("plan_change_reason", "If implementation changed from plan, what changed and why?"),
      ynp("anticipated_barriers", "Did the team anticipate possible barriers before the activity?", { hint: "Score 2/0/1" }),
      longtext("barriers_anticipated", "What risks or barriers were anticipated?"),
      ynp("mitigation_prepared", "Were mitigation actions prepared before implementation?", { hint: "Score 2/0/1" }),
      ynpna("prev_recommendations_used", "Were previous supervision recommendations considered before this activity?"),
    ]),

    // ---- Section C ----
    section("C. Stakeholder Advocacy Supervision", [
      yn("advocacy_conducted", "Was stakeholder advocacy conducted?", { required: true }),
      qn("select_multiple", "stakeholder_type", "Type of stakeholder engaged", {
        options: opts("MDA", "State", "Emirate", "LGA", "Religious", "Traditional", "Facility"),
        relevant: "${advocacy_conducted} = 'yes'",
      }),
      qn("number", "num_mdas_visited", "Number of MDAs visited", { number: { kind: "integer" }, relevant: "${advocacy_conducted} = 'yes'" } as Partial<Question>),
      longtext("mda_names", "Names of MDAs visited", { relevant: "${advocacy_conducted} = 'yes'" }),
      qn("number", "num_state_meetings", "Number of state-level advocacy meetings held", { number: { kind: "integer" }, relevant: "${advocacy_conducted} = 'yes'" } as Partial<Question>),
      qn("number", "num_emirate_engagements", "Number of Emirate Council engagements held", { number: { kind: "integer" }, relevant: "${advocacy_conducted} = 'yes'" } as Partial<Question>),
      longtext("key_stakeholders_met", "Names / designations of key stakeholders met", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("right_decision_maker", "Was the right level of decision-maker reached?", { relevant: "${advocacy_conducted} = 'yes'", hint: "Do not count courtesy visits as high-level advocacy" }),
      ynpna("inclusion_represented", "Were women, disability representatives or marginalized groups represented where relevant?", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("purpose_explained", "Was the purpose clearly explained?", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("data_used", "Were programme data / evidence used?", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("commitments_recorded", "Were commitments clearly recorded?", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("responsibilities_assigned", "Were responsibilities assigned?", { relevant: "${advocacy_conducted} = 'yes'" }),
      ynp("followup_agreed", "Was a follow-up action agreed?", { relevant: "${advocacy_conducted} = 'yes'" }),
      longtext("key_decisions", "What key decisions or commitments were made?", { relevant: "${advocacy_conducted} = 'yes'" }),
      qn("select_multiple", "support_received", "What type of support was received?", {
        options: opts("Endorsement", "Mobilization", "Security", "Venue", "Media", "Personnel", "Funding"),
        relevant: "${advocacy_conducted} = 'yes'",
      }),
      ynp("commitment_acted", "Has any commitment already been acted upon?", { relevant: "${advocacy_conducted} = 'yes'" }),
      qn("text", "advocacy_followup_owner", "Who is responsible for follow-up?", { relevant: "${advocacy_conducted} = 'yes'" }),
      qn("date", "advocacy_followup_deadline", "Follow-up deadline", { relevant: "${advocacy_conducted} = 'yes'" }),
      longtext("advocacy_advantage", "Learning probe: did this advocacy produce a concrete implementation advantage? State the advantage.", { relevant: "${advocacy_conducted} = 'yes'" }),
    ]),

    // ---- Section D ----
    section("D. LGA-Level Advocacy Supervision", [
      qn("number", "num_policy_makers", "Number of policy makers engaged", { number: { kind: "integer" } } as Partial<Question>),
      longtext("policy_maker_names", "Names / designations of policy makers"),
      qn("number", "num_traditional_leaders", "Number of traditional leaders engaged", { number: { kind: "integer" } } as Partial<Question>),
      qn("select_one", "traditional_support_level", "Level of traditional leader support", { options: opts("Strong", "Moderate", "Weak", "No support") }),
      qn("number", "num_health_workers", "Number of healthcare workers engaged", { number: { kind: "integer" } } as Partial<Question>),
      qn("select_multiple", "facility_type", "Type of facility represented", { options: opts("PHC", "General hospital", "Private", "Outreach", "Other") }),
      qn("number", "num_religious_leaders", "Number of religious leaders engaged", { number: { kind: "integer" } } as Partial<Question>),
      qn("select_multiple", "religious_support_mode", "Mode of religious leader support", { options: opts("Sermon", "Announcement", "Instruction", "Referral", "Refusal resolution") }),
      ynp("lga_understood_role", "Did LGA actors understand their role?"),
      ynp("lga_committed_actions", "Did they commit to specific actions?"),
      ynp("lga_named_actions", "Were action points assigned to named individuals?"),
      ynp("community_entry_activated", "Were community entry structures activated?"),
      ynp("leaders_supported_mobilization", "Did leaders support mobilization before activity?"),
      ynp("leaders_participated", "Did leaders participate during implementation?"),
      ynp("leaders_resolved_problems", "Did leaders help resolve implementation problems?"),
      longtext("most_useful_stakeholder", "Which stakeholder group was most useful and why?"),
      longtext("least_responsive_stakeholder", "Which stakeholder group was least responsive and why?"),
      longtext("unmet_commitments", "What support was promised but not delivered?"),
      longtext("lga_improvement", "What should be done differently next time?"),
    ]),

    // ---- Section E ----
    section("E. Community Dialogue & Social Mobilization", [
      yn("dialogue_held", "Was a community dialogue held?", { required: true }),
      qn("number", "num_dialogue_sessions", "Number of dialogue sessions held", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      qn("text", "dialogue_location_date", "Location and date of dialogue", { relevant: "${dialogue_held} = 'yes'" }),
      qn("select_one", "venue_type", "Type of venue", { options: opts("Square", "Palace", "Religious", "Health", "School", "Other"), relevant: "${dialogue_held} = 'yes'" }),
      ynp("venue_accessible", "Was the venue accessible to women, elderly people and PWDs?", { relevant: "${dialogue_held} = 'yes'" }),
      qn("number", "num_men", "Number of men present", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      qn("number", "num_women", "Number of women present", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      qn("number", "num_youth", "Number of young people present", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      qn("number", "num_pwd", "Number of PWDs present", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      yn("influential_present", "Were influential community members present?", { relevant: "${dialogue_held} = 'yes'" }),
      qn("select_multiple", "underrepresented_groups", "Which groups were underrepresented?", { options: opts("Women", "Youth", "PWD", "Other"), relevant: "${dialogue_held} = 'yes'" }),
      qn("select_one", "participation_type", "Was participation active or passive?", { options: opts("Active", "Moderate", "Passive"), relevant: "${dialogue_held} = 'yes'" }),
      qn("select_one", "engagement_level", "Level of engagement", { options: opts("High", "Medium", "Low"), relevant: "${dialogue_held} = 'yes'" }),
      qn("number", "num_contributions", "Number of questions / contributions made", { number: { kind: "integer" }, relevant: "${dialogue_held} = 'yes'" } as Partial<Question>),
      ynp("women_encouraged", "Were women encouraged to speak?", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("concerns_discussed", "Were concerns openly discussed?", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("misconceptions_identified", "Were misconceptions identified?", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("responses_correct", "Were responses technically correct and culturally appropriate?", { relevant: "${dialogue_held} = 'yes'" }),
      longtext("issues_raised", "Key issues raised by the community", { relevant: "${dialogue_held} = 'yes'" }),
      qn("select_multiple", "main_misconception", "Main misconception or fear mentioned", { options: opts("Safety", "Religious", "Side effects", "Distrust", "Other"), relevant: "${dialogue_held} = 'yes'" }),
      ynp("issue_resolved_session", "Was the issue resolved during session?", { relevant: "${dialogue_held} = 'yes'" }),
      qn("text", "dialogue_followup_owner", "Who should follow up unresolved issues?", { relevant: "${dialogue_held} = 'yes'" }),
      qn("date", "dialogue_followup_date", "Follow-up date", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("simple_language", "Facilitator used simple local language", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("allowed_questions", "Facilitator allowed questions", { relevant: "${dialogue_held} = 'yes'" }),
      ynp("clear_action_points", "Dialogue ended with clear action points", { relevant: "${dialogue_held} = 'yes'" }),
      longtext("community_taught", "Learning probe: what did the community teach the team that was not obvious before?", { relevant: "${dialogue_held} = 'yes'" }),
    ]),

    // ---- Section F ----
    section("F. Non-Compliance Resolution Supervision", [
      yn("cases_identified_yn", "Were non-compliance / refusal cases identified?", { required: true }),
      qn("number", "cases_identified", "Number of cases identified", { number: { kind: "integer" }, relevant: "${cases_identified_yn} = 'yes'" } as Partial<Question>),
      qn("text", "cases_location", "Ward / settlement where cases occurred", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("text", "household_id", "Household ID or identifier", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("select_multiple", "noncompliance_type", "Type of non-compliance", { options: opts("Refusal", "Absent", "Fear", "Rumour", "Religious", "Side effects", "Distrust"), relevant: "${cases_identified_yn} = 'yes'" }),
      qn("select_one", "case_identified_by", "Who identified the case?", { options: opts("CDD", "Supervisor", "Leader", "Health worker", "Other"), relevant: "${cases_identified_yn} = 'yes'" }),
      yn("case_documented", "Was the case documented in a register or line list?", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("select_one", "main_reason", "Main reason for non-compliance", { options: opts("Fear", "Rumour", "Religious", "Side effects", "Distrust", "Absence", "Other"), relevant: "${cases_identified_yn} = 'yes'", hint: "'Refused' is not a root cause" }),
      qn("select_multiple", "secondary_reasons", "Secondary reasons", { options: opts("Fear", "Rumour", "Religious", "Side effects", "Distrust", "Absence", "Other"), relevant: "${cases_identified_yn} = 'yes'" }),
      yn("reason_verified", "Was the reason verified through direct conversation?", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("select_one", "reason_scope", "Is the reason individual, household-level or community-wide?", { options: opts("Individual", "Household", "Community-wide"), relevant: "${cases_identified_yn} = 'yes'" }),
      qn("select_one", "spread_risk", "Is the issue likely to affect other households?", { options: opts("Yes", "No", "Not sure"), relevant: "${cases_identified_yn} = 'yes'" }),
      longtext("root_cause", "What is the deeper root cause?", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("number", "cases_resolved", "Number of cases resolved", { number: { kind: "integer" }, relevant: "${cases_identified_yn} = 'yes'" } as Partial<Question>),
      qn("number", "cases_pending", "Number of cases pending", { number: { kind: "integer" }, relevant: "${cases_identified_yn} = 'yes'" } as Partial<Question>),
      qn("select_multiple", "resolution_method", "Resolution method used", { options: opts("Dialogue", "Religious leader", "Traditional leader", "Health worker", "Revisit"), relevant: "${cases_identified_yn} = 'yes'" }),
      qn("text", "resolution_lead", "Who led the resolution?", { relevant: "${cases_identified_yn} = 'yes'" }),
      ynp("household_satisfied", "Was the household / community satisfied with the response?", { relevant: "${cases_identified_yn} = 'yes'" }),
      yn("followup_date_agreed", "Was a follow-up date agreed?", { relevant: "${cases_identified_yn} = 'yes'" }),
      ynpna("case_escalated", "Was the pending case escalated?", { relevant: "${cases_identified_yn} = 'yes'" }),
      qn("text", "escalated_to", "Escalated to whom?", { relevant: "${cases_identified_yn} = 'yes'" }),
      longtext("further_support", "What further support is required?", { relevant: "${cases_identified_yn} = 'yes'" }),
      ynp("resolution_respectful", "Resolution was respectful and non-coercive?", { relevant: "${cases_identified_yn} = 'yes'" }),
    ]),

    // ---- Section G ----
    section("G. Awareness Creation & IEC Materials", [
      yn("radio_aired", "Were radio messages aired?"),
      qn("number", "num_radio_broadcasts", "Number of radio broadcasts aired", { number: { kind: "integer" }, relevant: "${radio_aired} = 'yes'" } as Partial<Question>),
      qn("text", "radio_station", "Radio station / channel used", { relevant: "${radio_aired} = 'yes'" }),
      qn("text", "broadcast_language", "Language used for broadcast", { relevant: "${radio_aired} = 'yes'" }),
      qn("number", "radio_reach", "Estimated radio reach", { number: { kind: "integer" }, relevant: "${radio_aired} = 'yes'" } as Partial<Question>),
      yn("town_announcements", "Were town announcements conducted?"),
      qn("number", "num_town_announcements", "Number of town announcement sessions", { number: { kind: "integer" }, relevant: "${town_announcements} = 'yes'" } as Partial<Question>),
      yn("religious_announcements", "Were religious announcements conducted?"),
      qn("number", "num_religious_announcements", "Number of religious announcements", { number: { kind: "integer" }, relevant: "${religious_announcements} = 'yes'" } as Partial<Question>),
      qn("number", "estimated_total_reached", "Estimated total population reached", { number: { kind: "integer" } } as Partial<Question>),
      qn("select_one", "reach_calc_method", "How was estimated reach calculated?", { options: opts("Population", "Radio estimate", "Attendance", "Assumption") }),
      ynp("message_clear", "Message was clear and simple"),
      ynp("message_language", "Message delivered in appropriate local language"),
      ynp("message_actionable", "Message included correct date, location and expected action"),
      ynp("message_addressed_fears", "Message addressed common fears / misconceptions"),
      yn("iec_distributed", "Were IEC materials distributed?"),
      qn("select_multiple", "iec_types", "Type of IEC materials distributed", { options: opts("Poster", "Leaflet", "Banner", "Sticker", "Job aid"), relevant: "${iec_distributed} = 'yes'" }),
      qn("number", "num_iec_distributed", "Number of IEC materials distributed", { number: { kind: "integer" }, relevant: "${iec_distributed} = 'yes'" } as Partial<Question>),
      yn("iec_seen", "Were materials seen / displayed during supervision?", { relevant: "${iec_distributed} = 'yes'" }),
      qn("select_multiple", "iec_display_locations", "Locations where materials were displayed", { options: opts("Health centre", "Palace", "Religious", "School", "Market", "Board"), relevant: "${iec_distributed} = 'yes'" }),
      ynp("iec_high_traffic", "Were materials displayed in high-traffic locations?", { relevant: "${iec_distributed} = 'yes'" }),
      ynp("iec_readable", "Were materials readable and in good condition?", { relevant: "${iec_distributed} = 'yes'" }),
      ynp("iec_understood", "Were materials understood by community members interviewed?", { relevant: "${iec_distributed} = 'yes'" }),
      ynp("community_recall", "Did community members recall hearing / seeing the message?"),
      qn("select_one", "most_effective_channel", "Which awareness channel seemed most effective?", { options: opts("Radio", "Town announcement", "Religious announcement", "IEC materials", "Community dialogue") }),
    ]),

    // ---- Section H ----
    section("H. Means of Verification & Data Quality", [
      ynp("records_available", "Are records available for the activity?"),
      ynp("records_complete", "Are records complete?"),
      ynp("dates_consistent", "Are dates consistent across reports, attendance and photos?"),
      ynp("numbers_consistent", "Are participant numbers internally consistent?"),
      ynp("photos_linked", "Are photos clearly linked to activity location / date?"),
      ynpna("consent_obtained", "Was consent obtained before photos were taken?"),
      ynp("attendance_signed", "Are attendance sheets signed or thumbprinted?"),
      ynp("names_legible", "Are names / designations legible?"),
      ynp("outcomes_documented", "Are outcomes / action points documented?"),
      ynp("prev_followup_evidence", "Is there evidence of follow-up on previous action points?"),
      qn("select_one", "mov_quality", "Overall MOV quality rating", { required: true, options: opts("Good", "Fair", "Poor") }),
      qn("image", "evidence_photo", "Evidence photo (MOV)"),
    ]),

    // ---- Section I ----
    section("I. Implementation Success Assessment", [
      longtext("biggest_successes", "What were the three biggest successes observed?"),
      longtext("success_evidence", "What evidence confirms these successes?"),
      qn("select_one", "strongest_activity", "Which activity produced the strongest result?", { options: opts("Stakeholder advocacy", "LGA advocacy", "Community dialogue", "Awareness / IEC", "Non-compliance resolution") }),
      longtext("why_successful", "Why was it successful?"),
      qn("select_one", "best_reached_group", "Which target group was most effectively reached?", { options: opts("Men", "Women", "Youth", "PWD", "Leaders", "Health workers") }),
      qn("select_one", "least_reached_group", "Which target group was least reached?", { options: opts("Men", "Women", "Youth", "PWD", "Leaders", "Health workers") }),
      longtext("unintended_positive", "What unintended positive outcome occurred?"),
      longtext("practice_to_continue", "What implementation practice should be continued?"),
      longtext("practice_to_scale", "What practice should be scaled to other locations?"),
    ]),

    // ---- Section J ----
    section("J. Challenges, Bottlenecks & Risks", [
      longtext("main_challenges", "What were the main implementation challenges?"),
      qn("select_one", "challenge_timing", "When did the challenge occur?", { options: opts("Before", "During", "After") }),
      longtext("challenge_cause", "What caused the challenge?"),
      qn("select_multiple", "challenge_affected", "Who was affected by the challenge?", { options: opts("Community", "Implementers", "Leaders", "Health workers", "Women", "Youth", "PWD") }),
      ynp("challenge_resolved", "Was the challenge resolved?"),
      longtext("challenge_resolution", "How was it resolved?"),
      longtext("challenge_unresolved", "What remains unresolved?"),
      longtext("challenge_support_needed", "What support is required from LGA / state / partner level?"),
      qn("select_one", "challenge_recur", "Is this challenge likely to recur?", { options: opts("Yes", "No", "Not sure") }),
      longtext("prevention_action", "What prevention action is needed before the next activity?"),
      qn("select_multiple", "challenge_category", "Challenge category", {
        options: opts("Late planning", "Weak commitment", "Low turnout", "Documentation", "Rumour", "Refusal", "Funds", "HR", "Insecurity", "Logistics", "IEC", "Inclusion", "Data quality", "Other"),
      }),
    ]),

    // ---- Section K ----
    section("K. Learning & Adaptive Management", [
      longtext("most_important_lesson", "What is the most important lesson from this activity?"),
      longtext("assumption_wrong", "What assumption did implementation prove wrong?"),
      longtext("should_stop", "What should the programme stop doing?"),
      longtext("should_continue", "What should the programme continue doing?"),
      longtext("should_start", "What should the programme start doing?"),
      longtext("should_change", "What should be changed in the next round?"),
      longtext("best_approach", "Which message, stakeholder or mobilization approach worked best?"),
      longtext("weak_approach", "Which approach failed or underperformed?"),
      longtext("lesson_evidence", "What evidence supports this lesson?"),
      qn("select_multiple", "learning_audience", "Who needs to receive this learning?", { options: opts("State team", "LGA team", "Partners", "Community leaders", "Frontline workers") }),
      longtext("learning_use", "How will the learning be used?"),
      qn("select_one", "lesson_type", "Is the lesson evidence-based or opinion-based?", { options: opts("Evidence", "Opinion", "Mixed") }),
      ynp("lesson_actionable", "Can the lesson be acted upon?"),
      qn("text", "lesson_owner", "Who is responsible for acting on it?"),
      qn("date", "lesson_deadline", "By when?"),
    ]),

    // ---- Section L ----
    section("L. Action Plan & Follow-Up", [
      qn("text", "action_point", "Action point", { hint: "Specific task" }),
      qn("text", "action_owner", "Responsible person"),
      qn("select_one", "action_level", "Level", { options: opts("Community", "LGA", "State", "Partner") }),
      qn("date", "action_due_date", "Due date"),
      qn("select_one", "action_priority", "Priority", { options: opts("High", "Medium", "Low") }),
      qn("select_one", "action_status", "Status", { options: opts("Pending", "In progress", "Completed") }),
      ynpna("prev_actions_reviewed", "Were previous action points reviewed?"),
      qn("number", "num_actions_completed", "Number completed", { number: { kind: "integer" } } as Partial<Question>),
      qn("number", "num_actions_pending", "Number still pending", { number: { kind: "integer" } } as Partial<Question>),
      longtext("pending_reasons", "Reasons for pending actions"),
      longtext("action_escalation", "Which action point requires escalation?"),
      qn("text", "action_escalated_to", "Escalated to whom?"),
      qn("date", "next_followup_date", "Date for next follow-up"),
    ]),

    // ---- Section M ----
    section("M. Supervisor Final Judgement", [
      qn("select_one", "overall_implementation_quality", "Overall implementation quality", { required: true, options: opts("Excellent", "Good", "Fair", "Poor") }),
      qn("select_one", "overall_evidence_quality", "Overall evidence quality", { required: true, options: opts("Strong", "Moderate", "Weak", "No evidence") }),
      qn("select_one", "overall_learning_value", "Overall learning value of visit", { options: opts("High", "Medium", "Low") }),
      ynp("contributes_objectives", "Is the activity likely to contribute to programme objectives?"),
      qn("select_one", "repeat_approach", "Should this approach be repeated?", { options: opts("Yes", "No", "Only with modification") }),
      longtext("final_recommendation", "Final recommendation"),
      score10("score_planning", "Planning and preparedness score"),
      score10("score_stakeholder", "Stakeholder engagement score"),
      score10("score_participation", "Community participation score"),
      score10("score_noncompliance", "Non-compliance management score"),
      score10("score_awareness", "Awareness effectiveness score"),
      score10("score_evidence", "Evidence / MOV quality score"),
      score10("score_learning", "Learning and adaptation score"),
      score10("score_followup", "Follow-up readiness score"),
      qn("calculate", "total_score", "Total score /80", {
        calculation: "${score_planning} + ${score_stakeholder} + ${score_participation} + ${score_noncompliance} + ${score_awareness} + ${score_evidence} + ${score_learning} + ${score_followup}",
        hint: "65-80 strong; 50-64 good; 35-49 weak; below 35 poor",
      } as Partial<Question>),
      qn("signature", "supervisor_signature", "Supervisor signature", { required: true }),
    ]),
  ];
}

function supervisoryLearningDashboard(): DashboardConfig {
  const accent = "#0b3b6f";
  const widgets: DashboardWidget[] = [
    // Filters (geography + visit type)
    { id: uid(), kind: "filter", field: "state", agg: "count", title: "State" },
    { id: uid(), kind: "filter", field: "lga", agg: "count", title: "LGA" },
    { id: uid(), kind: "filter", field: "type_of_visit", agg: "count", title: "Visit type" },
    { id: uid(), kind: "filter", field: "overall_implementation_quality", agg: "count", title: "Implementation quality" },
    // Executive KPI cards
    { id: uid(), kind: "kpi", agg: "count", title: "Supervision visits", color: accent },
    { id: uid(), kind: "kpi", field: "total_score", agg: "avg", title: "Avg total score /80", color: "#15803d" },
    { id: uid(), kind: "kpi", field: "estimated_total_reached", agg: "sum", title: "Estimated people reached", color: "#0891b2" },
    { id: uid(), kind: "kpi", field: "cases_identified", agg: "sum", title: "Non-compliance cases", color: "#b45309" },
    { id: uid(), kind: "kpi", field: "cases_resolved", agg: "sum", title: "Cases resolved", color: "#15803d" },
    { id: uid(), kind: "kpi", field: "cases_pending", agg: "sum", title: "Cases pending", color: "#b91c1c" },
    { id: uid(), kind: "kpi", field: "num_women", agg: "sum", title: "Women reached (dialogue)", color: "#9333ea" },
    { id: uid(), kind: "kpi", field: "num_dialogue_sessions", agg: "sum", title: "Dialogue sessions", color: accent },
    // Breakdown charts
    { id: uid(), kind: "bar", field: "overall_implementation_quality", agg: "count", title: "Implementation quality distribution", color: accent, span: 2 },
    { id: uid(), kind: "donut", field: "overall_evidence_quality", agg: "count", title: "Evidence / MOV quality", color: "#7c3aed" },
    { id: uid(), kind: "donut", field: "type_of_visit", agg: "count", title: "Visits by type", color: "#0891b2" },
    { id: uid(), kind: "bar", field: "lga", agg: "count", title: "Visits by LGA", color: "#15803d", span: 2 },
    { id: uid(), kind: "donut", field: "action_status", agg: "count", title: "Action point status", color: "#2563eb" },
    { id: uid(), kind: "donut", field: "main_reason", agg: "count", title: "Non-compliance root cause", color: "#b45309" },
    { id: uid(), kind: "bar", field: "most_effective_channel", agg: "count", title: "Most effective awareness channel", color: "#0891b2", span: 2 },
    { id: uid(), kind: "bar", field: "challenge_category", agg: "count", title: "Challenge categories", color: "#b91c1c", span: 2 },
    // Detail table
    { id: uid(), kind: "table", field: "community", agg: "count", title: "Visits by community", span: 2 },
  ];

  return {
    enabled: true,
    kpiFields: ["total_score", "estimated_total_reached", "cases_resolved"],
    statusField: "overall_implementation_quality",
    geoField: "lga",
    accent,
    widgets,
    layout: { accent, columns: 2, density: "comfortable" },
  };
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    key: "blank",
    title: "Blank canvas",
    subtitle: "Start from scratch with one empty section",
    accent: "#6366f1",
    theme: theme("#6366f1", "#a855f7", "#4338ca"),
    sections: () => [section("Section 1", [])],
    dashboard: () => ({ enabled: true, kpiFields: [], accent: "#6366f1" }),
  },
  {
    key: "bloomberg",
    title: "Bloomberg School Enrolment Validation",
    subtitle: "Complete school enrolment validation checklist + dashboard",
    accent: "#0c2340",
    theme: theme("#0c2340", "#c8102e", "#0c2340"),
    sections: bloombergSections,
    dashboard: () => ({
      enabled: true,
      kpiFields: ["grand_total", "total_male", "total_female"],
      statusField: "validation_status",
      geoField: "state",
      accent: "#0c2340",
    }),
  },
  {
    key: "seeclear",
    title: "See Clear Eye Health Facility Monitoring",
    subtitle: "Complete facility readiness checklist + monitoring dashboard",
    accent: "#0f766e",
    theme: theme("#0f766e", "#14b8a6", "#0f766e"),
    sections: seeclearSections,
    dashboard: () => ({
      enabled: true,
      kpiFields: ["referrals_made", "referrals_completed", "staff_on_duty"],
      statusField: "functional_status",
      geoField: "facility_name",
      accent: "#0f766e",
    }),
  },
  {
    key: "mda",
    title: "Integrated MDA Supervisory Checklist",
    subtitle: "Complete 15-section MDA supervision checklist + dashboard",
    accent: "#0d9488",
    theme: theme("#0d9488", "#10b981", "#134e4a"),
    sections: () => buildMdaSupervisoryChecklist().questions,
    dashboard: () => ({
      enabled: true,
      kpiFields: ["individuals_treated", "coverage_achieved", "implementation_score"],
      statusField: "status_of_mda",
      geoField: "state",
      accent: "#0d9488",
    }),
  },
  {
    key: "sarmaan",
    title: "SARMAAN ACSM Indicator Reporting (SAIRF)",
    subtitle: "All four ACSM category activity forms + indicator dashboard",
    accent: "#0891b2",
    theme: theme("#0891b2", "#22d3ee", "#155e75"),
    sections: sarmaanSections,
    dashboard: () => ({
      enabled: true,
      kpiFields: ["total_reach", "attendance_men", "attendance_women", "community_dialogue_sessions"],
      statusField: "outcome_level",
      geoField: "lga",
      accent: "#0891b2",
    }),
  },
];

export function getPreset(key: string): StudioPreset | undefined {
  return STUDIO_PRESETS.find((p) => p.key === key);
}
