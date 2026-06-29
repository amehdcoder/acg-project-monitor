// LGA ACSM Focal Person — Category Activity Forms
//
// The single combined IRF has been split into focused, category-based activity
// forms. Each form is filled per visit. Forms can be reported at either State
// level (no LGA/Ward required) or LGA level (State + LGA, optional Ward).
//
// Key outcomes are captured on a three-level acceptance scale: Low / Medium /
// High. Each form supports photo evidence with per-photo consent.

export const ACCEPTANCE_LEVELS = ["Low", "Medium", "High"] as const;
export type AcceptanceLevel = (typeof ACCEPTANCE_LEVELS)[number];

/** Sentinel value used for the "Other (specify)" option in selects. */
export const OTHER_OPTION = "Other (specify)";

export type IrfFieldType =
  | "number"
  | "text"
  | "longtext"
  | "select"
  | "boolean"
  | "date"
  | "acceptance";

export interface IrfCategoryField {
  key: string;
  label: string;
  what?: string;
  type: IrfFieldType;
  options?: readonly string[];
  allowOther?: boolean;
  required?: boolean;
  example?: string;
  /** When set, the value is written directly to this irf_reports column. */
  column?: string;
}

export interface IrfCategoryGroup {
  activity: string;
  fields: IrfCategoryField[];
}

export interface IrfCategoryForm {
  /** Stored in irf_reports.form_category */
  id: string;
  name: string;
  short: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // hex accent
  /** When true, the form is a "per ministry/department" visit (advocacy). */
  perMinistry?: boolean;
  groups: IrfCategoryGroup[];
}

/** Ministries / departments commonly engaged during advocacy visits. */
export const MINISTRY_DEPARTMENTS = [
  "State Ministry of Health",
  "State Primary Health Care Development Agency",
  "LGA Health Department",
  "Ministry of Information",
  "Ministry of Local Government",
  "Ministry of Education",
  "Emirate Council",
  "Religious Affairs Body",
  "Traditional Council",
  "Office of the Executive Chairman (LGA)",
] as const;

const acceptanceField = (key = "outcome_level", label = "Level of acceptance / key outcome"): IrfCategoryField => ({
  key,
  label,
  what: "Overall acceptance achieved during this activity",
  type: "acceptance",
  required: true,
  column: "outcome_level",
});

