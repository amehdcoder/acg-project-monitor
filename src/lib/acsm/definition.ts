// ACSM — Advocacy, Communication & Social Mobilization Indicator tracking.
// A code-defined "standard form" (like Bloomberg / See Clear / MDA) that lives
// permanently in the Standard Forms folder and can be added to any project via
// the "+" / "Add to project" action. Provides a beautiful Indicator Reporting
// Form + a color-graded analytics Dashboard.
//
// Indicators are structured into the three IndiKit Advocacy thematic areas:
//   1) Results of Advocacy Strategies
//   2) Capacities for Effective Advocacy
//   3) Stakeholders' Engagement in Advocacy
// Indicator wording, purpose, "how to collect & analyse", disaggregations and
// important comments are adapted from IndiKit's Advocacy guidance
// (indikit.net/sector/1012-advocacy).

export const ACSM_FORM_NAME = "ACSM Indicator Reporting Form";
export const ACSM_FORM_DESC =
  "Report data for Advocacy, Communication & Social Mobilization indicators — structured by thematic area, with full indicator guidance, levels, disaggregation, narratives & evidence.";
export const ACSM_DASH_NAME = "Advocacy Dashboard";
export const ACSM_DASH_DESC =
  "Track performance across Advocacy, Communication & Social Mobilization indicators — achievement trends, status distribution, top locations & data quality.";

// ---------------- Thematic areas (categories) ----------------
export const ACSM_CATEGORIES = [
  { value: "results_of_advocacy", label: "Results of Advocacy Strategies", short: "Results", icon: "Target" },
  { value: "capacities_for_advocacy", label: "Capacities for Effective Advocacy", short: "Capacities", icon: "GraduationCap" },
  { value: "stakeholder_engagement", label: "Stakeholders' Engagement in Advocacy", short: "Engagement", icon: "Users" },
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
  { value: "process", label: "Process" },
  { value: "activity", label: "Activity" },
];
export type IndicatorLevelValue = (typeof INDICATOR_LEVELS)[number]["value"];

export const UNITS_OF_MEASURE = [
  { value: "number_of_people", label: "Number of People" },
  { value: "number_of_events", label: "Number of Events" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "number_of_materials", label: "Number of Materials" },
  { value: "amount_ngn", label: "Amount (₦)" },
  { value: "number_of_documents", label: "Number of Documents" },
  { value: "number_of_partnerships", label: "Number of Partnerships" },
  { value: "number_of_engagements", label: "Number of Engagements" },
  { value: "number_of_mentions", label: "Number of Media Mentions" },
];

export const DATA_SOURCES = [
  "Beneficiary Register", "Attendance Sheet", "Activity Report",
  "Media Monitoring Log", "Survey", "Routine Records", "Field Observation",
  "Key Informant Interview", "Meeting Minutes", "Approved Budget Document",
  "Disbursement Record", "Stakeholder Mapping",
];

// ---------------- Disaggregation dimensions ----------------
// Each dimension renders a small set of numeric breakdown inputs in the form.
// `mapsTo` links the dimension to legacy columns so the dashboard keeps working.
export interface DisaggDimension {
  key: string;
  label: string;
  hint?: string;
  buckets: { key: string; label: string }[];
  mapsTo?: "gender" | "age"; // legacy column mapping
}

