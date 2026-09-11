// Presets and evaluators for the Longitudinal Beneficiary Record module.

import type { Question } from "@/components/FormBuilder/types";
import type {
  BeneficiaryRow,
  BeneficiaryServiceRow,
  ProgrammeComponent,
  ProgrammeModuleConfig,
  StatusOption,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

const q = (
  name: string,
  label: string,
  type: Question["type"] = "text",
  extra: Partial<Question> = {},
): Question => ({
  id: uid(),
  name,
  label,
  type,
  required: false,
  ...extra,
});

const opts = (values: string[]) =>
  values.map((v) => ({ id: uid(), label: v, value: v }));

export const DEFAULT_STATUSES: StatusOption[] = [
  { value: "active", label: "Active", tone: "success" },
  { value: "on_hold", label: "On hold", tone: "warning" },
  { value: "exited", label: "Exited", tone: "neutral" },
  { value: "completed", label: "Completed", tone: "info" },
  { value: "deceased", label: "Deceased", tone: "danger" },
];

/**
 * Statuses offered in the record's status menu: whatever the module was
 * configured with, plus any of the standard five it does not carry yet, so
 * existing modules gain "Completed" without needing to be re-configured.
 */
export const statusChoices = (configured: StatusOption[] = []): StatusOption[] => {
  const seen = new Set(configured.map((s) => s.value));
  return [...configured, ...DEFAULT_STATUSES.filter((s) => !seen.has(s.value))];
};

export const DEFAULT_RISK: StatusOption[] = [
  { value: "low", label: "Low", tone: "success" },
  { value: "medium", label: "Medium", tone: "warning" },
  { value: "high", label: "High", tone: "danger" },
];

export const DEFAULT_SERVICE_STATUSES: StatusOption[] = [
  { value: "on_track", label: "On track", tone: "success" },
  { value: "due", label: "Due", tone: "warning" },
  { value: "overdue", label: "Overdue", tone: "danger" },
  { value: "not_applicable", label: "Not applicable", tone: "neutral" },
];

export const DEFAULT_REFERRAL_STATUSES: StatusOption[] = [
  { value: "initiated", label: "Initiated", tone: "info" },
  { value: "accepted", label: "Accepted", tone: "warning" },
  { value: "completed", label: "Completed", tone: "success" },
  { value: "declined", label: "Declined", tone: "danger" },
];

/** Icon names are resolved dynamically from lucide-react. */
export const COMPONENT_ICON_CHOICES = [
  "Eye", "Accessibility", "Brain", "Droplets", "Sprout", "Building2", "FileText",
  "HeartPulse", "Stethoscope", "Baby", "Users", "ShieldCheck", "GraduationCap",
  "Home", "Pill", "Activity", "Microscope", "HandHeart",
];

export const COMPONENT_COLOR_CHOICES = [
  "210 90% 45%", "152 55% 40%", "270 60% 52%", "185 70% 38%",
  "28 90% 52%", "218 45% 32%", "340 65% 50%", "45 90% 45%",
];

const component = (
  key: string,
  label: string,
  icon: string,
  color: string,
  order: number,
  services: string[],
): ProgrammeComponent => ({
  key,
  label,
  icon,
  color,
  order,
  services,
  countsTowardsProgress: true,
  questions: [
    q("service_note", "Service note / outcome", "text"),
  ],
});

/** The integrated NTD / eye-health preset shown in the reference design. */
export const CISKULA_PRESET: ProgrammeModuleConfig = {
  version: 1,
  branding: {
    title: "CiSKuLA 2",
    subtitle: "Holistic and Inclusive Health Initiative",
    tagline: "Integrated Care · Dignity · Stronger Communities",
    accent: "210 90% 35%",
    footerNote: "Aligned with WHO Standards · FMoHSW Nigeria · SDGs",
    navItems: [
      "One Person",
      "One Unique Case ID",
      "One Longitudinal Record",
      "Multiple Integrated Services",
    ],
    partnerLogos: [{ name: "World Health Organization" }, { name: "Federal Ministry of Health & Social Welfare" }],
  },
  caseId: { prefix: "CISKULA", includeYear: true, width: 6 },
  components: [
    component("eye_health", "Integrated Eye Health", "Eye", "210 90% 45%", 1, [
      "Visual acuity test", "Glasses provided", "Cataract screening",
    ]),
    component("mmdp_ntd", "MMDP / NTD", "Accessibility", "152 55% 40%", 2, [
      "Limb care assessment (baseline)", "Lymphoedema care outcome",
      "Hydrocoele surgery outcome", "Self-care training",
    ]),
    component("mental_health", "Mental Health & Psychosocial Support", "Brain", "270 60% 52%", 3, [
      "GAD-7 assessment", "PHQ-9 assessment", "Counselling session",
    ]),
    component("wash", "Inclusive WASH", "Droplets", "185 70% 38%", 4, [
      "Latrine verification", "Water access check", "Hygiene promotion",
    ]),
    component("livelihood", "Livelihood & Economic Empowerment", "Sprout", "28 90% 52%", 5, [
      "Poultry input", "Skills training", "Cash grant",
    ]),
    component("health_system", "Health System Strengthening", "Building2", "218 45% 32%", 6, [
      "PHC referral", "Facility supportive supervision",
    ]),
    {
      ...component("documents", "Documents", "FileText", "340 65% 50%", 7, ["Consent form", "Identification"]),
      countsTowardsProgress: false,
      questions: [q("document", "Attach document", "image")],
    },
  ],
  sections: [
    {
      id: uid(),
      label: "Personal & Household Information",
      placement: "personal",
      order: 1,
      questions: [
        q("full_name", "Full Name", "text", { required: true }),
        q("date_of_birth", "Date of Birth", "date"),
        q("gender", "Gender", "select_one", { options: opts(["Male", "Female"]) }),
        q("phone", "Phone Number", "text"),
        q("address", "Address", "text"),
        q("household_size", "Household Size", "number"),
        q("household_head", "Household Head", "select_one", { options: opts(["Yes", "No"]) }),
        q("vulnerability_status", "Vulnerability Status", "select_one", {
          options: choiceOptions(VULNERABILITY_STATUS),
        }),
      ],
    },
    {
      id: uid(),
      label: "Key Clinical & Social Information",
      placement: "clinical",
      order: 2,
      questions: [
        q("primary_condition", "Primary Health Condition", "text"),
        q("disability", "Disability", "select_one", { options: opts(["Yes", "No"]) }),
        q("mental_health_status", "Mental Health Status", "select_one", { options: opts(["Normal", "Mild", "Moderate", "Severe"]) }),
        q("nutrition_status", "Nutrition Status", "select_one", { options: opts(["Good", "Moderate", "Poor"]) }),
        q("education_level", "Education Level", "select_one", { options: opts(["None", "Primary", "Secondary", "Tertiary"]) }),
        q("occupation", "Occupation", "text"),
        q("income_source", "Income Source", "text"),
        q("consent_obtained", "Consent Obtained", "select_one", { options: opts(["Yes", "No"]), required: true }),
      ],
    },
    {
      id: uid(),
      label: "Location",
      placement: "location",
      order: 3,
      questions: [
        q("state", "State", "text"),
        q("lga", "LGA", "text"),
        q("ward", "Ward", "text"),
        q("village", "Village / Community", "text"),
        q("gps", "GPS coordinates", "geopoint"),
      ],
    },
  ],
  workflow: {
    statuses: DEFAULT_STATUSES,
    riskLevels: DEFAULT_RISK,
    serviceStatuses: DEFAULT_SERVICE_STATUSES,
    referralStatuses: DEFAULT_REFERRAL_STATUSES,
    referralReasons: [
      "Eye check-up (cataract screening)",
      "Wound / limb care",
      "Mental health support",
      "Nutrition support",
      "Other",
    ],
    followUpIntervalDays: 30,
  },
  layout: {
    headerFields: ["date_of_birth", "gender", "phone", "village", "lga", "state", "disability"],
    clinicalFields: [
      "primary_condition", "disability", "mental_health_status", "nutrition_status",
      "education_level", "occupation", "income_source", "consent_obtained",
    ],
    quickActions: [
      { key: "add_service", label: "Add New Service", icon: "PlusCircle" },
      { key: "create_referral", label: "Create Referral", icon: "Share2" },
      { key: "schedule_follow_up", label: "Schedule Follow-up", icon: "CalendarClock" },
      { key: "print_report", label: "Print / Export Report", icon: "Printer" },
    ],
    showTimeline: true,
    showReferrals: true,
    showNextFollowUp: true,
    showLocationMap: true,
    showProgressRing: true,
    showDataQuality: true,
  },
  dataQuality: [
    { id: uid(), field: "consent_obtained", label: "Consent not recorded", severity: "critical" },
    { id: uid(), field: "phone", label: "Phone number missing", severity: "warning" },
    { id: uid(), field: "date_of_birth", label: "Date of birth missing", severity: "warning" },
    { id: uid(), field: "gps", label: "GPS location not captured", severity: "warning" },
  ],
};

/** A minimal starting point for any programme, sector or country. */
export const BLANK_PRESET: ProgrammeModuleConfig = {
  version: 1,
  branding: {
    title: "Beneficiary Register",
    subtitle: "Longitudinal case record",
    tagline: "One person · One Case ID · One record",
    accent: "210 90% 35%",
    footerNote: "",
    navItems: ["One Person", "One Unique Case ID", "One Longitudinal Record"],
  },
  caseId: { prefix: "CASE", includeYear: true, width: 6 },
  components: [
    component("service_delivery", "Service Delivery", "HandHeart", "210 90% 45%", 1, ["Service provided"]),
  ],
  sections: [
    {
      id: uid(),
      label: "Beneficiary Information",
      placement: "personal",
      order: 1,
      questions: [
        q("full_name", "Full Name", "text", { required: true }),
        q("date_of_birth", "Date of Birth", "date"),
        q("gender", "Gender", "select_one", { options: opts(["Male", "Female"]) }),
        q("phone", "Phone Number", "text"),
      ],
    },
    {
      id: uid(),
      label: "Location",
      placement: "location",
      order: 2,
      questions: [
        q("state", "State", "text"),
        q("lga", "LGA", "text"),
        q("village", "Village / Community", "text"),
        q("gps", "GPS coordinates", "geopoint"),
      ],
    },
  ],
  workflow: {
    statuses: DEFAULT_STATUSES,
    riskLevels: DEFAULT_RISK,
    serviceStatuses: DEFAULT_SERVICE_STATUSES,
    referralStatuses: DEFAULT_REFERRAL_STATUSES,
    referralReasons: ["Referral", "Other"],
    followUpIntervalDays: 30,
  },
  layout: {
    headerFields: ["date_of_birth", "gender", "phone", "village", "lga", "state"],
    clinicalFields: [],
    quickActions: [
      { key: "add_service", label: "Add New Service", icon: "PlusCircle" },
      { key: "create_referral", label: "Create Referral", icon: "Share2" },
      { key: "schedule_follow_up", label: "Schedule Follow-up", icon: "CalendarClock" },
      { key: "print_report", label: "Print / Export Report", icon: "Printer" },
    ],
    showTimeline: true,
    showReferrals: true,
    showNextFollowUp: true,
    showLocationMap: true,
    showProgressRing: true,
    showDataQuality: true,
  },
  dataQuality: [],
};

export const MODULE_TEMPLATES: { key: string; name: string; description: string; config: ProgrammeModuleConfig }[] = [
  {
    key: "ciskula",
    name: "Comprehensive, Inclusive & Holistic NTD Programme",
    description:
      "Seven integrated components — eye health, MMDP/NTD, mental health, WASH, livelihood, health system and documents — with timeline, referrals and follow-up.",
    config: CISKULA_PRESET,
  },
  {
    key: "blank",
    name: "Blank longitudinal register",
    description: "One component and a short profile. Build up sections, questions and workflow from scratch.",
    config: BLANK_PRESET,
  },
];

/* ------------------------------------------------------------------ */
/* Evaluators                                                          */
/* ------------------------------------------------------------------ */

export const visibleComponents = (config: ProgrammeModuleConfig) =>
  (config.components || [])
    .filter((c) => !c.hidden)
    .sort((a, b) => a.order - b.order);

export const previewCaseId = (config: ProgrammeModuleConfig, seq = 124) => {
  const n = String(seq).padStart(Math.max(1, config.caseId?.width ?? 6), "0");
  const year = new Date().getFullYear();
  return config.caseId?.includeYear
    ? `${config.caseId.prefix}-${year}-${n}`
    : `${config.caseId?.prefix || "CASE"}-${n}`;
};

export interface ProgressResult {
  completed: number;
  total: number;
  percent: number;
  onTrack: boolean;
}

export const computeProgress = (
  config: ProgrammeModuleConfig,
  services: BeneficiaryServiceRow[],
): ProgressResult => {
  const counted = visibleComponents(config).filter((c) => c.countsTowardsProgress !== false);
  const done = new Set(services.map((s) => s.component_key));
  const completed = counted.filter((c) => done.has(c.key)).length;
  const total = counted.length || 1;
  const percent = Math.round((completed / total) * 100);
  return { completed, total: counted.length, percent, onTrack: percent >= 60 };
};

export const latestServiceFor = (
  services: BeneficiaryServiceRow[],
  componentKey: string,
): BeneficiaryServiceRow | undefined =>
  services
    .filter((s) => s.component_key === componentKey)
    .sort((a, b) => (a.service_date < b.service_date ? 1 : -1))[0];

export interface QualityFlag {
  id: string;
  label: string;
  severity: "critical" | "warning";
}

export const evaluateDataQuality = (
  config: ProgrammeModuleConfig,
  beneficiary: Pick<BeneficiaryRow, "profile">,
): QualityFlag[] =>
  (config.dataQuality || []).filter((rule) => {
    const value = (beneficiary.profile || {})[rule.field];
    return value === undefined || value === null || String(value).trim() === "";
  }).map((r) => ({ id: r.id, label: r.label, severity: r.severity }));

export const toneClasses: Record<StatusOption["tone"], string> = {
  success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-primary/10 text-primary border-primary/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export const toneFor = (options: StatusOption[], value?: string | null) =>
  options.find((o) => o.value === value)?.tone ?? "neutral";

export const labelFor = (options: StatusOption[], value?: string | null) =>
  options.find((o) => o.value === value)?.label ?? (value || "—");

export const ageFromDob = (dob?: unknown): string => {
  if (!dob) return "—";
  const d = new Date(String(dob));
  if (Number.isNaN(d.getTime())) return "—";
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} years`;
};

export const normalizeConfig = (raw: unknown): ProgrammeModuleConfig => {
  const cfg = (raw || {}) as Partial<ProgrammeModuleConfig>;
  if (!cfg.components || !cfg.sections) return { ...BLANK_PRESET };
  return {
    version: cfg.version ?? 1,
    branding: { ...BLANK_PRESET.branding, ...(cfg.branding || {}) },
    caseId: { ...BLANK_PRESET.caseId, ...(cfg.caseId || {}) },
    components: cfg.components,
    sections: cfg.sections,
    workflow: { ...BLANK_PRESET.workflow, ...(cfg.workflow || {}) },
    layout: { ...BLANK_PRESET.layout, ...(cfg.layout || {}) },
    dataQuality: cfg.dataQuality || [],
  };
};
