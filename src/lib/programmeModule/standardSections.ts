// Cross-cutting standards for the longitudinal beneficiary record.
//
// Two families, deliberately kept apart so nothing is asked twice:
//
//  1. PROFILE — things true of the person, captured once at registration and
//     updated over time (inclusion & vulnerability, communication preferences,
//     exit / completion). These are merged into the module configuration, so
//     administrators can edit, extend or remove them like any other section.
//
//  2. SERVICE — things true of a single contact, captured at every visit
//     (participation, service quality & experience, accessibility and
//     reasonable accommodation, beneficiary-centred outcome, feedback,
//     safeguarding). These are standard across every programme component and
//     live in code so every service form asks them identically.

import type { Question } from "@/components/FormBuilder/types";
import type { ProfileSection, ProgrammeModuleConfig } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

const opts = (values: string[]) => values.map((v) => ({ id: uid(), label: v, value: v }));

const q = (
  name: string,
  label: string,
  type: Question["type"] = "text",
  extra: Partial<Question> = {},
): Question => ({ id: uid(), name, label, type, required: false, ...extra });

const one = (name: string, label: string, values: string[], extra: Partial<Question> = {}) =>
  q(name, label, "select_one", { options: opts(values), ...extra });

const many = (name: string, label: string, values: string[], extra: Partial<Question> = {}) =>
  q(name, label, "select_multiple", { options: opts(values), ...extra });

/* ------------------------------------------------------------------ */
/* 1. Profile-level standard sections                                  */
/* ------------------------------------------------------------------ */

export const DISABILITY_STATUS = [
  "No disability reported", "Disability identified", "Suspected disability",
  "Prefer not to say", "Not assessed",
];

export const DISABILITY_TYPE = [
  "Physical/mobility", "Visual", "Hearing", "Speech/communication", "Intellectual",
  "Psychosocial", "Multiple disabilities", "Other", "Not assessed",
];

export const VULNERABILITY_FACTORS = [
  "Person affected by NTD", "Person with disability", "Child", "Older person",
  "Female-headed household", "Household with limited livelihood",
  "Extremely poor/vulnerable household", "Person requiring caregiver support",
  "Other", "None identified",
];

export const PROGRAMME_STATUS = [
  "Active", "Receiving services", "Follow-up ongoing", "Completed planned intervention",
  "Graduated", "Referred", "Lost to follow-up", "Withdrawn", "Other",
];

const EXIT_STATUSES = [
  "Completed planned intervention", "Graduated", "Referred",
  "Lost to follow-up", "Withdrawn", "Other",
];

export const EXIT_REASONS = [
  "Treatment completed", "Programme objective achieved", "Beneficiary graduated",
  "Referred to another service", "Beneficiary relocated",
  "Beneficiary declined further services", "Lost to follow-up", "Other",
];

const exitRelevant = EXIT_STATUSES.map((s) => `\${programme_status} = '${s}'`).join(" or ");

const section = (
  label: string,
  placement: ProfileSection["placement"],
  order: number,
  questions: Question[],
): ProfileSection => ({ id: uid(), label, placement, order, questions });

/** Standard profile sections every register carries. */
export const standardProfileSections = (): ProfileSection[] => [
  section("Inclusion & Vulnerability", "clinical", 40, [
    one("disability_status", "Disability status", DISABILITY_STATUS),
    many("disability_type", "Disability type", DISABILITY_TYPE, {
      relevant: "${disability_status} = 'Disability identified' or ${disability_status} = 'Suspected disability'",
    }),
    many("vulnerability_factors", "Other vulnerability factors", VULNERABILITY_FACTORS),
  ]),
  section("Communication & Participation", "personal", 41, [
    one("preferred_communication", "Preferred communication method", [
      "Verbal/in-person", "Phone call", "SMS", "WhatsApp", "Caregiver/representative",
      "Sign language", "Written information", "Audio communication", "Other",
    ]),
    one("preferred_language", "Preferred language", [
      "English", "Hausa", "Other Nigerian language", "Sign language", "Other",
    ]),
    q("preferred_language_other", "Specify language", "text", {
      relevant: "${preferred_language} = 'Other Nigerian language' or ${preferred_language} = 'Other'",
    }),
  ]),
  section("Exit / Completion", "clinical", 42, [
    one("programme_status", "Beneficiary programme status", PROGRAMME_STATUS),
    one("exit_reason", "Reason for completion / exit", EXIT_REASONS, { relevant: exitRelevant }),
    q("exit_date", "Date of completion / exit", "date", { relevant: exitRelevant }),
  ]),
];

