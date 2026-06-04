/**
 * Default standard-assessment form definitions:
 *  - WG-SS  : Washington Group Short Set on Functioning (disability)
 *  - GAD-7  : Generalized Anxiety Disorder screener
 *  - PHQ-9  : Patient Health Questionnaire (depression)
 *
 * Each form includes identification + demographic + psychographic
 * questions so analytics can be sliced by sub-population.
 */

export type StandardFormCode =
  | "wg_ss"
  | "gad_7"
  | "phq_9"
  | "hfat"
  | "lfat"
  | "srq_20"
  | "audit"
  | "epds"
  | "pcptsd5"
  | "mdq";

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
    ],
  },
  {
    id: "education",
    label: "Highest education completed",
    type: "select_one",
    section: "Demographics",
    showIfMinAge: 15,
    hint: "Only shown for respondents aged 15 years or older.",
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
    showIfMinAge: 15,
    hint: "Only shown for respondents aged 15 years or older.",
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
    showIfMinAge: 15,
    hint: "Only shown for respondents aged 15 years or older.",
    options: [
      { value: "single", label: "Single" },
      { value: "married", label: "Married / Cohabiting" },
      { value: "divorced", label: "Divorced / Separated" },
      { value: "widowed", label: "Widowed" },
    ],
  },
  {
    id: "state",
    label: "State of residence",
    type: "select_one",
    section: "Demographics",
    optionsFrom: "nigeria_states",
  },
  {
    id: "lga",
    label: "LGA / Area Council of residence",
    type: "select_one",
    section: "Demographics",
    optionsFrom: "nigeria_lgas",
    dependsOn: "state",
  },
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

// ============================================================
// Additional mhGAP-aligned mental health screeners
// ============================================================

const YES_NO = [
  { value: "1", label: "Yes", score: 1 },
  { value: "0", label: "No", score: 0 },
];

// -------- SRQ-20 (Self-Reporting Questionnaire, WHO) --------
const SRQ20_ITEMS = [
  "Do you often have headaches?",
  "Is your appetite poor?",
  "Do you sleep badly?",
  "Are you easily frightened?",
  "Do your hands shake?",
  "Do you feel nervous, tense or worried?",
  "Is your digestion poor?",
  "Do you have trouble thinking clearly?",
  "Do you feel unhappy?",
  "Do you cry more than usual?",
  "Do you find it difficult to enjoy your daily activities?",
  "Do you find it difficult to make decisions?",
  "Is your daily work suffering?",
  "Are you unable to play a useful part in life?",
  "Have you lost interest in things?",
  "Do you feel that you are a worthless person?",
  "Has the thought of ending your life been on your mind?",
  "Do you feel tired all the time?",
  "Do you have uncomfortable feelings in your stomach?",
  "Are you easily tired?",
];

export const SRQ20_DEFINITION: StandardAssessmentDefinition = {
  code: "srq_20",
  name: "Self-Reporting Questionnaire (SRQ-20)",
  shortName: "SRQ-20 Distress",
  description:
    "WHO 20-item screener for common mental disorders (depression, anxiety, somatic distress). Answer for the past 30 days.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: SRQ20_ITEMS.map((label, i) => ({
    id: `srq_${i + 1}`,
    label: `${i + 1}. ${label}`,
    type: "select_one" as const,
    required: true,
    options: YES_NO,
    section: "Past 30 days",
  })),
};

// -------- AUDIT (Alcohol Use Disorders Identification Test) --------
const AUDIT_FREQ = [
  { value: "0", label: "Never", score: 0 },
  { value: "1", label: "Less than monthly", score: 1 },
  { value: "2", label: "Monthly", score: 2 },
  { value: "3", label: "Weekly", score: 3 },
  { value: "4", label: "Daily or almost daily", score: 4 },
];

