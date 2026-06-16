// ACSM — Advocacy, Communication & Social Mobilization Indicator tracking.
// A code-defined "standard form" (like Bloomberg / See Clear / MDA) that lives
// permanently in the Standard Forms folder and can be added to any project via
// the "+" / "Add to project" action. Provides a beautiful Indicator Reporting
// Form + a color-graded analytics Dashboard.
//
// Indicator catalogue & wording adapted from IndiKit's Advocacy, Communication
// & Social Mobilization (ACSM) sector guidance (indikit.net/sector/1012-advocacy).

export const ACSM_FORM_NAME = "ACSM Indicator Reporting Form";
export const ACSM_FORM_DESC =
  "Report data for Advocacy, Communication & Social Mobilization indicators — targets, achievement, disaggregation, narratives & evidence.";
export const ACSM_DASH_NAME = "Advocacy Dashboard";
export const ACSM_DASH_DESC =
  "Track performance across Advocacy, Communication & Social Mobilization indicators — achievement trends, status distribution, top locations & data quality.";

// ---------------- Categories (ACSM modules) ----------------
export const ACSM_CATEGORIES = [
  { value: "advocacy", label: "Advocacy" },
  { value: "communication", label: "Communication" },
  { value: "social_mobilization", label: "Social Mobilization" },
] as const;
export type AcsmCategory = (typeof ACSM_CATEGORIES)[number]["value"];

export const REPORTING_LEVELS = [
  { value: "national", label: "National" },
  { value: "state", label: "State" },
  { value: "lga", label: "LGA" },
  { value: "ward", label: "Ward" },
  { value: "community", label: "Community" },
  { value: "facility", label: "Facility" },
];

export const INDICATOR_LEVELS = [
  { value: "impact", label: "Impact" },
  { value: "outcome", label: "Outcome" },
  { value: "output", label: "Output" },
  { value: "activity", label: "Activity" },
];

export const UNITS_OF_MEASURE = [
  { value: "number_of_people", label: "Number of People" },
  { value: "number_of_events", label: "Number of Events" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "number_of_materials", label: "Number of Materials" },
  { value: "amount_ngn", label: "Amount (₦)" },
  { value: "number_of_documents", label: "Number of Documents" },
];

export const STAKEHOLDER_TYPES = [
  "Community Members", "Traditional Leaders", "Religious Leaders",
  "Government Officials", "Policymakers / Legislators", "CSOs / NGOs",
  "Media Practitioners", "Healthcare Workers", "Youth Groups", "Women Groups",
];

export const ENGAGEMENT_TYPES = [
  "Community Outreach", "Town Hall / Dialogue", "Advocacy Visit",
  "Media Campaign", "Capacity Building", "Sensitization Meeting",
  "Door-to-Door Mobilization", "Policy Roundtable",
];

export const COMMUNICATION_CHANNELS = [
  "Community Meetings", "Radio", "Television", "Social Media", "Print / IEC Materials",
  "SMS / Bulk Messaging", "Town Announcer", "Interpersonal Communication",
];

export const REACH_TYPES = [
  { value: "direct", label: "Direct Reach" },
  { value: "indirect", label: "Indirect Reach" },
];

export const DATA_SOURCES = [
  "Beneficiary Register", "Attendance Sheet", "Activity Report",
  "Media Monitoring Log", "Survey", "Routine Records", "Field Observation",
];

// ---------------- Indicator catalogue (per category) ----------------
export interface AcsmIndicator {
  value: string;
  label: string;
  level: "impact" | "outcome" | "output" | "activity";
  unit: string;
  // Indicator reference panel content
  wording: string;
  purpose: string;
  counts: string[];
  excludes: string[];
  frequency: string;
}

