/**
 * Default standard-assessment form definitions:
 *  - WG-SS  : Washington Group Short Set on Functioning (disability)
 *  - GAD-7  : Generalized Anxiety Disorder screener
 *  - PHQ-9  : Patient Health Questionnaire (depression)
 *
 * Each form includes identification + demographic + psychographic
 * questions so analytics can be sliced by sub-population.
 */

export type StandardFormCode = "wg_ss" | "gad_7" | "phq_9" | "hfat";

export interface SAQuestion {
  id: string;
  label: string;
  type: "text" | "number" | "select_one" | "date" | "note";
  required?: boolean;
  options?: { value: string; label: string; score?: number }[];
  hint?: string | null;
  section?: string;
  /** ODK display condition (best-effort, optional). */
  relevant?: string | null;
  /** Dynamic option source resolved at render time. */
  optionsFrom?: "nigeria_states" | "nigeria_lgas";
  /** ID of another question whose value populates this question's options. */
  dependsOn?: string;
  /** Simple display rule: hide if responses[<key>] is < threshold (numeric). */
  showIfMinAge?: number;
}

export interface StandardAssessmentDefinition {
  code: StandardFormCode;
  name: string;
  description: string;
  shortName: string;
  identification: SAQuestion[];
  demographics: SAQuestion[];
  psychographics: SAQuestion[];
  items: SAQuestion[]; // scored items
  closing?: SAQuestion[]; // unscored follow-ups
}

// -------- shared blocks --------
const IDENT: SAQuestion[] = [
  { id: "respondent_id", label: "Respondent ID / Case number (optional)", type: "text", section: "Identification" },
  { id: "full_name", label: "Full name (optional, leave blank to keep anonymous)", type: "text", section: "Identification" },
  { id: "assessed_at", label: "Date of assessment", type: "date", required: true, section: "Identification" },
];

const DEMO: SAQuestion[] = [
  { id: "age", label: "Age (years)", type: "number", required: true, section: "Demographics" },
  {
    id: "sex",
    label: "Sex",
    type: "select_one",
    required: true,
    section: "Demographics",
    options: [
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "intersex", label: "Intersex" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  {
    id: "education",
    label: "Highest education completed",
    type: "select_one",
    section: "Demographics",
    options: [
      { value: "none", label: "No formal education" },
      { value: "primary", label: "Primary" },
      { value: "secondary", label: "Secondary" },
      { value: "tertiary", label: "Tertiary / University" },
      { value: "postgrad", label: "Postgraduate" },
    ],
  },
  {
    id: "employment",
    label: "Employment status",
    type: "select_one",
    section: "Demographics",
    options: [
      { value: "employed", label: "Employed (full / part time)" },
      { value: "self_employed", label: "Self-employed" },
      { value: "unemployed", label: "Unemployed" },
      { value: "student", label: "Student" },
      { value: "retired", label: "Retired" },
      { value: "homemaker", label: "Homemaker" },
    ],
  },
  {
    id: "marital_status",
    label: "Marital status",
    type: "select_one",
    section: "Demographics",
    options: [
      { value: "single", label: "Single" },
      { value: "married", label: "Married / Cohabiting" },
      { value: "divorced", label: "Divorced / Separated" },
      { value: "widowed", label: "Widowed" },
    ],
  },
  { id: "state", label: "State of residence", type: "text", section: "Demographics" },
  { id: "lga", label: "LGA of residence", type: "text", section: "Demographics" },
  {
    id: "setting",
    label: "Residential setting",
    type: "select_one",
    section: "Demographics",
    options: [
      { value: "urban", label: "Urban" },
      { value: "peri_urban", label: "Peri-urban" },
      { value: "rural", label: "Rural" },
    ],
  },
];

const PSYCHO: SAQuestion[] = [
  {
    id: "household_income",
    label: "Self-rated household income",
    type: "select_one",
    section: "Psychographics",
    options: [
      { value: "very_low", label: "Far below average" },
      { value: "low", label: "Below average" },
      { value: "avg", label: "Average" },
      { value: "high", label: "Above average" },
      { value: "very_high", label: "Far above average" },
    ],
  },
  {
    id: "social_support",
    label: "Perceived social support",
    type: "select_one",
    section: "Psychographics",
    options: [
      { value: "none", label: "None at all" },
      { value: "low", label: "A little" },
      { value: "some", label: "Some" },
      { value: "strong", label: "Strong" },
    ],
  },
  {
    id: "life_satisfaction",
    label: "Overall life satisfaction (0 = worst, 10 = best)",
    type: "number",
    section: "Psychographics",
  },
  {
    id: "stress_level",
    label: "Self-rated stress in the past month",
    type: "select_one",
    section: "Psychographics",
    options: [
      { value: "none", label: "None" },
      { value: "mild", label: "Mild" },
      { value: "moderate", label: "Moderate" },
      { value: "high", label: "High" },
      { value: "severe", label: "Severe" },
    ],
  },
];

// -------- WG-SS --------
const WG_OPTIONS = [
  { value: "1", label: "No difficulty", score: 1 },
  { value: "2", label: "Some difficulty", score: 2 },
  { value: "3", label: "A lot of difficulty", score: 3 },
  { value: "4", label: "Cannot do at all", score: 4 },
];

const WG_DOMAINS: { id: string; label: string; hint: string }[] = [
  { id: "vis_ss", label: "Do you have difficulty seeing, even if wearing glasses?", hint: "Vision" },
  { id: "hear_ss", label: "Do you have difficulty hearing, even if using a hearing aid(s)?", hint: "Hearing" },
  { id: "mob_ss", label: "Do you have difficulty walking or climbing steps?", hint: "Mobility" },
  { id: "cog_ss", label: "Do you have difficulty remembering or concentrating?", hint: "Cognition" },
  { id: "sc_ss", label: "Do you have difficulty with self-care, such as washing all over or dressing?", hint: "Self-care" },
  {
    id: "com_ss",
    label: "Using your usual language, do you have difficulty communicating, for example understanding or being understood?",
    hint: "Communication",
  },
];

export const WG_SS_DEFINITION: StandardAssessmentDefinition = {
  code: "wg_ss",
  name: "Washington Group Short Set on Functioning (WG-SS)",
  shortName: "WG-SS Disability",
  description:
    "Six-question disability screener from the Washington Group on Disability Statistics. Identifies people with difficulty in vision, hearing, mobility, cognition, self-care or communication.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: WG_DOMAINS.map((d) => ({
    id: d.id,
    label: d.label,
    hint: d.hint,
    type: "select_one" as const,
    required: true,
    options: WG_OPTIONS,
    section: "Functioning",
  })),
};