const AUDIT_ITEMS: SAQuestion[] = [
  {
    id: "audit_1", label: "1. How often do you have a drink containing alcohol?",
    type: "select_one", required: true, section: "Alcohol use",
    options: [
      { value: "0", label: "Never", score: 0 },
      { value: "1", label: "Monthly or less", score: 1 },
      { value: "2", label: "2–4 times a month", score: 2 },
      { value: "3", label: "2–3 times a week", score: 3 },
      { value: "4", label: "4 or more times a week", score: 4 },
    ],
  },
  {
    id: "audit_2", label: "2. How many drinks containing alcohol do you have on a typical day when drinking?",
    type: "select_one", required: true, section: "Alcohol use",
    options: [
      { value: "0", label: "1 or 2", score: 0 },
      { value: "1", label: "3 or 4", score: 1 },
      { value: "2", label: "5 or 6", score: 2 },
      { value: "3", label: "7 to 9", score: 3 },
      { value: "4", label: "10 or more", score: 4 },
    ],
  },
  { id: "audit_3", label: "3. How often do you have six or more drinks on one occasion?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  { id: "audit_4", label: "4. How often during the last year have you found that you were not able to stop drinking once you had started?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  { id: "audit_5", label: "5. How often during the last year have you failed to do what was normally expected of you because of drinking?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  { id: "audit_6", label: "6. How often during the last year have you needed a first drink in the morning to get yourself going after a heavy drinking session?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  { id: "audit_7", label: "7. How often during the last year have you had a feeling of guilt or remorse after drinking?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  { id: "audit_8", label: "8. How often during the last year have you been unable to remember what happened the night before because you had been drinking?", type: "select_one", required: true, section: "Alcohol use", options: AUDIT_FREQ },
  {
    id: "audit_9", label: "9. Have you or someone else been injured as a result of your drinking?",
    type: "select_one", required: true, section: "Alcohol use",
    options: [
      { value: "0", label: "No", score: 0 },
      { value: "2", label: "Yes, but not in the last year", score: 2 },
      { value: "4", label: "Yes, during the last year", score: 4 },
    ],
  },
  {
    id: "audit_10", label: "10. Has a relative, friend, doctor or other health worker been concerned about your drinking or suggested you cut down?",
    type: "select_one", required: true, section: "Alcohol use",
    options: [
      { value: "0", label: "No", score: 0 },
      { value: "2", label: "Yes, but not in the last year", score: 2 },
      { value: "4", label: "Yes, during the last year", score: 4 },
    ],
  },
];

export const AUDIT_DEFINITION: StandardAssessmentDefinition = {
  code: "audit",
  name: "Alcohol Use Disorders Identification Test (AUDIT)",
  shortName: "AUDIT Alcohol",
  description:
    "WHO 10-item screener for hazardous and harmful alcohol use and possible dependence.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: AUDIT_ITEMS,
};

// -------- EPDS (Edinburgh Postnatal Depression Scale) --------
const EPDS_ITEMS: SAQuestion[] = [
  {
    id: "epds_1", label: "1. I have been able to laugh and see the funny side of things",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "0", label: "As much as I always could", score: 0 },
      { value: "1", label: "Not quite so much now", score: 1 },
      { value: "2", label: "Definitely not so much now", score: 2 },
      { value: "3", label: "Not at all", score: 3 },
    ],
  },
  {
    id: "epds_2", label: "2. I have looked forward with enjoyment to things",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "0", label: "As much as I ever did", score: 0 },
      { value: "1", label: "Rather less than I used to", score: 1 },
      { value: "2", label: "Definitely less than I used to", score: 2 },
      { value: "3", label: "Hardly at all", score: 3 },
    ],
  },
  {
    id: "epds_3", label: "3. I have blamed myself unnecessarily when things went wrong",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, most of the time", score: 3 },
      { value: "2", label: "Yes, some of the time", score: 2 },
      { value: "1", label: "Not very often", score: 1 },
      { value: "0", label: "No, never", score: 0 },
    ],
  },
  {
    id: "epds_4", label: "4. I have been anxious or worried for no good reason",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "0", label: "No, not at all", score: 0 },
      { value: "1", label: "Hardly ever", score: 1 },
      { value: "2", label: "Yes, sometimes", score: 2 },
      { value: "3", label: "Yes, very often", score: 3 },
    ],
  },
  {
    id: "epds_5", label: "5. I have felt scared or panicky for no very good reason",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, quite a lot", score: 3 },
      { value: "2", label: "Yes, sometimes", score: 2 },
      { value: "1", label: "No, not much", score: 1 },
      { value: "0", label: "No, not at all", score: 0 },
    ],
  },
  {
    id: "epds_6", label: "6. Things have been getting on top of me",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, most of the time I haven't been able to cope at all", score: 3 },
      { value: "2", label: "Yes, sometimes I haven't been coping as well as usual", score: 2 },
      { value: "1", label: "No, most of the time I have coped quite well", score: 1 },
      { value: "0", label: "No, I have been coping as well as ever", score: 0 },
    ],
  },
  {
    id: "epds_7", label: "7. I have been so unhappy that I have had difficulty sleeping",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, most of the time", score: 3 },
      { value: "2", label: "Yes, sometimes", score: 2 },
      { value: "1", label: "Not very often", score: 1 },
      { value: "0", label: "No, not at all", score: 0 },
    ],
  },
  {
    id: "epds_8", label: "8. I have felt sad or miserable",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, most of the time", score: 3 },
      { value: "2", label: "Yes, quite often", score: 2 },
      { value: "1", label: "Not very often", score: 1 },
      { value: "0", label: "No, not at all", score: 0 },
    ],
  },
  {
    id: "epds_9", label: "9. I have been so unhappy that I have been crying",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, most of the time", score: 3 },
      { value: "2", label: "Yes, quite often", score: 2 },
      { value: "1", label: "Only occasionally", score: 1 },
      { value: "0", label: "No, never", score: 0 },
    ],
  },
  {
    id: "epds_10", label: "10. The thought of harming myself has occurred to me",
    type: "select_one", required: true, section: "Past 7 days",
    options: [
      { value: "3", label: "Yes, quite often", score: 3 },
      { value: "2", label: "Sometimes", score: 2 },
      { value: "1", label: "Hardly ever", score: 1 },
      { value: "0", label: "Never", score: 0 },
    ],
  },
];