export const DISAGG_DIMENSIONS: Record<string, DisaggDimension> = {
  gender: {
    key: "gender",
    label: "Gender",
    hint: "Break the value down by gender.",
    mapsTo: "gender",
    buckets: [
      { key: "female", label: "Female" },
      { key: "male", label: "Male" },
      { key: "other", label: "Other / Undisclosed" },
    ],
  },
  age_group: {
    key: "age_group",
    label: "Age Group",
    hint: "Break the value down by age band.",
    mapsTo: "age",
    buckets: [
      { key: "under18", label: "Under 18" },
      { key: "a18_35", label: "18 – 35" },
      { key: "a35plus", label: "35+" },
    ],
  },
  reach_type: {
    key: "reach_type",
    label: "Passive vs Active Reach",
    hint: "Passive = saw a post / read an article. Active = attended, discussed, participated.",
    buckets: [
      { key: "passive", label: "Passive Reach" },
      { key: "active", label: "Active Reach" },
    ],
  },
  media_type: {
    key: "media_type",
    label: "Media Type",
    buckets: [
      { key: "print", label: "Print" },
      { key: "online", label: "Online" },
      { key: "tv", label: "Television" },
      { key: "radio", label: "Radio" },
    ],
  },
  sentiment: {
    key: "sentiment",
    label: "Sentiment",
    hint: "Negative coverage does not constitute a good result.",
    buckets: [
      { key: "positive", label: "Positive" },
      { key: "neutral", label: "Neutral" },
      { key: "negative", label: "Negative" },
    ],
  },
  partnership_status: {
    key: "partnership_status",
    label: "New vs Existing Partnerships",
    buckets: [
      { key: "existing", label: "Existing" },
      { key: "new", label: "New" },
    ],
  },
  partner_type: {
    key: "partner_type",
    label: "Type of Partner",
    buckets: [
      { key: "civil_society", label: "Civil Society" },
      { key: "government", label: "Government" },
      { key: "commercial", label: "Commercial" },
    ],
  },
  engagement_type: {
    key: "engagement_type",
    label: "Type of Engagement",
    buckets: [
      { key: "meeting", label: "Personal Meeting" },
      { key: "email", label: "Email Exchange" },
      { key: "event", label: "Event" },
      { key: "proposal", label: "Policy Proposal" },
      { key: "other", label: "Other" },
    ],
  },
  seniority: {
    key: "seniority",
    label: "Position / Seniority",
    buckets: [
      { key: "senior", label: "Senior" },
      { key: "mid", label: "Mid-level" },
      { key: "junior", label: "Junior" },
    ],
  },
  stakeholder_type: {
    key: "stakeholder_type",
    label: "Type of Stakeholder",
    buckets: [
      { key: "politician", label: "Politician" },
      { key: "institution", label: "Institution" },
      { key: "company", label: "Company" },
      { key: "influencer", label: "Influencer / Public Figure" },
      { key: "scientist", label: "Scientist / Expert" },
    ],
  },
};

// ---------------- Indicator catalogue ----------------
export interface AcsmIndicator {
  value: string;
  label: string;
  level: IndicatorLevelValue; // default / primary level (kept for backwards-compat)
  levels: IndicatorLevelValue[]; // all applicable levels
  unit: string;
  wording: string;
  purpose: string;
  definition: string[]; // "How to collect & analyse the required data" steps
  disaggregations: string[]; // keys into DISAGG_DIMENSIONS
  importantComments: string[];
  frequency: string;
  guidancePending?: boolean; // true until the official IndiKit PDF is integrated
}

