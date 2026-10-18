// Component-specific services and result/outcome choices for "Record a service".

type Kind = "eye" | "mmdp" | "mental" | "wash" | "livelihood" | "health_system" | "generic";

export const componentKind = (key: string, label = ""): Kind => {
  const s = `${key} ${label}`.toLowerCase();
  if (/eye|vision|ophthal/.test(s)) return "eye";
  if (/mmdp|ntd|lymph|hydroc/.test(s)) return "mmdp";
  if (/mental|psych|mhpss|mhgap/.test(s)) return "mental";
  if (/wash|water|sanitation|hygiene/.test(s)) return "wash";
  if (/livelihood|economic|empower/.test(s)) return "livelihood";
  if (/health_system|system|facility/.test(s)) return "health_system";
  return "generic";
};

/** Priority Graduation Approach services, in programme delivery order. */
export const PRIORITY_LIVELIHOOD_SERVICES = [
  "Beneficiary mapping, verification & Graduation pathway planning",
  "Participant orientation: Graduation Approach, rights & safeguarding",
  "Life skills, social empowerment, inclusion & safeguarding (PSEA)",
  "Skills acquisition training",
  "Financial literacy training",
  "Financial literacy & entrepreneurship refresher",
  "Monthly cash transfer (time-bound social protection)",
  "Quarterly enterprise coaching, mentoring & business support",
  "Start-up grants",
  "Savings group (VSLA) enrolment",
  "Market linkages: suppliers, aggregators & buyers",
];

/** Additional standard services offered per component kind. */
export const KIND_SERVICES: Record<Kind, string[]> = {
  eye: [
    "Visual acuity test", "Refraction", "Glasses provided", "Cataract screening",
    "Cataract surgery", "Trachoma screening", "Trichiasis (TT) surgery",
    "Glaucoma screening", "Low-vision assessment", "Eye health education",
  ],
  mmdp: [
    "Lymphoedema case confirmation", "Hydrocoele case confirmation", "TT case confirmation",
    "Onchocercal skin disease confirmation",
    "Limb care assessment (baseline)", "Lymphoedema care outcome", "Hydrocoele surgery outcome",
    "Trichiasis (TT) surgery", "Self-care training", "Acute attack (ADLA) management", "Hydrocoele screening",
    "Self-care kit provided", "Wound care", "Onchocerciasis skin assessment",
    "MDA: Ivermectin", "MDA: Ivermectin + Albendazole", "MDA: Albendazole", "MDA: Praziquantel",
    "MDA: Azithromycin / Tetracycline eye ointment", "MDA: Mebendazole",
    "Adverse event follow-up", "NTD morbidity counselling",
  ],
  mental: [
    "GAD-7 assessment", "PHQ-9 assessment", "Counselling session",
    "mhGAP clinical review", "Psychoeducation", "Medication review",
    "Peer support group", "Family / caregiver session", "Suicide risk assessment",
    "Specialist psychiatric referral",
  ],
  wash: [
    "Latrine verification", "Water access check", "Hygiene promotion",
    "Accessible latrine adaptation", "Handwashing station provided",
    "Water point functionality check", "Menstrual hygiene support", "Household water treatment",
  ],
  livelihood: [
    ...PRIORITY_LIVELIHOOD_SERVICES,
    "Vulnerability assessment", "Poultry input", "Business monitoring visit",
  ],
  health_system: [
    "PHC referral", "Referral follow-up", "Home visit (LTFU tracing)", "Facility supportive supervision",
    "Health worker training", "Commodity / drug supply check", "Data quality review", "Facility accessibility audit",
  ],
  generic: [],
};

/** Result / outcome choices relevant to each component kind. */
export const KIND_OUTCOMES: Record<Kind, string[]> = {
  eye: [
    "Normal vision (6/6–6/12)", "Visual impairment (worse than 6/12)", "Severe impairment / blind (worse than 6/60)",
    "Vision improved", "Vision unchanged", "Spectacles dispensed", "Cataract detected — referred",
    "Surgery successful", "Post-operative complication", "TT detected — referred", "No eye condition found",
  ],
  mmdp: [
    "Case confirmed", "Case not confirmed",
    "Lymphoedema stage 1–3 (early)", "Lymphoedema stage 4–7 (advanced)",
    "Lymphoedema stage improved", "Lymphoedema stable", "Lymphoedema worsened",
    "No acute attack since last visit", "Acute attack treated", "Self-care practised correctly",
    "Self-care not practised", "Hydrocoele confirmed — referred for surgery", "Hydrocoelectomy successful",
    "TT surgery completed", "Post-surgical complication", "Wound healed", "Wound not healed",
    "Treated — drug swallowed", "Absent", "Refused", "Not eligible (age / pregnancy / illness)",
    "Adverse event reported", "Serious adverse event (SAE) reported",
  ],
  mental: [
    "Minimal symptoms", "Mild symptoms", "Moderate symptoms", "Moderately severe symptoms", "Severe symptoms",
    "Symptoms improved", "Symptoms unchanged", "Symptoms worsened", "Adherent to medication",
    "Not adherent to medication", "Suicide risk identified — urgent action", "Referred to specialist",
  ],
  wash: [
    "Accessible latrine in use", "Latrine not accessible", "Safe water available", "No safe water access",
    "Water point functional", "Water point non-functional", "Handwashing practised", "Hygiene practices improved",
    "Adaptation completed", "Follow-up needed",
  ],
  livelihood: [
    "High priority (most vulnerable)", "Medium priority", "Low priority", "Approved for support",
    "Eligible — verified", "Not eligible", "Input received", "Training completed", "Training not completed",
    "Business started", "Business active / generating income", "Business not active",
    "Income increased", "Joined savings group", "Grant received",
  ],
  health_system: [
    "Referral completed", "Referral pending", "Beneficiary found at home", "Beneficiary not found",
    "Supervision done — action points agreed",
    "Gaps identified", "Stock adequate", "Stock-out found", "Training completed", "Data quality acceptable",
    "Data quality issues found",
  ],
  generic: ["Completed", "Partially completed", "Not completed", "Referred", "Follow-up needed"],
};

const mergeUnique = (a: string[], b: string[]) => {
  const seen = new Set(a.map((s) => s.toLowerCase()));
  return [...a, ...b.filter((s) => !seen.has(s.toLowerCase()))];
};

export const servicesForComponent = (c: { key: string; label?: string; services?: string[] }) => {
  const kind = componentKind(c.key, c.label);
  const services = mergeUnique(c.services || [], KIND_SERVICES[kind]);
  // Priority services must precede even the project's configured options.
  return kind === "livelihood"
    ? mergeUnique(PRIORITY_LIVELIHOOD_SERVICES, services)
    : services;
};

export const outcomesForComponent = (c: { key: string; label?: string }) =>
  KIND_OUTCOMES[componentKind(c.key, c.label)];