export const EPDS_DEFINITION: StandardAssessmentDefinition = {
  code: "epds",
  name: "Edinburgh Postnatal Depression Scale (EPDS)",
  shortName: "EPDS Perinatal",
  description:
    "10-item screener for depression during pregnancy and after childbirth. Answer for how you have felt in the past 7 days.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: EPDS_ITEMS,
};

// -------- PC-PTSD-5 (Primary Care PTSD Screen for DSM-5) --------
const PCPTSD_ITEMS = [
  "Had nightmares about the event(s) or thought about the event(s) when you did not want to?",
  "Tried hard not to think about the event(s) or went out of your way to avoid situations that reminded you of the event(s)?",
  "Been constantly on guard, watchful, or easily startled?",
  "Felt numb or detached from people, activities, or your surroundings?",
  "Felt guilty or unable to stop blaming yourself or others for the event(s) or any problems the event(s) may have caused?",
];

export const PCPTSD5_DEFINITION: StandardAssessmentDefinition = {
  code: "pcptsd5",
  name: "Primary Care PTSD Screen for DSM-5 (PC-PTSD-5)",
  shortName: "PC-PTSD-5",
  description:
    "5-item post-traumatic stress disorder screener. Asks whether, in the past month, the respondent has experienced reactions to a frightening or traumatic event.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: [
    {
      id: "ptsd_event",
      label: "In your life, have you ever experienced an event that was so frightening, horrible, or upsetting that, in the past month, you…",
      type: "select_one",
      required: true,
      section: "Trauma exposure",
      options: YES_NO,
    },
    ...PCPTSD_ITEMS.map((label, i) => ({
      id: `ptsd_${i + 1}`,
      label: `${i + 1}. ${label}`,
      type: "select_one" as const,
      required: true,
      options: YES_NO,
      section: "Past month",
    })),
  ],
};

