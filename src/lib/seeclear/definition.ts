// See Clear — Plateau Comprehensive and Inclusive Eye Health Project.
// "Monitoring & Supervision Checklist" + "Eye Health Facility Monitoring Dashboard".
// Code-defined "standard form" so it lives permanently in the Standard Forms
// folder and can be added to any project (like the MDA & Bloomberg tools).

export const SEECLEAR_FORM_NAME = "Eye Health Facility Monitoring Checklist";
export const SEECLEAR_FORM_DESC =
  "Monitoring, Evaluation & Learning checklist — facility profile, readiness assessment, evidence & sign-off.";
export const SEECLEAR_DASH_NAME = "Eye Health Facility Monitoring Dashboard";
export const SEECLEAR_DASH_DESC =
  "Facility readiness, equipment, referrals, data quality analytics, map & flagged gaps (admin only).";

export const FACILITY_LEVELS = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "tertiary", label: "Tertiary" },
];

export const OWNERSHIP_TYPES = [
  { value: "government", label: "Government" },
  { value: "private", label: "Private" },
  { value: "faith_based", label: "Faith-based / Missionary" },
  { value: "other", label: "Other" },
];

/** Human label for an ownership value (falls back to the raw value). */
export const ownershipLabel = (value?: string | null) =>
  OWNERSHIP_TYPES.find((o) => o.value === value)?.label || (value || "—");

export const FUNCTIONAL_STATUS = [
  { value: "fully", label: "Fully Functional" },
  { value: "partially", label: "Partially Functional" },
  { value: "not", label: "Not Functional" },
];

// ---------- Section 1: General Facility Assessment (max 6) ----------
// Each question scores 1 when answered the "positive"/expected way.
export interface YesNoQ {
  key: string;
  label: string;
  // The answer that earns a point ("yes" means yes is good; "no" means no is good).
  good: "yes" | "no";
}

export const GENERAL_QUESTIONS: YesNoQ[] = [
  { key: "functional", label: "Facility is functional", good: "yes" },
  { key: "hr_gaps", label: "Any gaps in human resources?", good: "no" },
  { key: "supplies", label: "Essential eye health medical supplies available?", good: "yes" },
  { key: "challenges", label: "Challenges in service delivery?", good: "no" },
  { key: "iec", label: "Project IEC materials visible?", good: "yes" },
  { key: "records", label: "Records & registers properly kept?", good: "yes" },
];

// ---------- Section 2: Human Resources (max 10) ----------
export const HR_QUESTIONS: YesNoQ[] = [
  { key: "hr_ophthal", label: "Ophthalmic personnel available", good: "yes" },
  { key: "hr_nurse", label: "Eye-trained nurse / CHEW available", good: "yes" },
  { key: "hr_trained", label: "Staff trained on project protocols", good: "yes" },
  { key: "hr_roster", label: "Duty roster displayed", good: "yes" },
  { key: "hr_supervision", label: "Regular supportive supervision conducted", good: "yes" },
  { key: "hr_attendance", label: "Staff attendance register maintained", good: "yes" },
  { key: "hr_jobaids", label: "Job aids / SOPs available", good: "yes" },
  { key: "hr_motivation", label: "Staff motivation / retention adequate", good: "yes" },
  { key: "hr_capacity", label: "Capacity-building plan in place", good: "yes" },
  { key: "hr_gaps_filled", label: "Identified HR gaps being addressed", good: "yes" },
];

// ---------- Section 3: Infrastructure & Utilities (max 10) ----------
export const INFRA_QUESTIONS: YesNoQ[] = [
  { key: "in_room", label: "Dedicated eye clinic room available", good: "yes" },
  { key: "in_power", label: "Reliable power supply", good: "yes" },
  { key: "in_water", label: "Clean water source available", good: "yes" },
  { key: "in_light", label: "Adequate lighting for examination", good: "yes" },
  { key: "in_waiting", label: "Patient waiting area available", good: "yes" },
  { key: "in_toilet", label: "Functional toilet facilities", good: "yes" },
  { key: "in_signage", label: "Facility signage / directions visible", good: "yes" },
  { key: "in_access", label: "Disability-friendly access", good: "yes" },
  { key: "in_storage", label: "Secure storage for supplies", good: "yes" },
  { key: "in_clean", label: "Clean & hygienic environment", good: "yes" },
];

// ---------- Section 4: Equipment & Medical Supplies ----------
// Status: 0 = Not Available, 1 = Available but Not Functional, 2 = Available & Functional, -1 = N/A.
export type EquipStatus = "func" | "nonfunc" | "unavailable" | "na";

