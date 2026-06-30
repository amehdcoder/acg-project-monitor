// LGA ACSM Focal Person — Independent Activity Tracker / Indicator Reporting Form (IRF)
//
// A code-defined "standard form" (like ACSM / SBC / Bloomberg) that lives in the
// SARMAAN project. It provides a beautiful, sectioned Indicator Reporting Form
// for LGA ACSM Focal Persons and a real-time analytics Dashboard wired to the
// `irf_reports` table. Indicators are taken from the Independent Activity Tracker.

export const IRF_FORM_NAME = "SARMAAN ACSM Indicator Reporting Form (SAIRF)";
export const IRF_FORM_DESC =
  "SARMAAN ACSM activity reporting — advocacy, social mobilization, awareness creation & non-compliance resolution indicators with evidence (MOV) and informed consent.";
export const IRF_DASH_NAME = "SARMAAN ACSM Indicator Tracking Dashboard";
export const IRF_DASH_DESC =
  "Executive analytics for the SARMAAN ACSM Indicator Reporting Form (SAIRF) — advocacy reach, social mobilization, awareness creation, non-compliance resolution, statistical insights, narrative analysis, evidence library, trends & data quality.";

export const PARTICIPATION_LEVELS = ["High", "Medium", "Low"] as const;

export type IrfFieldType = "number" | "text" | "longtext" | "select" | "boolean" | "date";

export interface IrfField {
  key: string; // column key in irf_reports
  label: string;
  what?: string; // "what to record" helper
  type: IrfFieldType;
  options?: readonly string[];
  /** When true, a select adds an "Other (specify)" choice with a free-text box. */
  allowOther?: boolean;
  /** When true, the field must be answered before the section/form can proceed. */
  required?: boolean;
  example?: string;
  /** Numeric fields that should roll up into dashboard totals. */
  metric?: boolean;
}

/** Sentinel value used for the "Other (specify)" option in selects. */
export const OTHER_OPTION = "Other (specify)";

export interface IrfSection {
  id: string;
  title: string;
  short: string;
  icon: string; // lucide icon name
  color: string; // hex accent
  groups: { activity: string; fields: IrfField[] }[];
}

