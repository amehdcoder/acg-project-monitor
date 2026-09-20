// The clinical content of a case confirmation: what the person complains of,
// what the clinician concludes, and what is actually given or planned.
//
// Kept as plain data so the confirmation form stays a form — a clinician ticks
// what is true, and the record reads like a consultation note afterwards.

export type ClinicalCondition = string;

export interface SymptomItem { key: string; label: string }

/** Presenting complaints, in the words a clinic uses. */
const SYMPTOM_SETS: Record<string, SymptomItem[]> = {
  lymphoedema: [
    { key: "swelling", label: "Swelling of the limb" },
    { key: "pain", label: "Pain or aching in the limb" },
    { key: "heaviness", label: "Heaviness / tightness" },
    { key: "fever_chills", label: "Fever with chills (acute attack)" },
    { key: "skin_warmth", label: "Hot, red, tender skin" },
    { key: "entry_lesions", label: "Wounds, cracks or entry lesions" },
    { key: "foul_odour", label: "Foul smell from the limb" },
    { key: "fluid_oozing", label: "Fluid oozing (lymphorrhoea)" },
    { key: "itching", label: "Itching or fungal infection between toes" },
    { key: "difficulty_walking", label: "Difficulty walking or wearing footwear" },
    { key: "sleep_disturbed", label: "Sleep disturbed by the limb" },
    { key: "work_affected", label: "Cannot do usual work" },
  ],
  hydrocoele: [
    { key: "scrotal_swelling", label: "Scrotal swelling" },
    { key: "heaviness", label: "Dragging / heavy sensation" },
    { key: "pain", label: "Pain or discomfort" },
    { key: "difficulty_walking", label: "Difficulty walking or sitting" },
    { key: "urination_difficulty", label: "Difficulty passing urine" },
    { key: "sexual_difficulty", label: "Difficulty with sexual function" },
    { key: "skin_changes", label: "Skin changes or ulceration over the scrotum" },
    { key: "fever_chills", label: "Fever with chills (acute attack)" },
    { key: "work_affected", label: "Cannot do usual work" },
    { key: "stigma", label: "Avoids public gatherings because of it" },
  ],
};

/** Symptom list for a condition, falling back to the limb-swelling list. */
export const symptomsFor = (condition: ClinicalCondition): SymptomItem[] =>
  SYMPTOM_SETS[condition] || SYMPTOM_SETS.lymphoedema;

export const SYMPTOMS = SYMPTOM_SETS;

export const ONSET_OPTIONS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

export const PROGRESSION_OPTIONS = [
  { value: "worsening", label: "Getting worse" },
  { value: "stable", label: "Unchanged" },
  { value: "fluctuating", label: "Comes and goes" },
  { value: "improving", label: "Improving" },
];

export const SEVERITY_OPTIONS = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

/** Working diagnoses a clinician would reach at this level of care. */
export const DIAGNOSIS_OPTIONS = [
  { value: "lf_lymphoedema", label: "Filarial lymphoedema (LF)" },
  { value: "lf_elephantiasis", label: "Elephantiasis (advanced filarial lymphoedema)" },
  { value: "lf_hydrocoele", label: "Filarial hydrocoele" },
  { value: "adla", label: "Acute dermatolymphangioadenitis (ADLA / acute attack)" },
  { value: "cellulitis", label: "Cellulitis of the limb" },
  { value: "podoconiosis", label: "Podoconiosis (non-filarial lymphoedema)" },
  { value: "inguinal_hernia", label: "Inguinal hernia" },
  { value: "scrotal_mass_other", label: "Other scrotal mass" },
  { value: "venous_oedema", label: "Venous or cardiac oedema" },
  { value: "other", label: "Other diagnosis" },
];

export const CERTAINTY_OPTIONS = [
  { value: "confirmed", label: "Confirmed clinically" },
  { value: "probable", label: "Probable" },
  { value: "possible", label: "Possible — needs review" },
];

export const COMORBIDITIES = [
  { key: "hypertension", label: "Hypertension" },
  { key: "diabetes", label: "Diabetes" },
  { key: "hiv", label: "HIV" },
  { key: "tb", label: "Tuberculosis" },
  { key: "sickle_cell", label: "Sickle cell disease" },
  { key: "mental_health", label: "Mental health condition" },
  { key: "pregnancy", label: "Pregnant or breastfeeding" },
  { key: "other_ntd", label: "Another NTD" },
];