export const EQUIP_STATUS_META: Record<EquipStatus, { label: string; score: number; color: string; symbol: string }> = {
  func: { label: "Available & Functional", score: 2, color: "#16a34a", symbol: "✓" },
  nonfunc: { label: "Available but Not Functional", score: 1, color: "#f59e0b", symbol: "▲" },
  unavailable: { label: "Not Available", score: 0, color: "#dc2626", symbol: "✕" },
  na: { label: "Not Applicable", score: 0, color: "#94a3b8", symbol: "—" },
};

export interface EquipItem {
  key: string;
  label: string;
  group: "basic" | "advanced";
}

export const EQUIPMENT_ITEMS: EquipItem[] = [
  { key: "va_chart", label: "Visual Acuity Chart (3m)", group: "basic" },
  { key: "torchlight", label: "Torchlight", group: "basic" },
  { key: "spectacles", label: "Sample Spectacles", group: "basic" },
  { key: "eye_drops", label: "Eye Drops", group: "basic" },
  { key: "occluder", label: "Occluder", group: "basic" },
  { key: "slit_lamp", label: "Slit Lamp", group: "advanced" },
  { key: "ophthalmoscope", label: "Ophthalmoscope", group: "advanced" },
  { key: "autorefractor", label: "Autorefractor", group: "advanced" },
  { key: "tonometer", label: "Tonometer", group: "advanced" },
  { key: "operating_microscope", label: "Operating Microscope", group: "advanced" },
  { key: "surgical_unit", label: "Surgical Unit (Basic)", group: "advanced" },
];

// Suggested chips
export const CHALLENGE_OPTIONS = [
  "Staff shortage",
  "Stock-out of eye drops",
  "Referral delays",
  "Non-functional equipment",
  "Poor record keeping",
  "Infrastructure issues",
];

export const RECOMMENDATION_OPTIONS = [
  "Recruit more eye care staff",
  "Improve drugs supply",
  "Strengthen referrals",
  "IEC visibility",
  "Repair / replace equipment",
  "Train staff on record keeping",
];

export const EVIDENCE_SLOTS = [
  { slot: "front", label: "Facility Front View / Signboard", required: true },
  { slot: "clinic", label: "Eye Clinic Room", required: true },
  { slot: "equipment", label: "Equipment (Slit Lamp)", required: false },
  { slot: "register", label: "Register / Records", required: true },
];

// ---------- Scoring helpers ----------
export type YesNoAnswers = Record<string, "yes" | "no" | "">;
export type EquipAnswers = Record<string, EquipStatus>;

export const scoreYesNo = (qs: YesNoQ[], answers: YesNoAnswers) => {
  let score = 0;
  qs.forEach((q) => {
    if (answers[q.key] && answers[q.key] === q.good) score += 1;
  });
  return { score, max: qs.length };
};

export const scoreEquipment = (answers: EquipAnswers) => {
  let score = 0;
  let max = 0;
  EQUIPMENT_ITEMS.forEach((it) => {
    const st = answers[it.key];
    if (!st || st === "na") return;
    max += 2;
    score += EQUIP_STATUS_META[st]?.score ?? 0;
  });
  return { score, max };
};

export interface ScoreBreakdown {
  general: { score: number; max: number };
  hr: { score: number; max: number };
  infra: { score: number; max: number };
  equip: { score: number; max: number };
  overallPct: number;
}

export const computeScores = (
  general: YesNoAnswers,
  hr: YesNoAnswers,
  infra: YesNoAnswers,
  equip: EquipAnswers,
): ScoreBreakdown => {
  const g = scoreYesNo(GENERAL_QUESTIONS, general);
  const h = scoreYesNo(HR_QUESTIONS, hr);
  const i = scoreYesNo(INFRA_QUESTIONS, infra);
  const e = scoreEquipment(equip);
  const totMax = g.max + h.max + i.max + e.max;
  const totScore = g.score + h.score + i.score + e.score;
  const overallPct = totMax > 0 ? Math.round((totScore / totMax) * 100) : 0;
  return { general: g, hr: h, infra: i, equip: e, overallPct };
};

export const readinessBand = (pct: number) => {
  if (pct >= 80) return { label: "Good", color: "#16a34a" };
  if (pct >= 60) return { label: "Fair", color: "#f59e0b" };
  if (pct >= 40) return { label: "Poor", color: "#f97316" };
  return { label: "Critical", color: "#dc2626" };
};