// -------- MDQ (Mood Disorder Questionnaire — bipolar screen) --------
const MDQ_ITEMS = [
  "you felt so good or so hyper that other people thought you were not your normal self, or you were so hyper that you got into trouble?",
  "you were so irritable that you shouted at people or started fights or arguments?",
  "you felt much more self-confident than usual?",
  "you got much less sleep than usual and found you didn't really miss it?",
  "you were much more talkative or spoke much faster than usual?",
  "thoughts raced through your head or you couldn't slow your mind down?",
  "you were so easily distracted by things around you that you had trouble concentrating or staying on track?",
  "you had much more energy than usual?",
  "you were much more active or did many more things than usual?",
  "you were much more social or outgoing than usual?",
  "you were much more interested in sex than usual?",
  "you did things that were unusual for you or that other people might have thought were excessive, foolish, or risky?",
  "spending money got you or your family into trouble?",
];

export const MDQ_DEFINITION: StandardAssessmentDefinition = {
  code: "mdq",
  name: "Mood Disorder Questionnaire (MDQ)",
  shortName: "MDQ Bipolar",
  description:
    "Screener for bipolar spectrum disorder. Asks whether there has ever been a period when the respondent was not their usual self.",
  identification: IDENT,
  demographics: DEMO,
  psychographics: PSYCHO,
  items: MDQ_ITEMS.map((label, i) => ({
    id: `mdq_${i + 1}`,
    label: `${i + 1}. Has there ever been a period of time when you were not your usual self and… ${label}`,
    type: "select_one" as const,
    required: true,
    options: YES_NO,
    section: "Symptoms",
  })),
  closing: [
    {
      id: "mdq_same_time",
      label: "If you checked YES to more than one of the above, have several of these ever happened during the same period of time?",
      type: "select_one",
      options: YES_NO,
      section: "Clustering & impact",
    },
    {
      id: "mdq_problem",
      label: "How much of a problem did any of these cause you — like being unable to work; having family, money or legal troubles; getting into arguments or fights?",
      type: "select_one",
      section: "Clustering & impact",
      options: [
        { value: "0", label: "No problem" },
        { value: "1", label: "Minor problem" },
        { value: "2", label: "Moderate problem" },
        { value: "3", label: "Serious problem" },
      ],
    },
  ],
};


import { HFAT_ITEMS } from "./hfat.generated";
import { LFAT_ITEMS } from "./lfat.generated";

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
  ],
  psychographics: [],
  items: HFAT_ITEMS,
};

export const LFAT_DEFINITION: StandardAssessmentDefinition = {
  code: "lfat",
  name: "Lymphoedema Facility Assessment Tool (LFAT)",
  shortName: "LFAT",
  description:
    "WHO/NTD facility-level assessment for lymphoedema management services — covers trained staff, case management, education materials, medications, tracking, MMDP challenges and patient interviews.",
  identification: [
    { id: "respondent_id", label: "Assessor / Case number (optional)", type: "text", section: "Identification" },
    { id: "full_name", label: "Assessor name", type: "text", section: "Identification" },
    { id: "assessed_at", label: "Date of assessment", type: "date", required: true, section: "Identification" },
  ],
  demographics: [
    { id: "facility_name", label: "Health facility name", type: "text", required: true, section: "Facility" },
  ],
  psychographics: [],
  items: LFAT_ITEMS,
};