/** Profile question names owned by the standard (used to avoid duplicates). */
export const STANDARD_PROFILE_NAMES = new Set(
  standardProfileSections().flatMap((s) => s.questions.map((x) => x.name as string)),
);

/**
 * Legacy questions the richer standard sections replace, so the same thing is
 * never asked twice on one record.
 */
const SUPERSEDED_PROFILE_NAMES = new Set(["disability", "vulnerability_status"]);

/** Adds the standard profile sections to a stored configuration, once. */
export const withStandardProfileSections = (
  config: ProgrammeModuleConfig,
): ProgrammeModuleConfig => {
  const existing = new Set(
    (config.sections || []).flatMap((s) => (s.questions || []).map((x) => x.name)),
  );

  const sections = (config.sections || []).map((s) => ({
    ...s,
    questions: (s.questions || []).filter((x) => !SUPERSEDED_PROFILE_NAMES.has(x.name || "")),
  }));

  const missing = standardProfileSections()
    .map((s) => ({ ...s, questions: s.questions.filter((x) => !existing.has(x.name)) }))
    .filter((s) => s.questions.length);

  const clinicalFields = (config.layout?.clinicalFields || [])
    .filter((f) => !SUPERSEDED_PROFILE_NAMES.has(f));
  const headerFields = (config.layout?.headerFields || [])
    .filter((f) => !SUPERSEDED_PROFILE_NAMES.has(f));

  return {
    ...config,
    sections: [...sections, ...missing],
    layout: {
      ...config.layout,
      headerFields: ["disability_status", "marital_status"].reduce(
        (list, field) => (list.includes(field) ? list : [...list, field]),
        headerFields,
      ),
      clinicalFields: clinicalFields.includes("programme_status")
        ? clinicalFields
        : [...clinicalFields, "disability_status", "programme_status"],
    },
  };
};

/* ------------------------------------------------------------------ */
/* 2. Service-level standard sections                                  */
/* ------------------------------------------------------------------ */

export interface ServiceSection {
  id: string;
  label: string;
  hint?: string;
  questions: Question[];
}

const YES_PARTIAL_NO = ["Yes", "Partially", "No"];

