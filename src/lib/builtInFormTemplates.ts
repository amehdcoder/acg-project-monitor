// Built-in starter templates.
//
// Exposes the app's flagship forms — Bloomberg School Enrolment Validation,
// Eye Health Facility Monitoring Checklist (SeeClear), GAD-7, PHQ-9 and the
// Integrated MDA Supervisory Checklist — as fully editable Form Builder
// templates. Each is produced in the generic `forms`-table shape (a flat array
// mixing FormGroup + Question objects) so EVERY field, option, logic rule,
// group AND the visual theme (colors / appearance via settings.theme) can be
// freely changed when a user builds a similar form from it.

import type { Question, FormGroup, QuestionOption } from "@/components/FormBuilder/types";
import { buildMdaSupervisoryChecklist } from "@/lib/mdaSupervisoryChecklist";
import { ALL_CLASSES, OPERATIONAL_STATUS, NOT_FOUND_REASONS } from "@/lib/bloomberg/definition";
import { GENERAL_QUESTIONS, HR_QUESTIONS, INFRA_QUESTIONS, EQUIPMENT_ITEMS, EQUIP_STATUS_META } from "@/lib/seeclear/definition";
import { GAD7_DEFINITION, PHQ9_DEFINITION } from "@/lib/standardAssessments/definitions";

export interface BuiltInTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  questions: FormGroup[];
  settings: Record<string, any>;
}

