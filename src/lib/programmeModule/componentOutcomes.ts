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

// ============= Component service lifecycle (Complete / Suspend / Exit) =============

export type ServiceLifecycleAction = "completed" | "suspended" | "exited";

export const LIFECYCLE_ACTION_LABEL: Record<ServiceLifecycleAction, string> = {
  completed: "Mark as Completed",
  suspended: "Suspend Service",
  exited: "Exit Service",
};

export const LIFECYCLE_MODAL_TITLE: Record<ServiceLifecycleAction, string> = {
  completed: "Complete Service",
  suspended: "Suspend Service",
  exited: "Exit Service",
};

/** Final outcome choices when a component's service is marked Completed. */
const COMPLETED_OUTCOMES: Record<Kind, string[]> = {
  eye: [
    "Treatment completed — vision restored or improved",
    "Surgery completed successfully",
    "Spectacles dispensed — correction achieved",
    "Specialist care completed after referral",
    "Condition stable — no further treatment needed",
  ],
  mmdp: [
    "Self-care established — condition well managed",
    "Surgery completed successfully",
    "Lymphoedema improved to manageable stage",
    "Treatment course completed",
    "Condition stable — no further intervention needed",
  ],
  mental: [
    "Symptoms resolved or minimal",
    "Treatment completed — stable on medication",
    "Recovered — discharged from follow-up",
    "Specialist care completed after referral",
    "Condition stable — self-management plan in place",
  ],
  wash: [
    "Household adaptation completed",
    "Safe water and sanitation access achieved",
    "Hygiene practices adopted — follow-up complete",
  ],
  livelihood: [
    "Graduated — all pathway stages completed",
    "Business active and generating income",
    "Support package fully delivered",
    "Household self-reliant — exited Graduation pathway",
  ],
  health_system: [
    "Care plan completed",
    "Referral completed — care received",
    "Follow-up complete — no further action needed",
  ],
  generic: [
    "Service completed successfully",
    "Care plan completed",
    "Goal achieved — no further support needed",
  ],
};

/** Final status-at-exit choices when a component's service is Suspended. */
const SUSPENDED_OUTCOMES: Record<Kind, string[]> = {
  eye: [
    "Stable — treatment paused, resumption planned",
    "Awaiting surgery or appointment date",
    "Partial improvement at pause",
    "No improvement at pause",
  ],
  mmdp: [
    "Condition stable at pause",
    "Partial improvement at pause",
    "Condition worsening — urgent resumption needed",
    "Awaiting surgery scheduling",
  ],
  mental: [
    "Stable on current treatment at pause",
    "Partial improvement at pause",
    "Symptoms worsening — urgent resumption needed",
    "Awaiting specialist appointment",
  ],
  wash: ["Adaptation partially completed", "Awaiting materials or construction", "Follow-up still required"],
  livelihood: [
    "Progress on track at pause",
    "Partial progress — support interrupted",
    "Business paused — resumption planned",
  ],
  health_system: ["Care paused — resumption planned", "Awaiting referral outcome", "Partial progress at pause"],
  generic: ["Stable at pause", "Partial progress at pause", "Resumption planned"],
};

/** Final status-at-exit choices when a component's service is Exited/Discontinued. */
const EXITED_OUTCOMES: Record<Kind, string[]> = {
  eye: [
    "Lost to follow-up",
    "Refused further eye care",
    "Referred out — continuing care elsewhere",
    "Condition resolved outside the programme",
    "Deceased",
  ],
  mmdp: [
    "Lost to follow-up",
    "Refused further care",
    "Referred out — continuing care elsewhere",
    "Condition resolved outside the programme",
    "Deceased",
  ],
  mental: [
    "Lost to follow-up",
    "Refused further support",
    "Referred out — continuing care elsewhere",
    "Recovered outside the programme",
    "Deceased",
  ],
  wash: ["Household relocated", "Support no longer needed", "Covered by another programme"],
  livelihood: [
    "Lost to follow-up",
    "Withdrew from the programme",
    "Relocated out of project area",
    "No longer eligible",
    "Deceased",
  ],
  health_system: ["Lost to follow-up", "Referred out — continuing care elsewhere", "Relocated out of project area", "Deceased"],
  generic: ["Lost to follow-up", "Refused further services", "Referred out", "Relocated out of project area", "Deceased"],
};

export const finalOutcomesFor = (
  c: { key: string; label?: string },
  action: ServiceLifecycleAction,
): string[] => {
  const kind = componentKind(c.key, c.label);
  if (action === "completed") return COMPLETED_OUTCOMES[kind];
  if (action === "suspended") return SUSPENDED_OUTCOMES[kind];
  return EXITED_OUTCOMES[kind];
};

/** Reasons offered when suspending a component's service. */
export const SUSPENSION_REASONS = [
  "Beneficiary temporarily unavailable / travelled",
  "Medical reason — treatment paused",
  "Awaiting referral or surgery scheduling",
  "Supply or commodity stock-out",
  "Family or caregiver decision",
  "Other (explain in notes)",
];

/** Reasons offered when exiting/discontinuing a component's service. */
export const EXIT_REASONS = [
  "Lost to follow-up",
  "Refused further services",
  "Referred to another programme or facility",
  "Relocated out of project area",
  "No longer eligible",
  "Deceased",
  "Other (explain in notes)",
];