export const ACSM_INDICATORS: Record<AcsmCategory, AcsmIndicator[]> = {
  // ============ 1. RESULTS OF ADVOCACY STRATEGIES ============
  results_of_advocacy: [
    {
      value: "people_benefiting",
      label: "People Benefiting",
      level: "impact",
      levels: ["impact"],
      unit: "number_of_people",
      wording: "number of people positively impacted by the results of the project's advocacy initiatives",
      purpose:
        "Gives a realistic estimate of how many people have benefited from the changes achieved by the project's advocacy efforts. Use it only when the team is confident it can reliably quantify the number of people benefiting.",
      definition: [
        "Define which results were achieved by the advocacy initiatives, who is supposed to benefit from them and how, how many people are supposed to benefit, and what evidence supports the claim that they have benefited.",
        "Count the total number of people for whom it is possible to provide at least some evidence that they have benefited (e.g. the population effectively covered by an adopted early-warning system, or farmers reached through a changed product offering verified via sales data).",
        "The number counted in the previous step is the value of this indicator.",
      ],
      disaggregations: ["gender", "age_group"],
      importantComments: [
        "In addition to the number benefiting, also provide qualitative information on how they benefit.",
        "This indicator gives only a rough estimate, which is often too optimistic. For more reliable evidence, survey a representative sample of the people who were supposed to benefit and measure how many gained the desired benefits.",
        "Use this indicator only if you are sure you can reliably quantify the number of people benefiting from the changes achieved.",
        "A proper advocacy strategy should already include an initial assessment of how many people are impacted by the issue, helping estimate the benefits of successful advocacy.",
      ],
      frequency: "Annually",
    },
    {
      value: "adopted_recommendations",
      label: "Adopted Recommendations",
      level: "outcome",
      levels: ["outcome"],
      unit: "number_of_documents",
      wording: "number of recommendations for [target group] that were adopted by relevant decision-makers",
      purpose:
        "Measures how successful the advocacy efforts were in ensuring that recommendations are adopted by relevant decision-makers. Recommendations need not concern high-level policy only — they can address how policies are implemented or services provided at district or regional levels.",
      definition: [
        "Define when a recommendation can be counted as 'adopted' — e.g. specific actions demonstrating the measures are in use; official documents / policies confirming official adoption; allocation of financial / human resources; inclusion in a work plan; or (in some cases) official posts on decision-makers' social media channels.",
        "Use key informant interviews and reviews of relevant documentation to assess whether the criteria were met and why the change happened — proving the project contributed to the change.",
        "Count the number of recommendations that were adopted (per the defined criteria) thanks to the project's advocacy efforts.",
      ],
      disaggregations: [],
      importantComments: [
        "For learning, provide qualitative insights on how the advocacy campaign contributed to the recommendations being adopted.",
        "Ensure the team archives relevant documents that evidence which measures were adopted (e.g. announcements, funding-allocation documents, meeting minutes).",
        "Advocacy is often most effective in coalition — the project does not need to be the only factor that contributed to the change.",
      ],
      frequency: "Quarterly",
    },
    {
      value: "budgetary_commitment",
      label: "Budgetary Commitment",
      level: "outcome",
      levels: ["output", "outcome"],
      unit: "amount_ngn",
      wording: "increased budgetary commitment by [stakeholder] to address the advocated issue",
      purpose:
        "Measures any change to the amount of money budgeted by a given stakeholder (e.g. a local authority or company) to address an issue highlighted by the advocacy efforts.",
      definition: [
        "Conduct interviews with key informants (incl. budget-tracking experts) and review relevant budget documents to identify the budget amount committed to the advocated issue (i) before the advocacy began and (ii) at the end of each reporting period / the campaign. Advocacy campaigns are often multi-annual with interim annual targets (e.g. +60% over three years, +20% per year).",
        "Identify the reasons for the change, focusing on the extent to which the advocacy efforts contributed to it.",
        "Report the indicator's value as the size of the change (in percentage and amount — e.g. year 1 saw a 20% increase, equal to ₦10,000,000). Report an increase only if there is solid evidence the advocacy contributed to it.",
      ],
      disaggregations: [],
      importantComments: [
        "Budget tracking is complex — engage a relevant expert to identify and analyse the data.",
        "Many influences affect budgetary commitments, so gather as much information as possible on the reasons for the observed change.",
        "Budgetary commitment is not the same as budget spent — actual spending is measured by the 'Financial Disbursement' indicator.",
      ],
      frequency: "Quarterly",
    },
    {
      value: "financial_disbursement",
      label: "Financial Disbursement",
      level: "outcome",
      levels: ["outcome"],
      unit: "amount_ngn",
      wording: "increased financial disbursement by [stakeholder] to address the advocated issue",
      purpose:
        "Measures any increase in the amount of money disbursed (e.g. by a local authority / company / other stakeholder) to address a given cause, as a result of the advocacy efforts.",
      definition: [
        "Conduct interviews with key informants (incl. budget-tracking experts) and review relevant budget documents to identify the amount of money disbursed for the advocated issue before and after the advocacy efforts. Campaigns are often multi-annual with interim annual targets.",
        "Identify the reasons for the change, focusing on the extent to which the advocacy initiative contributed to it.",
        "Report the indicator's value as the size of the change (in percentage and amount). Report an increase only if there is solid evidence the advocacy contributed to it.",
      ],
      disaggregations: [],
      importantComments: [
        "Budget tracking is complex — engage a relevant expert to identify and analyse the data.",
        "Many influences affect disbursement, so gather as much information as possible on the reasons for the observed change.",
        "There will be time lags in tracking disbursement — account for these in the monitoring and evaluation plan.",
      ],
      frequency: "Quarterly",
    },
  ],

  // ============ 2. CAPACITIES FOR EFFECTIVE ADVOCACY ============
  capacities_for_advocacy: [
    {
      value: "understanding_advocacy",
      label: "Understanding of Effective Advocacy",
      level: "outcome",
      levels: ["outcome"],
      unit: "percentage",
      wording: "% of participants demonstrating improved understanding of effective advocacy",
      purpose: "Captures knowledge gains from capacity-building and communication activities on advocacy.",
      definition: [
        "Administer a pre- and post-assessment to participants of capacity-building activities.",
        "Define the threshold that constitutes 'improved understanding'.",
        "Calculate the % of participants whose post-assessment shows improvement.",
      ],
      disaggregations: ["gender", "age_group"],
      importantComments: ["Exclude participants who were not assessed."],
      frequency: "Per activity",
      guidancePending: true,
    },
    {
      value: "active_use_advocacy_plan",
      label: "Active Use of Advocacy Plan",
      level: "output",
      levels: ["output", "process"],
      unit: "percentage",
      wording: "% of groups / actors actively using a structured advocacy plan",
      purpose: "Measures adoption and active use of advocacy / mobilization plans by supported groups.",
      definition: [
        "Define what 'actively using' an advocacy plan means.",
        "Review documented plans and verify they are reviewed / updated and acted upon.",
        "Calculate the % of supported groups actively using a plan.",
      ],
      disaggregations: [],
      importantComments: ["Exclude dormant or unused plans."],
      frequency: "Quarterly",
      guidancePending: true,
    },
    {
      value: "use_provided_knowledge",
      label: "Use of Provided Knowledge and Skills",
      level: "output",
      levels: ["output", "outcome"],
      unit: "percentage",
      wording: "% of trained participants applying the provided knowledge and skills",
      purpose: "Tracks practical application of skills gained through capacity-building.",
      definition: [
        "Define what counts as 'applying' the provided knowledge and skills.",
        "Follow up with participants through interviews / observation.",
        "Calculate the % of participants applying skills in practice.",
      ],
      disaggregations: ["gender", "age_group"],
      importantComments: ["Exclude participants who were not followed up."],
      frequency: "Quarterly",
      guidancePending: true,
    },
    {
      value: "media_skills_contacts",
      label: "Media Skills and Contacts",
      level: "output",
      levels: ["output"],
      unit: "number_of_people",
      wording: "number of people equipped with media skills and useful media contacts",
      purpose: "Measures capacity built to use media effectively for advocacy and communication.",
      definition: [
        "Count people trained on media engagement who demonstrate the targeted skills.",
        "Document new, useful media contacts established.",
        "Sum to determine the indicator's value.",
      ],
      disaggregations: ["gender"],
      importantComments: ["Exclude untrained participants and inactive contacts."],
      frequency: "Per activity",
      guidancePending: true,
    },
    {
      value: "advocacy_sharing_sessions",
      label: "Advocacy Sharing and Learning Sessions",
      level: "output",
      levels: ["output", "activity"],
      unit: "number_of_events",
      wording: "number of advocacy sharing and learning sessions held",
      purpose: "Captures how actively the project facilitated peer learning and experience sharing on advocacy.",
      definition: [
        "Define what counts as a 'sharing / learning session'.",
        "Review reports and attendance sheets to count the sessions held.",
      ],
      disaggregations: [],
      importantComments: ["Complement with qualitative notes on topics and lessons learned."],
      frequency: "Monthly",
      guidancePending: true,
    },
    {
      value: "representation_fora",
      label: "Representation in Relevant Fora",
      level: "output",
      levels: ["output", "process"],
      unit: "number_of_events",
      wording: "number of relevant fora in which the project / partners were represented",
      purpose: "Shows the extent to which the project is present in fora where advocacy decisions are influenced.",
      definition: [
        "Define which fora are 'relevant' to the advocacy objectives.",
        "Review records to count the fora in which the project / partners were represented.",
      ],
      disaggregations: [],
      importantComments: ["Note the seniority of representation and any outcomes achieved."],
      frequency: "Quarterly",
      guidancePending: true,
    },
  ],

  // ============ 3. STAKEHOLDERS' ENGAGEMENT IN ADVOCACY ============
  stakeholder_engagement: [
    {
      value: "partnerships_advocacy",
      label: "Partnerships for Advocacy",
      level: "output",
      levels: ["output", "process"],
      unit: "number_of_partnerships",
      wording: "number of existing and new partnerships for implementing advocacy efforts",
      purpose:
        "Indicates how many partnerships an advocacy campaign managed to maintain and establish. Partnerships can be with civil society organisations, government or commercial actors.",
      definition: [
        "Define what can be considered a 'partnership' (to avoid counting largely passive collaboration).",
        "Count official partnerships that existed at the start of the project and were maintained — these are 'existing partnerships'.",
        "Count official partnerships established during the project — these are 'new partnerships'.",
        "Add existing and new partnerships to determine the indicator's value.",
      ],
      disaggregations: ["partnership_status", "partner_type"],
      importantComments: [
        "Supplement with qualitative information on the quality and impact of partnerships and the project's contribution to making them work.",
        "Be clear about the level of ambition for partnerships and revisit / revise it as necessary.",
      ],
      frequency: "Quarterly",
    },
    {
      value: "engagement_decision_makers",
      label: "Engagement with Decision Makers",
      level: "output",
      levels: ["output"],
      unit: "number_of_engagements",
      wording: "number of engagements with relevant decision-makers regarding the advocacy efforts",
      purpose:
        "Shows the extent to which the project team engages with relevant decision-makers who can influence the results of the advocacy efforts.",
      definition: [
        "Define who can be considered 'relevant decision-makers' (e.g. officials, company representatives, service providers). Tools like the Influence Tree or Stakeholder Mapping help identify the most influential people.",
        "Define what counts as an 'engagement' (e.g. personal meetings, email exchanges, events, submission of policy proposals).",
        "Review relevant resources (meeting minutes, reports) and interview team members to assess the number of engagements.",
        "The resulting number is the indicator's value.",
      ],
      disaggregations: ["seniority", "engagement_type"],
      importantComments: [
        "Complement the value with qualitative information on the outcomes of the engagements (insights gained, what was agreed, etc.).",
        "Document every engagement as it happens so it is not forgotten — record each in the project's monitoring system.",
      ],
      frequency: "Monthly",
    },
    {
      value: "engagement_designing",
      label: "Engagement in Designing Advocacy",
      level: "output",
      levels: ["output", "process"],
      unit: "number_of_people",
      wording: "number / % of [target group] actively involved in designing the advocacy actions",
      purpose:
        "Measures the extent to which members of a specific target group had an opportunity to participate in designing the advocacy campaign — important for ensuring the relevance and ownership of activities.",
      definition: [
        "Define what 'actively involved' means — what a person should be doing to be considered actively involved in designing the advocacy efforts.",
        "Use interviews and reviews of relevant documents to assess how many target-group members can be considered 'actively involved'.",
      ],
      disaggregations: ["gender", "age_group"],
      importantComments: [
        "Supplement with qualitative information on how exactly people were involved in the design process and what they contributed.",
      ],
      frequency: "Per activity",
    },
    {
      value: "engagement_implementing",
      label: "Engagement in Implementing Advocacy",
      level: "output",
      levels: ["output", "process"],
      unit: "number_of_people",
      wording: "number / % of [target group] actively involved in implementing the advocacy actions",
      purpose:
        "Shows the extent to which members of a specific target group (e.g. youth) actively participated in implementing the advocacy campaign. Relevant to campaigns that need to engage many people actively.",
      definition: [
        "Define what 'actively involved in implementing advocacy efforts' means.",
        "Use interviews and reviews of relevant documents to assess how many target-group members can be considered 'actively involved'.",
      ],
      disaggregations: ["gender", "age_group"],
      importantComments: [
        "Supplement with qualitative information on how people were involved, what they contributed and with what results.",
      ],
      frequency: "Per activity",
    },
    {
      value: "support_influential_stakeholders",
      label: "Support of Influential Stakeholders",
      level: "outcome",
      levels: ["output", "outcome"],
      unit: "number_of_people",
      wording: "number of influential stakeholders who publicly support the advocacy efforts",
      purpose:
        "Measures the extent to which the advocacy campaign managed to mobilise public support from influential people, institutions or companies.",
      definition: [
        "Determine who can be considered an 'influential stakeholder' (politicians, scientists, artists, social-media influencers, institutions, companies). What matters is that their public support can effectively contribute to the campaign's success.",
        "Define what counts as 'publicly support' — this may differ by stakeholder type (e.g. an influencer vs a politician).",
        "Conduct interviews with project staff and review relevant resources (media outputs, reports, meeting minutes) to count stakeholders who publicly supported the efforts.",
      ],
      disaggregations: ["stakeholder_type"],
      importantComments: [
        "Supplement with qualitative information on how each stakeholder supports the campaign and whether their support led to any result.",
      ],
      frequency: "Quarterly",
    },
    {
      value: "people_reached",
      label: "People Reached",
      level: "output",
      levels: ["output"],
      unit: "number_of_people",
      wording: "number of people reached by the advocacy campaign",
      purpose:
        "Shows the extent to which the advocacy campaign and its key messages reached members of the public. Relevant where reaching a larger number of people is vital for achieving objectives.",
      definition: [
        "Define what can be counted as 'reached' (e.g. social-media users who saw content, or people engaged in a discussion) — depending on the context and focus of the intervention.",
        "Count the total number of people reached using social-media metrics, document reviews (reports, attendance sheets) or other evidence.",
        "Because multiple channels may reach the same people, consider whether it is possible to avoid double counting.",
      ],
      disaggregations: ["gender", "age_group", "reach_type"],
      importantComments: [
        "With multiple channels there is likely overlap (double counting). Acknowledge it and also report reach per individual channel in addition to total reach.",
        "Differentiate passive reach (saw a post / read an article) from active reach (attended a meeting, joined an online discussion).",
        "Report on the responses received from people reached by the campaign.",
      ],
      frequency: "Monthly",
    },
    {
      value: "media_coverage",
      label: "Media Coverage",
      level: "output",
      levels: ["output"],
      unit: "number_of_mentions",
      wording: "number of times a story related to the advocacy efforts is communicated by the media",
      purpose:
        "Shows what media coverage the advocacy campaign achieved. Useful for campaigns where a higher presence in the media is an important part of the strategy.",
      definition: [
        "Use media-monitoring software to scan media content with keywords relevant to your campaign (availability and cost vary by country).",
        "Alternatively, use an online search engine with a combination of keywords (free but likely incomplete).",
        "Where there are few media outlets, keep a manual record of each time a story relating to the advocacy work is communicated, including the media source.",
      ],
      disaggregations: ["media_type", "sentiment"],
      importantComments: [
        "Explore whether monitoring tools report how many people were reached — one big story in a major outlet read by decision-makers can beat many small mentions.",
        "Detailed tracking of media coverage over time gives valuable insight into changing rhetoric, attitudes and arguments.",
        "Investigate whether coverage can be attributed to media-skills training undertaken as part of the strategy.",
      ],
      frequency: "Monthly",
    },
    {
      value: "policy_public_events",
      label: "Policy / Public Events",
      level: "output",
      levels: ["output"],
      unit: "number_of_events",
      wording: "number of planned policy / public events delivered",
      purpose:
        "Reports on the number of policy or public events delivered to achieve advocacy objectives — from discreet meetings with decision-makers (e.g. a roundtable) to mass mobilisation of the public (e.g. a public protest).",
      definition: [
        "Define what can be counted as a 'policy / public event'.",
        "Use key informant interviews and reviews of available resources (e.g. reports) to count how many such events were organised.",
      ],
      disaggregations: [],
      importantComments: [
        "In addition to the count, provide qualitative information on participants, key topics discussed and any immediate outcomes.",
      ],
      frequency: "Monthly",
    },
    {
      value: "papers_published",
      label: "Papers Published and Disseminated",
      level: "output",
      levels: ["output"],
      unit: "number_of_documents",
      wording: "number of papers published and disseminated to key stakeholders",
      purpose:
        "Measures how active an advocacy campaign was in preparing and disseminating papers — such as position papers, policy briefs, case studies, distilled data analyses and research.",
      definition: [
        "Define what counts as a 'paper' (position papers, policy briefs, case studies, distilled data analyses, research findings, etc.).",
        "Define what counts as 'disseminated to key stakeholders' — agree minimum requirements (channels used, people reached).",
        "Use key informant interviews and reviews of relevant resources (e.g. reports) to count papers published and disseminated.",
      ],
      disaggregations: [],
      importantComments: [
        "Complement the value with qualitative information on the topics of the papers, who was reached and what effect the dissemination had.",
      ],
      frequency: "Quarterly",
    },
  ],
};

export const ALL_INDICATORS: AcsmIndicator[] = Object.values(ACSM_INDICATORS).flat();

export const findIndicator = (value: string): AcsmIndicator | undefined =>
  ALL_INDICATORS.find((i) => i.value === value);

export const categoryOfIndicator = (value: string): AcsmCategory | undefined =>
  (Object.keys(ACSM_INDICATORS) as AcsmCategory[]).find((c) =>
    ACSM_INDICATORS[c].some((i) => i.value === value),
  );

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
export const categoryShort = (v: string) =>
  ACSM_CATEGORIES.find((c) => c.value === v)?.short ?? v;
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
