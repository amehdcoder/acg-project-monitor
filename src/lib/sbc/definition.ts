// SBC — Social & Behaviour Change Indicator tracking.
// A code-defined "standard form" (like ACSM / Bloomberg / See Clear) that lives
// permanently in the Standard Forms folder and can be added to any project via
// the "+" / "Add to project" action. Provides a beautiful Indicator Reporting
// Form + a color-graded analytics Dashboard.
//
// Indicator catalogue & wording adapted from IndiKit's Social and Behaviour
// Change (SBC) sector guidance (indikit.net/sector/1010-social-and-behaviour-change).

export const SBC_FORM_NAME = "SBC Indicator Reporting Form";
export const SBC_FORM_DESC =
  "Report data for Social & Behaviour Change indicators — exposure, knowledge, attitudes, norms, self-efficacy, behaviour adoption, targets, achievement, disaggregation, narratives & evidence.";
export const SBC_DASH_NAME = "Social & Behaviour Change Dashboard";
export const SBC_DASH_DESC =
  "Track performance across Social & Behaviour Change indicators — achievement trends, status distribution, top locations & data quality.";

// ---------------- Categories (SBC result areas) ----------------
export const SBC_CATEGORIES = [
  { value: "exposure", label: "Exposure & Comprehension" },
  { value: "knowledge", label: "Knowledge & Skills" },
  { value: "motivation", label: "Motivation & Confidence" },
  { value: "norms", label: "Social Norms & Influence" },
  { value: "barriers", label: "Barriers Reduction" },
  { value: "capacity", label: "Implementation Capacity" },
] as const;
export type SbcCategory = (typeof SBC_CATEGORIES)[number]["value"];

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
  { value: "process", label: "Process" },
];

export const UNITS_OF_MEASURE = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "number_of_people", label: "Number of People" },
  { value: "number_of_events", label: "Number of Events" },
  { value: "number_of_materials", label: "Number of Materials" },
  { value: "number_of_documents", label: "Number of Documents" },
];

export const STAKEHOLDER_TYPES = [
  "Community Members", "Caregivers / Parents", "Adolescents / Youth",
  "Women of Reproductive Age", "Traditional Leaders", "Religious Leaders",
  "Healthcare Workers", "Teachers", "Volunteers / Promoters", "CSOs / NGOs",
];

export const ENGAGEMENT_TYPES = [
  "Interpersonal Communication", "Community Dialogue", "Household Visit",
  "Mass Media Campaign", "Social Media Engagement", "Peer Education",
  "Support Group", "School-Based Activity", "Capacity Building",
];

export const COMMUNICATION_CHANNELS = [
  "Interpersonal Communication", "Community Meetings", "Radio", "Television",
  "Social Media", "Print / IEC Materials", "SMS / Bulk Messaging",
  "Drama / Edutainment", "Town Announcer",
];

export const REACH_TYPES = [
  { value: "direct", label: "Direct Reach" },
  { value: "indirect", label: "Indirect Reach" },
];

export const DATA_SOURCES = [
  "Population-Based Survey", "KAP Survey", "Routine Records", "Attendance Sheet",
  "Activity Report", "Pre/Post Assessment", "Field Observation", "Media Monitoring Log",
];

// ---------------- Indicator catalogue (per category) ----------------
export interface SbcIndicator {
  value: string;
  label: string;
  level: "impact" | "outcome" | "output" | "process";
  unit: string;
  // Indicator reference panel content
  wording: string;
  purpose: string;
  counts: string[];
  excludes: string[];
  frequency: string;
}