// -------- GAD-7 --------
const FREQ_OPTIONS = [
  { value: "0", label: "Not at all", score: 0 },
  { value: "1", label: "Several days", score: 1 },
  { value: "2", label: "More than half the days", score: 2 },
  { value: "3", label: "Nearly every day", score: 3 },
];

const DIFFICULTY_OPTIONS = [
  { value: "not", label: "Not difficult at all" },
  { value: "somewhat", label: "Somewhat difficult" },
  { value: "very", label: "Very difficult" },
  { value: "extremely", label: "Extremely difficult" },
];

const GAD_ITEMS = [
  "Feeling nervous, anxious or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritated",
  "Feeling afraid as if something awful might happen",
];

export const GAD7_DEFINITION: StandardAssessmentDefinition = {
  code: "gad_7",
  name: "Generalized Anxiety Disorder (GAD-7)",
  shortName: "GAD-7 Anxiety",
  description:
    "Seven-item anxiety screener. Over the last 2 weeks, how often have you been bothered by the following problems?",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: GAD_ITEMS.map((label, i) => ({
    id: `gad_${i + 1}`,
    label: `${i + 1}. ${label}`,
    type: "select_one" as const,
    required: true,
    options: FREQ_OPTIONS,
    section: "Past 2 weeks",
  })),
  closing: [
    {
      id: "gad_functional",
      label:
        "How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?",
      type: "select_one",
      options: DIFFICULTY_OPTIONS,
      section: "Functional impact",
    },
    { id: "gad_onset", label: "When did the symptoms begin?", type: "text", section: "Functional impact" },
  ],
};

// -------- PHQ-9 --------
const PHQ_ITEMS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead or of hurting yourself in some way",
];

export const PHQ9_DEFINITION: StandardAssessmentDefinition = {
  code: "phq_9",
  name: "Patient Health Questionnaire (PHQ-9)",
  shortName: "PHQ-9 Depression",
  description:
    "Nine-item depression screener. Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: PHQ_ITEMS.map((label, i) => ({
    id: `phq_${i + 1}`,
    label: `${i + 1}. ${label}`,
    type: "select_one" as const,
    required: true,
    options: FREQ_OPTIONS,
    section: "Past 2 weeks",
  })),
  closing: [
    {
      id: "phq_functional",
      label:
        "How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?",
      type: "select_one",
      options: DIFFICULTY_OPTIONS,
      section: "Functional impact",
    },
  ],
};

import { HFAT_ITEMS } from "./hfat.generated";

export const HFAT_DEFINITION: StandardAssessmentDefinition = {
  code: "hfat",
  name: "Hydrocele Facility Assessment Tool (HFAT)",
  shortName: "HFAT",
  description:
    "WHO/NTD facility-level assessment for hydrocele surgical service readiness — covers facility background, surgical procedures, training, infection prevention, equipment and medicines.",
  identification: [
    { id: "respondent_id", label: "Assessor / Case number (optional)", type: "text", section: "Identification" },
    { id: "full_name", label: "Assessor name", type: "text", section: "Identification" },
    { id: "assessed_at", label: "Date of assessment", type: "date", required: true, section: "Identification" },
  ],
  demographics: [
    { id: "facility_name", label: "Health facility name", type: "text", required: true, section: "Facility" },
    { id: "state", label: "State", type: "text", required: true, section: "Facility" },
    { id: "lga", label: "LGA", type: "text", required: true, section: "Facility" },
  ],
  psychographics: [],
  items: HFAT_ITEMS,
};