export const STANDARD_ASSESSMENTS: Record<StandardFormCode, StandardAssessmentDefinition> = {
  wg_ss: WG_SS_DEFINITION,
  gad_7: GAD7_DEFINITION,
  phq_9: PHQ9_DEFINITION,
  hfat: HFAT_DEFINITION,
  lfat: LFAT_DEFINITION,
  srq_20: SRQ20_DEFINITION,
  audit: AUDIT_DEFINITION,
  epds: EPDS_DEFINITION,
  pcptsd5: PCPTSD5_DEFINITION,
  mdq: MDQ_DEFINITION,
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
  if (code === "hfat" || code === "lfat") {
    return { score: 0, severity: "Facility assessment", interpretation: "Facility readiness assessment — see analytics dashboard for section-level breakdown." };
  }

  if (code === "srq_20") {
    const total = Array.from({ length: 20 }, (_, i) => parseInt(data[`srq_${i + 1}`] ?? "0", 10) || 0).reduce((a, b) => a + b, 0);
    const positive = total >= 8;
    const suicidal = (parseInt(data.srq_17 ?? "0", 10) || 0) >= 1;
    return {
      score: total,
      severity: positive ? "Probable common mental disorder" : "Below screening threshold",
      interpretation:
        (positive
          ? "Score is at or above the common cut-off (≥8). Further clinical assessment for a common mental disorder is recommended."
          : "Score is below the usual cut-off (≥8) for a common mental disorder.") +
        (suicidal ? " ⚠ Item 17 endorsed — assess suicide risk immediately." : ""),
    };
  }

  if (code === "audit") {
    const total = Array.from({ length: 10 }, (_, i) => parseInt(data[`audit_${i + 1}`] ?? "0", 10) || 0).reduce((a, b) => a + b, 0);
    const severity =
      total >= 20 ? "Possible alcohol dependence" :
      total >= 16 ? "Harmful drinking" :
      total >= 8 ? "Hazardous drinking" :
                   "Low-risk drinking";
    const interpretation =
      total >= 20 ? "Refer for diagnostic evaluation and specialist treatment for alcohol dependence."
      : total >= 16 ? "Brief counselling and continued monitoring; consider referral if no response."
      : total >= 8 ? "Simple advice on reducing hazardous drinking is recommended."
      :              "No intervention required for alcohol use.";
    return { score: total, severity, interpretation };
  }

  if (code === "epds") {
    const total = Array.from({ length: 10 }, (_, i) => parseInt(data[`epds_${i + 1}`] ?? "0", 10) || 0).reduce((a, b) => a + b, 0);
    const selfHarm = (parseInt(data.epds_10 ?? "0", 10) || 0) >= 1;
    const severity =
      total >= 13 ? "Likely depression" :
      total >= 10 ? "Possible depression" :
                    "Low likelihood of depression";
    const interpretation =
      (total >= 13 ? "Score ≥13 suggests depressive illness of varying severity — clinical assessment is recommended."
        : total >= 10 ? "Score 10–12 suggests possible depression — repeat in 2 weeks and consider further assessment."
        : "Score below the usual perinatal depression threshold.") +
      (selfHarm ? " ⚠ Item 10 endorsed — assess self-harm/suicide risk immediately." : "");
    return { score: total, severity, interpretation };
  }

  if (code === "pcptsd5") {
    const total = Array.from({ length: 5 }, (_, i) => parseInt(data[`ptsd_${i + 1}`] ?? "0", 10) || 0).reduce((a, b) => a + b, 0);
    const positive = total >= 3;
    return {
      score: total,
      severity: positive ? "Positive PTSD screen" : "Negative PTSD screen",
      interpretation: positive
        ? "3 or more symptoms endorsed — a positive screen. Further assessment for PTSD is warranted."
        : "Fewer than 3 symptoms endorsed — a negative screen for probable PTSD.",
    };
  }

  if (code === "mdq") {
    const total = Array.from({ length: 13 }, (_, i) => parseInt(data[`mdq_${i + 1}`] ?? "0", 10) || 0).reduce((a, b) => a + b, 0);
    const sameTime = (parseInt(data.mdq_same_time ?? "0", 10) || 0) >= 1;
    const problem = parseInt(data.mdq_problem ?? "0", 10) || 0;
    const positive = total >= 7 && sameTime && problem >= 2;
    return {
      score: total,
      severity: positive ? "Positive bipolar screen" : "Negative bipolar screen",
      interpretation: positive
        ? "Meets all three MDQ criteria (≥7 symptoms, occurring together, causing moderate/serious problems) — a positive screen. Further evaluation for bipolar disorder is recommended."
        : "Does not meet the full MDQ positive-screen criteria (≥7 symptoms during the same period causing moderate/serious problems).",
    };
  }

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