export const IRF_CATEGORY_FORMS: IrfCategoryForm[] = [
  {
    id: "advocacy_supervision",
    name: "Advocacy Supervision Form",
    short: "Advocacy Supervision",
    description: "Record one advocacy visit per ministry or department, at State or LGA level.",
    icon: "Landmark",
    color: "#0891b2",
    perMinistry: true,
    groups: [
      {
        activity: "Visit Details",
        fields: [
          { key: "visit_date", label: "Date of visit", type: "date", required: true, column: "visit_date" },
          { key: "persons_engaged", label: "Officials engaged", what: "Number of officials met during the visit", type: "number", required: true },
          { key: "designations", label: "Designations / titles", what: "Roles of officials engaged (e.g. Permanent Secretary)", type: "text" },
        ],
      },
      {
        activity: "Engagement Outcome",
        fields: [
          { key: "purpose", label: "Purpose of advocacy", what: "What was the advocacy about?", type: "longtext", required: true },
          { key: "commitments", label: "Commitments / decisions made", what: "Concrete commitments or support secured", type: "longtext" },
          { key: "support_mode", label: "Type of support", type: "select", allowOther: true, options: ["Financial", "Logistics", "Personnel", "Endorsement", "Policy direction", "Announcement / sensitisation"] },
          acceptanceField("outcome_level", "Level of acceptance / commitment"),
        ],
      },
    ],
  },
  {
    id: "town_announcers",
    name: "Town Announcers Supervision Form",
    short: "Town Announcers",
    description: "Supervise town announcers and announcement coverage at State or LGA level.",
    icon: "Megaphone",
    color: "#ea580c",
    groups: [
      {
        activity: "Supervision",
        fields: [
          { key: "visit_date", label: "Date of supervision", type: "date", required: true, column: "visit_date" },
          { key: "announcers_supervised", label: "Announcers supervised", what: "Number of town announcers observed", type: "number", required: true },
          { key: "announcements_made", label: "Announcements made", what: "Number of announcements delivered", type: "number", required: true, column: "town_announcements" },
        ],
      },
      {
        activity: "Coverage & Quality",
        fields: [
          { key: "areas_covered", label: "Areas covered", what: "Wards / settlements reached", type: "text" },
          { key: "estimated_reach", label: "Estimated reach", what: "Estimated people reached", type: "number", column: "total_reach" },
          { key: "message_channel", label: "Channel", type: "select", allowOther: true, options: ["Town crier", "Mosque", "Church", "Market square", "Mobile PA system", "Radio"] },
          acceptanceField("outcome_level", "Message accuracy / acceptance"),
          { key: "issues", label: "Issues observed", what: "Challenges or gaps noticed", type: "longtext" },
        ],
      },
    ],
  },
  {
    id: "compound_meeting",
    name: "Compound Meeting Form",
    short: "Compound Meeting",
    description: "Document a compound-level meeting at State or LGA level.",
    icon: "Home",
    color: "#7c3aed",
    groups: [
      {
        activity: "Meeting Details",
        fields: [
          { key: "visit_date", label: "Date of meeting", type: "date", required: true, column: "visit_date" },
          { key: "meetings_held", label: "Meetings held", what: "Number of compound meetings", type: "number", required: true },
          { key: "host_name", label: "Compound head / host", what: "Name of compound head", type: "text" },
        ],
      },
      {
        activity: "Attendance",
        fields: [
          { key: "attendance_men", label: "Men attended", type: "number", required: true, column: "attendance_men" },
          { key: "attendance_women", label: "Women attended", type: "number", required: true, column: "attendance_women" },
        ],
      },
      {
        activity: "Outcome",
        fields: [
          { key: "key_messages", label: "Key messages delivered", type: "longtext", required: true },
          { key: "issues_raised", label: "Issues / concerns raised", type: "longtext", column: "issues_raised" },
          acceptanceField("outcome_level", "Level of acceptance"),
        ],
      },
    ],
  },
  {
    id: "community_dialogue",
    name: "Community Dialogue Form",
    short: "Community Dialogue",
    description: "Capture a community dialogue session at State or LGA level.",
    icon: "MessagesSquare",
    color: "#16a34a",
    groups: [
      {
        activity: "Session Details",
        fields: [
          { key: "visit_date", label: "Date of dialogue", type: "date", required: true, column: "visit_date" },
          { key: "community_dialogue_sessions", label: "Sessions held", type: "number", required: true, column: "community_dialogue_sessions" },
          { key: "community_dialogue_location", label: "Location", what: "Where the dialogue was held", type: "text", column: "community_dialogue_location" },
        ],
      },
      {
        activity: "Attendance & Participation",
        fields: [
          { key: "attendance_men", label: "Men attended", type: "number", required: true, column: "attendance_men" },
          { key: "attendance_women", label: "Women attended", type: "number", required: true, column: "attendance_women" },
          { key: "questions_asked", label: "Questions / contributions", type: "number", column: "questions_asked" },
        ],
      },
      {
        activity: "Issues & Outcome",
        fields: [
          { key: "issues_raised", label: "Issues / misconceptions raised", type: "longtext", required: true, column: "issues_raised" },
          { key: "issues_resolved", label: "Issues resolved", type: "longtext", column: "issues_resolved" },
          acceptanceField("outcome_level", "Level of acceptance"),
        ],
      },
    ],
  },
];

export const getCategoryForm = (id: string) => IRF_CATEGORY_FORMS.find((f) => f.id === id);

export type IrfEvidencePhoto = {
  path: string;
  caption?: string;
  consent: true;
  consented_at: string;
};