export const SBC_INDICATORS: Record<SbcCategory, SbcIndicator[]> = {
  exposure: [
    {
      value: "recall_messages",
      label: "Recall of the Promoted Messages",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who can recall the promoted messages.",
      purpose:
        "Measures whether the audience was exposed to and remembers the campaign's key messages — a prerequisite for any downstream behaviour change.",
      counts: ["Respondents who spontaneously or with prompting recall the messages", "Disaggregated by gender and age"],
      excludes: ["Respondents not exposed to the campaign", "Recall of unrelated messages"],
      frequency: "Per survey round",
    },
    {
      value: "understanding_messages",
      label: "Understanding of the Promoted Messages",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who correctly understand the promoted messages.",
      purpose: "Captures whether the audience comprehends the meaning and intended action of the messages, not just recall.",
      counts: ["Respondents who correctly explain message meaning / action", "Verified by structured questions"],
      excludes: ["Respondents who only recall but misinterpret messages", "Respondents not exposed"],
      frequency: "Per survey round",
    },
    {
      value: "trustworthiness_messages",
      label: "Trustworthiness of SBC Messages",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who consider the SBC messages trustworthy.",
      purpose: "Trust in the source and content strongly influences whether messages translate into behaviour change.",
      counts: ["Respondents rating messages as trustworthy / credible", "Trust in the messenger or channel"],
      excludes: ["Respondents not exposed to messages", "Neutral / no-opinion responses"],
      frequency: "Per survey round",
    },
  ],
  knowledge: [
    {
      value: "improved_knowledge",
      label: "Improved Knowledge & Skills for Behaviour Change",
      level: "output",
      unit: "percentage",
      wording: "Percentage of participants with improved knowledge and skills for the promoted behaviour.",
      purpose: "Tracks knowledge and skill gains needed to enable adoption of the promoted behaviour.",
      counts: ["Participants showing measured knowledge improvement", "Pre/post assessment gains"],
      excludes: ["Attendance without assessment", "Participants not assessed"],
      frequency: "Per activity",
    },
    {
      value: "use_knowledge_skills",
      label: "Use of Provided Knowledge and Skills",
      level: "output",
      unit: "percentage",
      wording: "Percentage of participants applying the provided knowledge and skills in practice.",
      purpose: "Measures practical application of knowledge and skills gained through SBC activities.",
      counts: ["Participants applying skills in real settings", "Verified through follow-up / observation"],
      excludes: ["No evidence of application", "Participants not followed up"],
      frequency: "Quarterly",
    },
  ],
  motivation: [
    {
      value: "self_efficacy",
      label: "Perceived Self-Efficacy",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population confident in their ability to practise the promoted behaviour.",
      purpose: "Self-efficacy — confidence in one's ability to act — is a key driver of behaviour adoption.",
      counts: ["Respondents reporting confidence to perform the behaviour", "Disaggregated by gender and age"],
      excludes: ["Respondents already practising without confidence rating", "No-opinion responses"],
      frequency: "Per survey round",
    },
    {
      value: "action_efficacy",
      label: "Perceived Action Efficacy",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who believe the promoted behaviour will achieve the desired result.",
      purpose: "Captures belief that adopting the behaviour will lead to the intended benefit (response efficacy).",
      counts: ["Respondents who believe the behaviour is effective", "Belief in tangible benefit"],
      excludes: ["Respondents unaware of the behaviour", "Neutral responses"],
      frequency: "Per survey round",
    },
    {
      value: "ease_practice",
      label: "Perceived Ease of Practice",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who perceive the promoted behaviour as easy to practise.",
      purpose: "Perceived ease (low effort / few barriers) increases the likelihood of adoption.",
      counts: ["Respondents rating the behaviour as easy / feasible", "Perceived low effort or cost"],
      excludes: ["Respondents citing major barriers", "No-opinion responses"],
      frequency: "Per survey round",
    },
    {
      value: "favourable_attitude",
      label: "Favourable Attitude",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population with a favourable attitude toward the promoted behaviour.",
      purpose: "Positive attitudes toward the behaviour are a strong predictor of intention and adoption.",
      counts: ["Respondents expressing positive attitudes", "Favourable evaluation of the behaviour"],
      excludes: ["Neutral or negative attitudes", "Respondents unaware of the behaviour"],
      frequency: "Per survey round",
    },
    {
      value: "intention_adopt",
      label: "Intention to Adopt a Behaviour",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who intend to adopt the promoted behaviour.",
      purpose: "Behavioural intention is the most proximal predictor of actual behaviour change.",
      counts: ["Respondents who state intention to adopt", "Stated plan within a defined period"],
      excludes: ["Respondents already practising the behaviour", "Undecided responses"],
      frequency: "Per survey round",
    },
  ],
  norms: [
    {
      value: "social_norms",
      label: "Perceived Social Norms",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who perceive supportive social norms for the behaviour.",
      purpose: "Measures whether people believe the behaviour is common and expected within their reference group.",
      counts: ["Respondents perceiving the behaviour as normal / common", "Perceived peer practice"],
      excludes: ["Respondents perceiving the behaviour as uncommon", "No-opinion responses"],
      frequency: "Per survey round",
    },
    {
      value: "perceived_approval",
      label: "Perceived Approval",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population who perceive that important others approve of the behaviour.",
      purpose: "Perceived approval from influential people (injunctive norms) shapes behaviour adoption.",
      counts: ["Respondents perceiving approval from family / community / leaders", "Perceived social support"],
      excludes: ["Respondents perceiving disapproval", "Neutral responses"],
      frequency: "Per survey round",
    },
  ],
  barriers: [
    {
      value: "barriers_prevalence",
      label: "Prevalence of Barriers to Change",
      level: "outcome",
      unit: "percentage",
      wording: "Percentage of the target population reporting key barriers to practising the promoted behaviour.",
      purpose: "Identifies and tracks reduction of barriers preventing the audience from adopting the behaviour.",
      counts: ["Respondents reporting one or more defined barriers", "Disaggregated by barrier type"],
      excludes: ["Barriers outside the program scope", "Respondents not asked about barriers"],
      frequency: "Per survey round",
    },
  ],
  capacity: [
    {
      value: "capacity_promote",
      label: "Capacity to Promote Behaviours Effectively",
      level: "output",
      unit: "percentage",
      wording: "Percentage of staff / volunteers with adequate capacity to promote behaviours effectively.",
      purpose: "Measures the implementing team's ability to design and deliver effective SBC activities.",
      counts: ["Staff / volunteers meeting capacity benchmarks", "Assessed competency in SBC delivery"],
      excludes: ["Untrained staff", "Staff not assessed"],
      frequency: "Per assessment",
    },
    {
      value: "staff_understanding",
      label: "Staff Understanding of Effective SBC",
      level: "output",
      unit: "percentage",
      wording: "Percentage of staff demonstrating understanding of effective social & behaviour change.",
      purpose: "Captures staff knowledge of SBC principles and good practice underpinning quality programming.",
      counts: ["Staff passing SBC knowledge assessment", "Demonstrated understanding of SBC theory"],
      excludes: ["Staff not assessed", "Attendance without assessment"],
      frequency: "Per assessment",
    },
  ],
};

export const ALL_INDICATORS: SbcIndicator[] = Object.values(SBC_INDICATORS).flat();

export const findIndicator = (value: string): SbcIndicator | undefined =>
  ALL_INDICATORS.find((i) => i.value === value);

// ---------------- Status logic & color grading ----------------
export type SbcStatus = "on_track" | "at_risk" | "behind_target" | "draft_pending";

export const STATUS_META: Record<SbcStatus, { label: string; color: string; bg: string; ring: string }> = {
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
export const statusFromAchievement = (pct: number): SbcStatus => {
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
  SBC_CATEGORIES.find((c) => c.value === v)?.label ?? v;
export const indicatorLevelLabel = (v: string) =>
  INDICATOR_LEVELS.find((c) => c.value === v)?.label ?? v;
export const unitLabel = (v: string) =>
  UNITS_OF_MEASURE.find((c) => c.value === v)?.label ?? v;

/** Format a value according to its unit. */
export const formatByUnit = (value: number, unit: string): string => {
  if (unit === "percentage") return value + "%";
  return value.toLocaleString();
};