export const IRF_SECTIONS: IrfSection[] = [
  {
    id: "advocacy_stakeholders",
    title: "Advocacy to Stakeholders",
    short: "Stakeholder Advocacy",
    icon: "Landmark",
    color: "#0891b2",
    groups: [
      {
        activity: "MDAs Visited",
        fields: [
          { key: "mdas_visited_count", label: "Number of MDA visits", what: "Count of Ministries, Departments, Agencies visited", type: "number", metric: true, example: "3" },
          { key: "mdas_names", label: "Names of MDAs", what: "List of MDAs engaged", type: "text" },
        ],
      },
      {
        activity: "State Level Advocacy",
        fields: [
          { key: "state_advocacy_meetings", label: "Meetings held (state level)", what: "Number of advocacy visits at state level", type: "number", metric: true },
          { key: "state_advocacy_outcomes", label: "Key outcomes", what: "Decisions, commitments made", type: "longtext" },
        ],
      },
      {
        activity: "Emirate Council",
        fields: [
          { key: "emirate_council_meetings", label: "Emirate Council meetings", what: "Number of Emirate Council engagements", type: "number", metric: true },
          { key: "emirate_council_support", label: "Support received", what: "Type of endorsement / support", type: "longtext" },
        ],
      },
    ],
  },
  {
    id: "lga_advocacy",
    title: "LGA Level Advocacy",
    short: "LGA Advocacy",
    icon: "Users",
    color: "#7c3aed",
    groups: [
      {
        activity: "Policy Makers",
        fields: [
          { key: "policy_makers_engaged", label: "Policy makers engaged", what: "Count of policy makers reached", type: "number", metric: true, example: "5" },
          { key: "policy_makers_names", label: "Names / designations", what: "Titles of officials (e.g. LGA Chairman)", type: "text" },
        ],
      },
      {
        activity: "Traditional Leaders",
        fields: [
          { key: "traditional_leaders_engaged", label: "Traditional leaders engaged", what: "Emirs, chiefs engaged", type: "number", metric: true, example: "4" },
          { key: "traditional_leaders_support", label: "Level of support", what: "Agreement / commitment", type: "longtext", example: "Yes — endorsed campaign" },
        ],
      },
      {
        activity: "Healthcare Workers",
        fields: [
          { key: "healthcare_workers_engaged", label: "Healthcare workers engaged", what: "Health staff reached", type: "number", metric: true, example: "12" },
          { key: "healthcare_facility_type", label: "Type of facility", what: "PHC, General Hospital, etc.", type: "select", allowOther: true, options: ["PHC", "General Hospital", "Teaching Hospital", "Private Clinic", "Patent Medicine Vendor"], example: "PHC" },
        ],
      },
      {
        activity: "Religious Leaders",
        fields: [
          { key: "religious_leaders_engaged", label: "Religious leaders engaged", what: "Imams / pastors engaged", type: "number", metric: true, example: "6" },
          { key: "religious_leaders_support_mode", label: "Mode of support", what: "Sermons, announcements", type: "select", allowOther: true, options: ["Friday sermon", "Church announcement", "Public announcement", "Door-to-door outreach", "Community gathering"], example: "Friday sermon" },
        ],
      },
    ],
  },
  {
    id: "social_mobilization",
    title: "Social Mobilization & Awareness Creation",
    short: "Social Mobilization",
    icon: "MessagesSquare",
    color: "#16a34a",
    groups: [
      {
        activity: "Community Dialogue",
        fields: [
          { key: "community_dialogue_sessions", label: "Sessions held", what: "Number of meetings", type: "number", metric: true, example: "3" },
          { key: "community_dialogue_location", label: "Location", what: "Where the meeting was held", type: "text", example: "Unguwa Uku" },
        ],
      },
      {
        activity: "Attendance",
        fields: [
          { key: "attendance_men", label: "Men attended", what: "Number of men present", type: "number", metric: true, example: "25" },
          { key: "attendance_women", label: "Women attended", what: "Number of women present", type: "number", metric: true, example: "40" },
        ],
      },
      {
        activity: "Participation",
        fields: [
          { key: "participation_level", label: "Level of engagement", what: "High / Medium / Low", type: "select", options: PARTICIPATION_LEVELS, example: "High" },
          { key: "questions_asked", label: "Questions asked", what: "Number of contributions", type: "number", metric: true, example: "10" },
        ],
      },
      {
        activity: "Issues & Misconceptions",
        fields: [
          { key: "issues_raised", label: "Issues raised", what: "List key concerns", type: "longtext", example: "Vaccine fear" },
          { key: "issues_resolved", label: "Resolved issues", what: "Issues successfully addressed", type: "longtext", example: "Yes" },
        ],
      },
    ],
  },
  {
    id: "non_compliance",
    title: "Non-Compliance Resolution",
    short: "Non-Compliance",
    icon: "ShieldAlert",
    color: "#dc2626",
    groups: [
      {
        activity: "Non-compliance Issues",
        fields: [
          { key: "noncompliance_cases", label: "Cases identified", what: "Number of refusal / non-compliance cases", type: "number", metric: true, example: "8" },
          { key: "noncompliance_type", label: "Type of issue", what: "Reason for refusal", type: "select", allowOther: true, options: ["Misinformation", "Religious belief", "Fear of side effects", "Distrust of government", "Caregiver absent", "Child sick / ineligible"], example: "Misinformation" },
        ],
      },
      {
        activity: "Location",
        fields: [
          { key: "noncompliance_area", label: "Area", what: "Ward / settlement", type: "text", example: "Kurna" },
          { key: "noncompliance_household_id", label: "Household ID", what: "Identifier if available", type: "text", example: "HH-102" },
        ],
      },
      {
        activity: "Status",
        fields: [
          { key: "cases_resolved", label: "Resolved cases", what: "Number resolved", type: "number", metric: true, example: "5" },
          { key: "cases_pending", label: "Pending cases", what: "Number unresolved", type: "number", metric: true, example: "3" },
        ],
      },
      {
        activity: "Resolution & Follow-up",
        fields: [
          { key: "resolution_method", label: "Approach used", what: "Dialogue, leader engagement", type: "select", allowOther: true, options: ["One-on-one dialogue", "Religious leader engagement", "Traditional leader engagement", "Health education", "Referral to facility"], example: "Religious leader engagement" },
          { key: "followup_date", label: "Follow-up date", what: "Date revisited", type: "date" },
        ],
      },
    ],
  },
  {
    id: "awareness_creation",
    title: "Awareness Creation",
    short: "Awareness",
    icon: "Megaphone",
    color: "#ea580c",
    groups: [
      {
        activity: "Radio Messaging",
        fields: [
          { key: "radio_messages_aired", label: "Messages aired", what: "Number of broadcasts", type: "number", metric: true, example: "4" },
          { key: "radio_estimated_reach", label: "Estimated reach", what: "Audience size", type: "number", metric: true, example: "5000" },
        ],
      },
      {
        activity: "Announcements",
        fields: [
          { key: "town_announcements", label: "Town announcements", what: "Number of announcements", type: "number", metric: true, example: "6" },
          { key: "mosque_announcements", label: "Mosque announcements", what: "Number of mosque announcements", type: "number", metric: true, example: "5" },
        ],
      },
      {
        activity: "Total Reach & IEC Materials",
        fields: [
          { key: "total_reach", label: "Total people reached", what: "Estimated total population reached", type: "number", metric: true, example: "12000" },
          { key: "iec_materials_distributed", label: "IEC materials distributed", what: "Number of posters / leaflets", type: "number", metric: true, example: "200" },
          { key: "iec_visibility", label: "IEC materials visible / displayed", what: "Seen / displayed", type: "boolean" },
          { key: "iec_locations", label: "Locations displayed", what: "Where materials are placed", type: "text", example: "Health centers" },
        ],
      },
    ],
  },
];

/** Flat list of all fields (with section reference) for convenience. */
export const IRF_ALL_FIELDS: (IrfField & { sectionId: string; activity: string })[] =
  IRF_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => ({ ...f, sectionId: s.id, activity: g.activity }))));

export const IRF_METRIC_FIELDS = IRF_ALL_FIELDS.filter((f) => f.metric);

export type IrfReport = {
  id: string;
  project_id: string | null;
  created_by: string;
  reporting_period: string | null;
  reporting_month: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  focal_person_name: string | null;
  focal_person_phone: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  evidence: any[] | null;
  narrative: string | null;
  submission_status: string | null;
  created_at: string;
  updated_at: string;
} & Record<string, any>;