let _seq = 0;
const uid = (p: string) => `${p}_${(++_seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const opt = (label: string, value?: string): QuestionOption => ({ id: uid("o"), label, value: value ?? slug(label) });
const q = (def: Partial<Question> & { type: Question["type"]; label: string; name: string }): Question => ({
  id: uid("q"), required: false, ...def,
});
const group = (label: string, questions: Question[]): FormGroup => ({ id: uid("grp"), name: slug(label), label, questions });

// A default, editable theme so users can recolour / restyle each template.
const theme = (primary: string, accent: string, headerBg: string) => ({
  theme: { primary, accent, headerBg, headerText: "#ffffff", cardBg: "#ffffff", radius: "0.75rem", font: "Inter" },
});

const YES_NO = () => [opt("Yes", "yes"), opt("No", "no")];

// ---------------- Bloomberg School Enrolment Validation ----------------
function buildBloombergTemplate(): BuiltInTemplate {
  const groups: FormGroup[] = [
    group("School Identification", [
      q({ type: "select_one", name: "state", label: "State", required: true, options: [], choice: { searchable: true } as any }),
      q({ type: "text", name: "lga", label: "LGA", required: true }),
      q({ type: "text", name: "ward", label: "Ward", required: true }),
      q({ type: "text", name: "community", label: "Community / Location", required: true }),
      q({ type: "text", name: "school_name", label: "School Name", required: true }),
      q({ type: "text", name: "school_code", label: "School Code" }),
      q({ type: "geopoint", name: "gps", label: "GPS Location", required: true, geo: { minAccuracyMeters: 50 } as any }),
    ]),
    group("Verification", [
      q({ type: "select_one", name: "school_exists", label: "Does the school exist at this location?", required: true, options: YES_NO() }),
      q({ type: "select_one", name: "not_found_reason", label: "If not found, reason", relevant: "${school_exists} = 'no'", options: NOT_FOUND_REASONS.map((r) => opt(r.label, r.value)) }),
      q({ type: "select_one", name: "operational_status", label: "Operational status", relevant: "${school_exists} = 'yes'", options: OPERATIONAL_STATUS.map((r) => opt(r.label, r.value)) }),
      q({ type: "text", name: "head_teacher", label: "Head teacher name", relevant: "${school_exists} = 'yes'" }),
      q({ type: "text", name: "head_phone", label: "Head teacher phone", relevant: "${school_exists} = 'yes'", text: { mask: "phone" } as any }),
      q({ type: "date", name: "date_of_visit", label: "Date of visit", required: true }),
    ]),
    group("Enrolment Counts", ALL_CLASSES.flatMap((c) => [
      q({ type: "number", name: `${c.key}_male`, label: `${c.label} — Boys`, validation: { min: 0 }, number: { kind: "integer" } as any }),
      q({ type: "number", name: `${c.key}_female`, label: `${c.label} — Girls`, validation: { min: 0 }, number: { kind: "integer" } as any }),
    ])),
    group("Evidence", [
      q({ type: "image", name: "signboard", label: "School signboard photo", required: true, media: { cameraOnly: true } as any }),
      q({ type: "image", name: "classroom", label: "Classroom photo", required: true, media: { cameraOnly: true } as any }),
      q({ type: "image", name: "register", label: "Enrolment register photo", required: true, media: { cameraOnly: true } as any }),
    ]),
  ];
  return {
    key: "tpl_bloomberg",
    name: "Bloomberg School Enrolment Validation (Template)",
    description: "Editable copy of the Bloomberg School Enrolment Validation form. Customise fields, logic, classes and colors.",
    category: "education",
    questions: groups,
    settings: { offlineEnabled: true, requireLocation: true, autoSave: true, ...theme("#0c2340", "#2563eb", "#0c2340") },
  };
}

// ---------------- Eye Health Facility Monitoring Checklist ----------------
function buildSeeClearTemplate(): BuiltInTemplate {
  const yn = (items: { key: string; label: string }[]) =>
    items.map((i) => q({ type: "select_one", name: i.key, label: i.label, options: YES_NO() }));
  const equipOptions = (Object.keys(EQUIP_STATUS_META) as (keyof typeof EQUIP_STATUS_META)[]).map((k) =>
    opt(EQUIP_STATUS_META[k].label, k as string));
  const groups: FormGroup[] = [
    group("Facility Identification", [
      q({ type: "date", name: "date_of_visit", label: "Date of visit", required: true }),
      q({ type: "text", name: "state", label: "State", required: true }),
      q({ type: "text", name: "lga", label: "LGA", required: true }),
      q({ type: "text", name: "facility_name", label: "Facility name", required: true }),
      q({ type: "select_one", name: "facility_level", label: "Facility level", options: [opt("Primary (PHC)", "primary"), opt("Secondary", "secondary"), opt("Tertiary", "tertiary")] }),
      q({ type: "select_one", name: "ownership", label: "Ownership", options: [opt("Government", "government"), opt("Private", "private")] }),
      q({ type: "geopoint", name: "gps", label: "GPS Location", geo: { minAccuracyMeters: 50 } as any }),
    ]),
    group("General Assessment", yn(GENERAL_QUESTIONS)),
    group("Human Resources", yn(HR_QUESTIONS)),
    group("Infrastructure & Utilities", yn(INFRA_QUESTIONS)),
    group("Equipment & Medical Supplies", EQUIPMENT_ITEMS.map((e) =>
      q({ type: "select_one", name: e.key, label: e.label, options: equipOptions }))),
    group("Evidence", [
      q({ type: "image", name: "facility_photo", label: "Facility photo", media: { cameraOnly: true } as any }),
      q({ type: "image", name: "equipment_photo", label: "Equipment photo", media: { cameraOnly: true } as any }),
    ]),
  ];
  return {
    key: "tpl_seeclear",
    name: "Eye Health Facility Monitoring Checklist (Template)",
    description: "Editable copy of the See Clear Eye Health Facility Monitoring Checklist. Customise questions, equipment list, scoring and colors.",
    category: "health",
    questions: groups,
    settings: { offlineEnabled: true, requireLocation: true, autoSave: true, ...theme("#0e7490", "#14b8a6", "#0e7490") },
  };
}

// ---------------- Standard assessments (GAD-7 / PHQ-9) ----------------
function buildAssessmentTemplate(def: typeof GAD7_DEFINITION, key: string, primary: string, accent: string): BuiltInTemplate {
  const toQ = (it: any) =>
    q({
      type: it.type === "select_one" ? "select_one" : "text",
      name: it.id,
      label: it.label,
      required: !!it.required,
      options: (it.options || []).map((o: any) => opt(o.label, o.value)),
    });
  const groups: FormGroup[] = [
    group("Symptoms (Past 2 weeks)", def.items.map(toQ)),
    group("Functional Impact", (def.closing || []).map(toQ)),
  ];
  return {
    key,
    name: `${def.name} (Template)`,
    description: `Editable copy of the ${def.shortName} assessment. Customise items, scoring options and colors.`,
    category: "health",
    questions: groups,
    settings: { offlineEnabled: true, autoSave: true, ...theme(primary, accent, primary) },
  };
}

// ---------------- MDA Supervisory Checklist ----------------
function buildMdaTemplate(): BuiltInTemplate {
  const base = buildMdaSupervisoryChecklist();
  return {
    key: "tpl_mda",
    name: `${base.name} (Template)`,
    description: "Editable copy of the Integrated MDA Supervisory Checklist. Customise all 12 sections, scoring and colors.",
    category: "health",
    questions: base.questions,
    settings: { ...base.settings, ...theme("#166534", "#22c55e", "#166534") },
  };
}

/** Build all built-in starter templates. */
export function buildBuiltInTemplates(): BuiltInTemplate[] {
  _seq = 0;
  return [
    buildBloombergTemplate(),
    buildSeeClearTemplate(),
    buildAssessmentTemplate(GAD7_DEFINITION, "tpl_gad7", "#7c3aed", "#a855f7"),
    buildAssessmentTemplate(PHQ9_DEFINITION, "tpl_phq9", "#be185d", "#ec4899"),
    buildMdaTemplate(),
  ];
}