export const STANDARD_ASSESSMENTS: Record<StandardFormCode, StandardAssessmentDefinition> = {
  wg_ss: WG_SS_DEFINITION,
  gad_7: GAD7_DEFINITION,
  phq_9: PHQ9_DEFINITION,
  hfat: HFAT_DEFINITION,
};

// -------- Scoring --------

export interface ScoreResult {
  score: number;
  severity: string;
  interpretation: string;
  /** WG-SS: per-domain flags + overall disability classification */
  disabilityFlags?: {
    vision: boolean;
    hearing: boolean;
    mobility: boolean;
    cognition: boolean;
    selfCare: boolean;
    communication: boolean;
    /** WG recommended "disability" cutoff: at least one domain rated 3 or 4. */
    hasDisability: boolean;
    /** "no" | "some" | "lot" | "cannot" — worst domain rating. */
    severityClass: "no" | "some" | "lot" | "cannot";
  };
}

export function scoreAssessment(
  code: StandardFormCode,
  data: Record<string, any>,
): ScoreResult {
  if (code === "wg_ss") {
    const map: Record<string, keyof NonNullable<ScoreResult["disabilityFlags"]>> = {
      vis_ss: "vision",
      hear_ss: "hearing",
      mob_ss: "mobility",
      cog_ss: "cognition",
      sc_ss: "selfCare",
      com_ss: "communication",
    };
    const flags: any = {
      vision: false, hearing: false, mobility: false,
      cognition: false, selfCare: false, communication: false,
      hasDisability: false, severityClass: "no",
    };
    let worst = 1;
    let totalScore = 0;
    Object.entries(map).forEach(([qid, key]) => {
      const v = parseInt(data[qid] ?? "0", 10) || 0;
      totalScore += v;
      if (v >= 3) flags[key] = true;
      if (v > worst) worst = v;
    });
    flags.hasDisability = worst >= 3;
    flags.severityClass = worst === 4 ? "cannot" : worst === 3 ? "lot" : worst === 2 ? "some" : "no";
    const severity = flags.hasDisability
      ? worst === 4
        ? "Severe disability"
        : "Significant disability"
      : worst === 2
        ? "Some difficulty (no disability)"
        : "No disability";
    return {
      score: totalScore,
      severity,
      interpretation: flags.hasDisability
        ? "At least one functional domain rated 'A lot of difficulty' or 'Cannot do at all' — meets the Washington Group threshold for disability."
        : "No functional domain meets the WG disability threshold (rating of 3 or 4).",
      disabilityFlags: flags,
    };
  }

  if (code === "gad_7") {
    const total = Array.from({ length: 7 }, (_, i) => parseInt(data[`gad_${i + 1}`] ?? "0", 10) || 0).reduce(
      (a, b) => a + b,
      0,
    );
    const severity =
      total >= 15 ? "Moderate to severe anxiety" :
      total >= 10 ? "Moderate anxiety" :
      total >= 5  ? "Mild anxiety" :
                    "Minimal anxiety";
    const interpretation =
      total >= 15 ? "Often warrants active treatment with medication, therapy, or both."
      : total >= 10 ? "Treatment goals should target the specific symptoms indicated."
      : total >= 5  ? "Clinical judgement about treatment needs based on client knowledge, duration and severity."
      :               "Treatment for anxiety may not be clinically indicated.";
    return { score: total, severity, interpretation };
  }

  // phq_9
  const total = Array.from({ length: 9 }, (_, i) => parseInt(data[`phq_${i + 1}`] ?? "0", 10) || 0).reduce(
    (a, b) => a + b,
    0,
  );
  const severity =
    total >= 20 ? "Severe depression" :
    total >= 15 ? "Moderately severe depression" :
    total >= 10 ? "Moderate depression" :
    total >= 5  ? "Mild depression" :
                  "Minimal depression";
  const phqSuicidality = (parseInt(data.phq_9 ?? "0", 10) || 0) >= 1;
  const interpretation =
    (total >= 15
      ? "Active treatment with pharmacotherapy and/or psychotherapy is recommended."
      : total >= 10
        ? "Treatment plan should be considered (counselling, follow-up, possibly pharmacotherapy)."
        : total >= 5
          ? "Watchful waiting; repeat PHQ-9 at follow-up."
          : "Monitor; may not require treatment.") +
    (phqSuicidality
      ? " ⚠ Item 9 endorsed — assess suicide risk immediately."
      : "");
  return { score: total, severity, interpretation };
}