/** What is given today. */
export const TREATMENTS_GIVEN = [
  { key: "hygiene_demo", label: "Washing & limb hygiene demonstration" },
  { key: "self_care_kit", label: "Self-care kit issued (soap, basin, towel)" },
  { key: "antibiotic", label: "Antibiotic for acute attack / entry lesions" },
  { key: "antifungal", label: "Antifungal for interdigital lesions" },
  { key: "analgesic", label: "Pain relief" },
  { key: "antiseptic", label: "Wound cleaning & dressing" },
  { key: "elevation_exercise", label: "Elevation and exercise taught" },
  { key: "footwear", label: "Protective footwear advised or provided" },
  { key: "scrotal_support", label: "Scrotal support advised" },
  { key: "counselling", label: "Counselling on stigma and coping" },
  { key: "mda_medicines", label: "MDA medicines given (IVM / ALB / DEC)" },
];

export const NEXT_STEPS = [
  { value: "self_care", label: "Home self-care with monthly review" },
  { value: "review_facility", label: "Review at this facility" },
  { value: "refer_surgery", label: "Refer for hydrocoelectomy / surgery" },
  { value: "refer_specialist", label: "Refer to a specialist or higher facility" },
  { value: "admit", label: "Admit for acute management" },
  { value: "no_action", label: "No further clinical action needed" },
];

export interface CaseSymptoms {
  items: Record<string, boolean>;
  onset: string;
  progression: string;
  severity: string;
  acute_attacks_last_year: number | null;
  narrative: string;
}

export interface CaseDiagnosis {
  primary: string;
  primary_other: string;
  certainty: string;
  differential: string;
  comorbidities: Record<string, boolean>;
  notes: string;
}

export interface CaseTreatment {
  given: Record<string, boolean>;
  medicines: string;
  self_care_plan: string;
  next_step: string;
  follow_up_date: string;
  counselling_notes: string;
}

export const emptySymptoms = (): CaseSymptoms => ({
  items: {}, onset: "", progression: "", severity: "",
  acute_attacks_last_year: null, narrative: "",
});

export const emptyDiagnosis = (): CaseDiagnosis => ({
  primary: "", primary_other: "", certainty: "confirmed",
  differential: "", comorbidities: {}, notes: "",
});

export const emptyTreatment = (): CaseTreatment => ({
  given: {}, medicines: "", self_care_plan: "", next_step: "",
  follow_up_date: "", counselling_notes: "",
});

const ticked = (m?: Record<string, boolean> | null) =>
  Object.entries(m || {}).filter(([, v]) => v).map(([k]) => k);

export const symptomLabels = (condition: ClinicalCondition, s?: CaseSymptoms | null) =>
  ticked(s?.items).map((k) => symptomsFor(condition).find((x) => x.key === k)?.label || k);

export const treatmentLabels = (t?: CaseTreatment | null) =>
  ticked(t?.given).map((k) => TREATMENTS_GIVEN.find((x) => x.key === k)?.label || k);

export const diagnosisLabel = (d?: CaseDiagnosis | null) => {
  if (!d?.primary) return null;
  if (d.primary === "other") return d.primary_other || "Other diagnosis";
  return DIAGNOSIS_OPTIONS.find((o) => o.value === d.primary)?.label || d.primary;
};

/** One-line consultation summary used on lists and in the case journey. */
export const clinicalSummary = (
  condition: ClinicalCondition,
  s?: CaseSymptoms | null,
  d?: CaseDiagnosis | null,
  t?: CaseTreatment | null,
) => {
  const bits: string[] = [];
  const sym = symptomLabels(condition, s);
  if (sym.length) bits.push(`${sym.length} symptom${sym.length === 1 ? "" : "s"}: ${sym.slice(0, 3).join(", ")}`);
  const dx = diagnosisLabel(d);
  if (dx) bits.push(`Diagnosis: ${dx}`);
  const tx = treatmentLabels(t);
  if (tx.length) bits.push(`Treated: ${tx.slice(0, 3).join(", ")}`);
  return bits.join(" · ");
};

/** Blocks confirmation until the consultation is actually recorded. */
export const validateClinical = (d: CaseDiagnosis): string | null =>
  !d.primary ? "Select the diagnosis you are confirming."
    : d.primary === "other" && !d.primary_other.trim() ? "Write the diagnosis."
      : null;