export const SERVICE_EXPERIENCE_SECTIONS: ServiceSection[] = [
  {
    id: "participation",
    label: "Participation & communication",
    questions: [
      many("participants", "Who participated in the service?", [
        "Beneficiary", "Parent/guardian", "Spouse", "Caregiver",
        "Community representative", "Support-group member", "Other",
      ]),
      one("decision_involvement",
        "Was the beneficiary actively involved in decisions about their care/support?",
        [...YES_PARTIAL_NO, "Not applicable"]),
    ],
  },
  {
    id: "quality",
    label: "Service quality & beneficiary experience",
    questions: [
      one("service_as_planned", "Was the service provided as planned?", YES_PARTIAL_NO),
      one("beneficiary_satisfaction", "Beneficiary satisfaction", [
        "Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied",
      ]),
      one("dignity_respect", "Was the beneficiary treated with dignity and respect?", [
        "Always", "Usually", "Sometimes", "No",
      ]),
      one("understood_information", "Did the beneficiary understand the information provided?", [
        "Completely", "Partially", "Not at all", "Not assessed",
      ]),
      one("could_ask_questions", "Did the beneficiary have an opportunity to ask questions?", ["Yes", "No"]),
    ],
  },
  {
    id: "accessibility",
    label: "Accessibility & reasonable accommodation",
    hint: "Records the barriers a beneficiary met and what was done to remove them.",
    questions: [
      one("access_barrier", "Did the beneficiary experience any barrier accessing the service?", [
        "No", "Yes", "Not sure", "Not assessed",
      ]),
      many("access_barriers", "Accessibility barriers experienced", [
        "Physical/environmental barrier", "Distance to service", "Transportation",
        "Cost/financial barrier", "Communication barrier", "Hearing-related barrier",
        "Visual-information barrier", "Mobility limitation", "Lack of caregiver/support person",
        "Waiting time", "Lack of accessible infrastructure", "Lack of information",
        "Social/cultural barrier", "Stigma/discrimination", "Other", "None",
      ], { relevant: "${access_barrier} = 'Yes' or ${access_barrier} = 'Not sure'" }),
      many("accommodation_provided", "Reasonable accommodation provided", [
        "Mobility assistance", "Wheelchair/access assistance", "Priority seating",
        "Caregiver assistance", "Sign-language support", "Alternative communication",
        "Audio information", "Large-print information", "Easy-to-understand information",
        "Additional consultation time", "Home/community-based service", "Transport support",
        "Other", "Not required",
      ]),
      one("accommodation_adequate", "Was the accommodation adequate?", [
        "Yes, fully", "Partially", "No", "Not applicable",
      ]),
    ],
  },
  {
    id: "outcome",
    label: "Beneficiary-centred outcome",
    hint: "Moves the programme beyond activity counting to the change the person experienced.",
    questions: [
      one("perceived_change", "Beneficiary's perceived change", [
        "Much improved", "Improved", "No change", "Worsened", "Much worsened", "Unable to assess",
      ]),
      many("improvement_areas", "Main area of improvement", [
        "Health status", "Physical functioning", "Vision", "Mental wellbeing",
        "Self-care capacity", "Economic situation", "Household income", "Access to water",
        "Sanitation/hygiene", "Social participation", "Confidence/self-esteem",
        "Access to services", "Independence", "Quality of life", "Other",
      ], { relevant: "${perceived_change} = 'Much improved' or ${perceived_change} = 'Improved'" }),
    ],
  },
  {
    id: "feedback",
    label: "Beneficiary feedback",
    questions: [
      one("feedback_given", "Did the beneficiary provide feedback?", ["Yes", "No"]),
      many("feedback_types", "Type of feedback", [
        "Compliment", "Suggestion", "Complaint", "Concern",
        "Request for additional support", "Referral request", "Other",
      ], { relevant: "${feedback_given} = 'Yes'" }),
      one("feedback_channel", "Preferred feedback channel", [
        "Direct to staff", "Feedback box", "Telephone", "SMS", "WhatsApp",
        "Community representative", "Anonymous", "Other",
      ], { relevant: "${feedback_given} = 'Yes'" }),
      one("feedback_resolved", "Feedback resolved?", [
        "Yes", "Partially", "No", "Pending", "Not applicable",
      ], { relevant: "${feedback_given} = 'Yes'" }),
    ],
  },
  {
    id: "safeguarding",
    label: "Safeguarding & protection",
    hint: "Record the category and the action taken only. Detailed narratives belong in the restricted safeguarding module, never in the general record.",
    questions: [
      one("safeguarding_concern", "Safeguarding concern identified?", [
        "No", "Yes", "Suspected", "Prefer not to say",
      ]),
      many("safeguarding_category", "Concern category", [
        "Neglect", "Abuse", "Exploitation", "Violence", "Discrimination", "Stigma",
        "Financial exploitation", "Other", "None",
      ], { relevant: "${safeguarding_concern} = 'Yes' or ${safeguarding_concern} = 'Suspected'" }),
      one("safeguarding_immediate_action", "Immediate action required?", [
        "No", "Yes", "Urgent", "Referred",
      ], { relevant: "${safeguarding_concern} = 'Yes' or ${safeguarding_concern} = 'Suspected'" }),
      many("safeguarding_action", "Safeguarding / referral action", [
        "Safeguarding focal person", "Health facility", "Social welfare service",
        "Protection service", "Community support", "Emergency service", "Other", "Not applicable",
      ], { relevant: "${safeguarding_concern} = 'Yes' or ${safeguarding_concern} = 'Suspected'" }),
    ],
  },
];

/** Every question name owned by the service standard. */
export const SERVICE_EXPERIENCE_NAMES = new Set(
  SERVICE_EXPERIENCE_SECTIONS.flatMap((s) => s.questions.map((x) => x.name as string)),
);