export const ACSM_INDICATORS: Record<AcsmCategory, AcsmIndicator[]> = {
  advocacy: [
    {
      value: "people_benefiting",
      label: "People Benefiting",
      level: "outcome",
      unit: "number_of_people",
      wording: "Number of people who have benefited from advocacy, communication or social mobilization activities.",
      purpose:
        "Measures the total number of individuals who have directly benefited from ACSM interventions including awareness creation, engagement and capacity building.",
      counts: [
        "Individuals directly reached and benefited",
        "Beneficiaries from ACSM activities",
        "Disaggregated by gender and age (where applicable)",
      ],
      excludes: ["Indirect reach not directly benefiting", "Repeat counts of the same individual"],
      frequency: "Monthly",
    },
    {
      value: "adopted_recommendations",
      label: "Adopted Recommendations",
      level: "outcome",
      unit: "number_of_documents",
      wording: "Number of advocacy recommendations formally adopted by decision-makers or institutions.",
      purpose:
        "Tracks the uptake of advocacy asks into policies, plans, budgets or formal commitments by targeted decision-makers.",
      counts: ["Recommendations formally adopted", "Policy / plan amendments traceable to advocacy"],
      excludes: ["Verbal commitments without documentation", "Recommendations still under review"],
      frequency: "Quarterly",
    },
    {
      value: "budgetary_commitment",
      label: "Budgetary Commitment",
      level: "outcome",
      unit: "amount_ngn",
      wording: "Amount of funds committed in budgets as a result of advocacy efforts.",
      purpose: "Measures the financial resources allocated by governments or institutions following advocacy.",
      counts: ["Funds appropriated in approved budgets", "New budget lines created via advocacy"],
      excludes: ["Disbursed (released) funds — see Financial Disbursement", "Pledges without budget lines"],
      frequency: "Quarterly",
    },
    {
      value: "financial_disbursement",
      label: "Financial Disbursement",
      level: "outcome",
      unit: "amount_ngn",
      wording: "Amount of committed funds actually released and disbursed.",
      purpose: "Tracks whether budgetary commitments translate into released funds for implementation.",
      counts: ["Funds released against committed budget", "Disbursements verified by records"],
      excludes: ["Committed but undisbursed funds", "Funds outside the advocacy scope"],
      frequency: "Quarterly",
    },
  ],
  communication: [
    {
      value: "understanding_advocacy",
      label: "Understanding of Effective Advocacy",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of participants demonstrating improved understanding of effective advocacy.",
      purpose: "Captures knowledge gains from communication and capacity-building activities.",
      counts: ["Participants passing post-tests", "Demonstrated knowledge improvement"],
      excludes: ["Attendance without assessment", "Participants not assessed"],
      frequency: "Per activity",
    },
    {
      value: "media_skills_contacts",
      label: "Media Skills and Contacts",
      level: "output",
      unit: "number_of_people",
      wording: "Number of people equipped with media skills and useful media contacts.",
      purpose: "Measures capacity built to use media effectively for advocacy and communication.",
      counts: ["People trained on media engagement", "New media contacts established"],
      excludes: ["Untrained participants", "Inactive contacts"],
      frequency: "Per activity",
    },
    {
      value: "messages_disseminated",
      label: "Messages Disseminated",
      level: "output",
      unit: "number_of_materials",
      wording: "Number of communication messages / materials disseminated across channels.",
      purpose: "Tracks the volume of communication outputs produced and distributed.",
      counts: ["IEC materials distributed", "Broadcast / social media messages aired"],
      excludes: ["Draft materials not disseminated", "Duplicated counts across channels"],
      frequency: "Monthly",
    },
  ],
  social_mobilization: [
    {
      value: "active_use_advocacy_plan",
      label: "Active Use of Advocacy Plan",
      level: "output",
      unit: "percentage",
      wording: "Percentage of groups actively using a structured advocacy / mobilization plan.",
      purpose: "Measures adoption and active use of mobilization plans by community groups.",
      counts: ["Groups with documented active plans", "Plans reviewed and updated"],
      excludes: ["Groups without plans", "Dormant or unused plans"],
      frequency: "Quarterly",
    },
    {
      value: "use_provided_knowledge",
      label: "Use of Provided Knowledge and Skills",
      level: "output",
      unit: "percentage",
      wording: "Percentage of mobilized participants applying provided knowledge and skills.",
      purpose: "Tracks practical application of skills gained through mobilization efforts.",
      counts: ["Participants applying skills in practice", "Verified behaviour / practice change"],
      excludes: ["No evidence of application", "Participants not followed up"],
      frequency: "Quarterly",
    },
    {
      value: "communities_mobilized",
      label: "Communities Mobilized",
      level: "output",
      unit: "number_of_events",
      wording: "Number of communities mobilized for participation in program activities.",
      purpose: "Measures the breadth of community mobilization achieved.",
      counts: ["Communities with mobilization activities", "Communities with active participation"],
      excludes: ["Communities only sensitized once", "Communities without participation"],
      frequency: "Monthly",
    },
  ],
};

export const ALL_INDICATORS: AcsmIndicator[] = Object.values(ACSM_INDICATORS).flat();

export const findIndicator = (value: string): AcsmIndicator | undefined =>
  ALL_INDICATORS.find((i) => i.value === value);

// ---------------- Status logic & color grading ----------------
export type AcsmStatus = "on_track" | "at_risk" | "behind_target" | "draft_pending";

export const STATUS_META: Record<AcsmStatus, { label: string; color: string; bg: string; ring: string }> = {
  on_track: { label: "On Track", color: "#16a34a", bg: "#dcfce7", ring: "#16a34a" },
  at_risk: { label: "At Risk", color: "#f59e0b", bg: "#fef3c7", ring: "#f59e0b" },
  behind_target: { label: "Behind Target", color: "#dc2626", bg: "#fee2e2", ring: "#dc2626" },
  draft_pending: { label: "Draft / Pending", color: "#3b82f6", bg: "#dbeafe", ring: "#3b82f6" },
};

/** Derive achievement % (0-100+) from target & actual. */
export const computeAchievement = (target: number, actual: number): number => {
  if (!target || target <= 0) return 0;
  return Math.round((actual / target) * 100);
};

/** Derive a status band from achievement %. >=80 On Track, >=50 At Risk, else Behind. */
export const statusFromAchievement = (pct: number): AcsmStatus => {
  if (pct >= 80) return "on_track";
  if (pct >= 50) return "at_risk";
  return "behind_target";
};

/** Color-grade an achievement % for cells / bars / text. */
export const achievementColor = (pct: number): string => {
  if (pct >= 80) return "#16a34a";
  if (pct >= 60) return "#22c55e";
  if (pct >= 50) return "#f59e0b";
  if (pct >= 30) return "#f97316";
  return "#dc2626";
};

export const categoryLabel = (v: string) =>
  ACSM_CATEGORIES.find((c) => c.value === v)?.label ?? v;
export const indicatorLevelLabel = (v: string) =>
  INDICATOR_LEVELS.find((c) => c.value === v)?.label ?? v;
export const unitLabel = (v: string) =>
  UNITS_OF_MEASURE.find((c) => c.value === v)?.label ?? v;

/** Format a value according to its unit. */
export const formatByUnit = (value: number, unit: string): string => {
  if (unit === "amount_ngn") return "₦" + value.toLocaleString();
  if (unit === "percentage") return value + "%";
  return value.toLocaleString();
};
