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
