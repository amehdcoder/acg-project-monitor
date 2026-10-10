/**
 * Operational knowledge from the WHO mhGAP Intervention Guide v2.0 (2016),
 * turned into a decision engine for non-specialist health workers.
 * Decisions are support only — clinical judgement and local protocols apply.
 */

export type MhgapModuleKey = "DEP" | "PSY" | "BPD" | "SUI" | "EPI" | "CMH" | "DEM" | "SUB";

export interface Criterion { id: string; text: string; weight?: "core" | "severity" | "red" | "caution" }

export interface DrugRegimen {
  name: string;
  start: string;
  target: string;
  cautions: string;
}

export interface MhgapModule {
  key: MhgapModuleKey;
  label: string;
  short: string;
  hue: string; // HSL triple
  summary: string;
  criteria: Criterion[];
  psychosocial: string[];
  followUp: string;
  referWhen: string[];
  regimens: DrugRegimen[];
  /** Medicines in the project catalogue relevant to this module. */
  medicineClass?: "Antidepressant" | "Antipsychotic";
}

export const ESSENTIAL_CARE = [
  "Use effective communication: private space, listen, show respect, explain in plain words.",
  "Assess physical health and check for other priority MNS conditions.",
  "Protect human rights: informed consent, no restraint/chaining, involve the person in decisions.",
  "Promote wellbeing: sleep, activity, social contact, reduce stress, involve carers.",
  "Mobilise social supports and link to livelihood, education and community services.",
];

export const EMERGENCY_FLAGS = [
  "Act of self-harm with signs of poisoning, bleeding or impaired consciousness",
  "Imminent risk of suicide / current thoughts with a plan",
  "Acute agitation or aggression",
  "Convulsions or status epilepticus",
  "Delirium (acute confusion)",
  "Alcohol / sedative withdrawal with tremor or confusion",
];

export const MHGAP_MODULES: MhgapModule[] = [
  {
    key: "DEP", label: "Depression", short: "DEP", hue: "262 70% 55%",
    summary: "At least 2 weeks of depressed mood or loss of interest with difficulty in daily functioning.",
    criteria: [
      { id: "dep_mood", text: "Depressed mood or markedly reduced interest/pleasure for ≥ 2 weeks", weight: "core" },
      { id: "dep_symptoms", text: "Several other symptoms (sleep, appetite, energy, concentration, guilt, hopelessness, suicidal thoughts)", weight: "core" },
      { id: "dep_function", text: "Considerable difficulty with daily work, school, domestic or social functioning", weight: "severity" },
      { id: "dep_bereave", text: "Symptoms are a normal reaction to a recent major loss (bereavement) only", weight: "caution" },
      { id: "dep_mania", text: "History of manic episodes (elevated mood, little sleep, overactivity)", weight: "caution" },
      { id: "dep_child", text: "Person is a child under 12 years", weight: "caution" },
      { id: "dep_preg", text: "Pregnant or breastfeeding", weight: "caution" },
      { id: "dep_cardiac", text: "Cardiovascular disease or older adult", weight: "caution" },
    ],
    psychosocial: [
      "Psychoeducation: depression is common and treatable",
      "Address current psychosocial stressors",
      "Reactivate social networks; behavioural activation",
      "Structured physical activity",
      "Brief psychological treatment (problem-solving, IPT, CBT) where trained",
    ],
    followUp: "Follow up regularly (e.g. monthly in person or by phone). Continue antidepressant 9–12 months after symptoms resolve, then taper over ≥ 4 weeks.",
    referWhen: ["No improvement after adequate trial", "Child/adolescent needing medication", "Psychotic features or bipolar history"],
    medicineClass: "Antidepressant",
    regimens: [
      { name: "Fluoxetine", start: "10 mg/day for 1 week, then 20 mg/day", target: "If no response in 6 weeks increase to 40 mg (max 80 mg; older adults max 60 mg)", cautions: "Watch for agitation/mania; only antidepressant for adolescents ≥ 12 (with specialist)" },
      { name: "Sertraline", start: "25–50 mg/day", target: "Up to 200 mg/day", cautions: "Preferred option in pregnancy/breastfeeding at lowest effective dose" },
      { name: "Citalopram", start: "10–20 mg/day", target: "Up to 40 mg/day", cautions: "QT prolongation risk at higher doses" },
      { name: "Escitalopram", start: "5–10 mg/day", target: "Up to 20 mg/day", cautions: "As other SSRIs" },
      { name: "Paroxetine", start: "10–20 mg/day", target: "Up to 50 mg/day", cautions: "Discontinuation symptoms; avoid in pregnancy" },
      { name: "Amitriptyline", start: "25 mg at bedtime", target: "Increase 25–50 mg/week to 100–150 mg (max 300 mg)", cautions: "Avoid in cardiac disease, older adults, suicide risk (toxic in overdose)" },
      { name: "Imipramine", start: "25 mg/day", target: "Up to 150–300 mg/day", cautions: "As amitriptyline" },
      { name: "Clomipramine", start: "25 mg/day", target: "Up to 150–250 mg/day", cautions: "As amitriptyline" },
      { name: "Nortriptyline", start: "25 mg/day", target: "Up to 75–150 mg/day", cautions: "Better tolerated in older adults among TCAs" },
    ],
  },
  {
    key: "PSY", label: "Psychosis", short: "PSY", hue: "199 85% 45%",
    summary: "Hallucinations, delusions, disorganised behaviour or speech, often with reduced functioning.",
    criteria: [
      { id: "psy_halluc", text: "Hallucinations (hearing or seeing things others do not)", weight: "core" },
      { id: "psy_delusion", text: "Delusions (fixed false beliefs) or disorganised speech/behaviour", weight: "core" },
      { id: "psy_function", text: "Marked change in behaviour or neglect of usual responsibilities", weight: "severity" },
      { id: "psy_organic", text: "Possible physical cause (delirium, fever, drugs, alcohol withdrawal) not yet excluded", weight: "caution" },
      { id: "psy_preg", text: "Pregnant or breastfeeding", weight: "caution" },
      { id: "psy_child", text: "Child/adolescent", weight: "caution" },
    ],
    psychosocial: [
      "Psychoeducation for the person and carers",
      "Avoid restraint; keep a safe, calm environment",
      "Support adherence and daily routine",
      "Facilitate rehabilitation, independent living and work",
      "Involve family in care planning",
    ],
    followUp: "Initial follow-up every 1–2 weeks, then monthly. Continue antipsychotic at least 12 months after remission (first episode).",
    referWhen: ["Child/adolescent, pregnant or breastfeeding", "No response to 2 antipsychotics (consider clozapine – specialist)", "Danger to self or others"],
    medicineClass: "Antipsychotic",
    regimens: [
      { name: "Haloperidol", start: "1.5–3 mg/day", target: "Increase as needed up to 20 mg/day", cautions: "Extrapyramidal effects — use biperiden/trihexyphenidyl if needed" },
      { name: "Risperidone", start: "1 mg/day", target: "2–6 mg/day", cautions: "Weight gain, raised prolactin" },
      { name: "Chlorpromazine", start: "25–50 mg/day", target: "75–300 mg/day (up to 1000 mg in severe cases)", cautions: "Sedation, low blood pressure" },
      { name: "Olanzapine", start: "10 mg/day", target: "10–20 mg/day", cautions: "Monitor weight, glucose and lipids" },
      { name: "Quetiapine", start: "50 mg/day", target: "300–750 mg/day", cautions: "Sedating; metabolic monitoring" },
      { name: "Aripiprazole", start: "10 mg/day", target: "10–30 mg/day", cautions: "Restlessness (akathisia)" },
      { name: "Fluphenazine depot", start: "12.5 mg IM", target: "12.5–50 mg every 2–4 weeks", cautions: "Only after oral tolerability; for poor adherence" },
      { name: "Haloperidol decanoate", start: "50 mg IM", target: "50–300 mg every 4 weeks", cautions: "Only after oral tolerability; for poor adherence" },
      { name: "Clozapine", start: "Specialist only", target: "Specialist titration", cautions: "Treatment-resistant psychosis; blood monitoring required" },
    ],
  },
  {
    key: "BPD", label: "Bipolar disorder (mania)", short: "BPD", hue: "330 75% 52%",
    summary: "Episodes of elevated or irritable mood, overactivity, reduced need for sleep, sometimes alternating with depression.",
    criteria: [
      { id: "bpd_mood", text: "Elevated, expansive or irritable mood for ≥ 1 week", weight: "core" },
      { id: "bpd_activity", text: "Increased activity, rapid speech, reduced need for sleep, reckless behaviour", weight: "core" },
      { id: "bpd_function", text: "Behaviour seriously disrupts daily functioning or puts the person at risk", weight: "severity" },
      { id: "bpd_on_ad", text: "Currently taking an antidepressant", weight: "caution" },
      { id: "bpd_preg", text: "Pregnant or breastfeeding / woman of childbearing age", weight: "caution" },
    ],
    psychosocial: ["Psychoeducation and early warning signs", "Regular sleep and routines", "Avoid alcohol and drugs", "Support for carers"],
    followUp: "Weekly during acute mania, then monthly. Long-term maintenance with mood stabiliser per specialist.",
    referWhen: ["Need for lithium/valproate (needs monitoring)", "Pregnancy", "Severe mania with risk"],
    medicineClass: "Antipsychotic",
    regimens: [
      { name: "Haloperidol", start: "1.5–3 mg/day", target: "Up to 15–20 mg/day for mania", cautions: "Stop antidepressants" },
      { name: "Risperidone", start: "1–2 mg/day", target: "Up to 6 mg/day", cautions: "Stop antidepressants" },
      { name: "Olanzapine", start: "10 mg/day", target: "Up to 20 mg/day", cautions: "Metabolic monitoring" },
      { name: "Quetiapine", start: "50 mg/day", target: "Up to 800 mg/day", cautions: "Sedating" },
    ],
  },
  {
    key: "SUI", label: "Self-harm / suicide", short: "SUI", hue: "0 80% 55%",
    summary: "Current thoughts, plans or acts of self-harm, or history of self-harm with ongoing distress.",
    criteria: [
      { id: "sui_act", text: "Serious act of self-harm with medical injury or poisoning", weight: "red" },
      { id: "sui_plan", text: "Current thoughts or plan of self-harm/suicide", weight: "red" },
      { id: "sui_history", text: "History of thoughts or acts of self-harm in the past month", weight: "core" },
      { id: "sui_distress", text: "Severe emotional distress, hopelessness or agitation", weight: "severity" },
    ],
    psychosocial: [
      "Never leave a person at imminent risk alone",
      "Remove access to means (pesticides, medicines, weapons)",
      "Mobilise family/friends to monitor; give crisis contact",
      "Treat any underlying priority MNS condition",
      "Dispense only small supplies of medicine; prefer SSRI over TCA",
    ],
    followUp: "Maintain regular contact: weekly for the first 2 months, then less often as the person improves.",
    referWhen: ["Imminent risk", "Medical injury or poisoning (treat medically first)"],
    regimens: [],
  },
  {
    key: "EPI", label: "Epilepsy", short: "EPI", hue: "35 92% 50%",
    summary: "Recurrent unprovoked convulsive seizures (≥ 2 in 12 months).",
    criteria: [
      { id: "epi_seizures", text: "≥ 2 unprovoked convulsive seizures on different days in the past 12 months", weight: "core" },
      { id: "epi_status", text: "Seizure ongoing > 5 minutes or not regaining consciousness", weight: "red" },
      { id: "epi_acute", text: "Seizure explained by acute cause (fever, infection, head injury, alcohol)", weight: "caution" },
    ],
    psychosocial: ["Seizure first aid for family", "Avoid open fire, swimming alone, heights", "Address stigma; school and work inclusion"],
    followUp: "Every 3 months; consider withdrawal after 2 seizure-free years.",
    referWhen: ["Status epilepticus", "Seizures uncontrolled on 2 medicines", "Pregnancy planning"],
    regimens: [],
  },
  {
    key: "CMH", label: "Child & adolescent conditions", short: "CMH", hue: "160 70% 40%",
    summary: "Developmental, behavioural or emotional disorders in children and adolescents.",
    criteria: [
      { id: "cmh_dev", text: "Delay in development (speech, movement, learning) for age", weight: "core" },
      { id: "cmh_behav", text: "Persistent overactivity, inattention, aggression or defiance", weight: "core" },
      { id: "cmh_emo", text: "Persistent sadness, fear, withdrawal or avoidance", weight: "core" },
      { id: "cmh_abuse", text: "Signs of abuse, neglect or maltreatment", weight: "red" },
    ],
    psychosocial: ["Caregiver skills training", "Liaise with school", "Parenting stress support", "Psychoeducation"],
    followUp: "Monthly review; medicines only via specialist.",
    referWhen: ["Any medication consideration", "Suspected abuse — follow safeguarding"],
    regimens: [],
  },
  {
    key: "DEM", label: "Dementia", short: "DEM", hue: "25 70% 48%",
    summary: "Progressive decline in memory and thinking affecting daily activities, usually in older adults.",
    criteria: [
      { id: "dem_memory", text: "Decline in memory, orientation or thinking", weight: "core" },
      { id: "dem_function", text: "Difficulty carrying out everyday activities", weight: "severity" },
      { id: "dem_acute", text: "Sudden onset or fluctuating confusion (possible delirium)", weight: "red" },
    ],
    psychosocial: ["Support carers; respite", "Orientation and safety at home", "Treat physical health problems"],
    followUp: "Every 3 months.",
    referWhen: ["Behavioural symptoms not responding", "Under 65 years"],
    regimens: [],
  },
  {
    key: "SUB", label: "Substance use", short: "SUB", hue: "45 90% 45%",
    summary: "Harmful use of or dependence on alcohol or drugs.",
    criteria: [
      { id: "sub_use", text: "Frequent or heavy use causing health or social harm", weight: "core" },
      { id: "sub_depend", text: "Strong craving, loss of control, continued use despite harm", weight: "severity" },
      { id: "sub_withdraw", text: "Withdrawal (tremor, sweating, confusion, seizures)", weight: "red" },
    ],
    psychosocial: ["Brief intervention (motivational)", "Harm reduction", "Mutual help groups", "Address family and housing needs"],
    followUp: "Frequent contact during first weeks; monthly thereafter.",
    referWhen: ["Severe withdrawal or delirium", "Injecting use", "Pregnancy"],
    regimens: [],
  },
];

export interface MhgapDecision {
  meets: boolean;
  medicationIndicated: boolean;
  emergency: boolean;
  level: "none" | "mild" | "moderate_severe" | "emergency";
  reasons: string[];
  cautions: string[];
}

/** Applies the mhGAP decision logic for the selected module. */
export function decide(mod: MhgapModule, checked: Record<string, boolean>, phq9?: number | null): MhgapDecision {
  const c = (id: string) => !!checked[id];
  const core = mod.criteria.filter((x) => x.weight === "core");
  const coreHit = core.filter((x) => c(x.id)).length;
  const severity = mod.criteria.some((x) => x.weight === "severity" && c(x.id));
  const red = mod.criteria.some((x) => x.weight === "red" && c(x.id));
  const reasons: string[] = [];
  const cautions: string[] = [];
  let meets = false;
  let med = false;

  switch (mod.key) {
    case "DEP": {
      meets = c("dep_mood") && c("dep_symptoms");
      const sev = severity || (phq9 != null && phq9 >= 10);
      if (phq9 != null) reasons.push(`Latest PHQ-9 score: ${phq9}${phq9 >= 10 ? " (moderate or higher)" : ""}`);
      if (meets && c("dep_bereave")) { meets = false; reasons.push("Normal bereavement — no antidepressant; give support"); }
      med = meets && sev;
      if (c("dep_mania")) { med = false; cautions.push("Bipolar history: do NOT give an antidepressant alone — use the Bipolar module"); }
      if (c("dep_child")) { med = false; cautions.push("Under 12 years: antidepressants are not recommended"); }
      if (c("dep_preg")) cautions.push("Pregnancy/breastfeeding: avoid if possible; if needed use the lowest dose SSRI (sertraline/fluoxetine) and consult a specialist");
      if (c("dep_cardiac")) cautions.push("Cardiac disease/older adult: avoid amitriptyline and other TCAs");
      if (meets && !med && !c("dep_mania") && !c("dep_child")) reasons.push("Mild depression — psychosocial interventions first, no antidepressant");
      break;
    }
    case "PSY":
      meets = coreHit >= 1;
      med = meets;
      if (c("psy_organic")) { med = false; cautions.push("Exclude and treat physical causes (delirium, infection, substances) before antipsychotics"); }
      if (c("psy_preg")) cautions.push("Pregnancy/breastfeeding: consult a specialist; use the lowest effective dose of haloperidol if needed");
      if (c("psy_child")) cautions.push("Adolescents: risperidone only with specialist supervision");
      break;
    case "BPD":
      meets = c("bpd_mood") && c("bpd_activity");
      med = meets;
      if (c("bpd_on_ad")) cautions.push("Stop the antidepressant immediately to prevent worsening mania");
      if (c("bpd_preg")) cautions.push("Avoid valproate in women of childbearing age; consult a specialist");
      break;
    default:
      meets = coreHit >= 1 || red;
      med = false;
      if (meets) reasons.push("Medicine choice for this condition needs the full mhGAP module/specialist — not in this project's registered catalogue");
  }
  if (meets) reasons.unshift(`Criteria met for ${mod.label}`);
  const level: MhgapDecision["level"] = red ? "emergency" : !meets ? "none" : med || severity ? "moderate_severe" : "mild";
  return { meets, medicationIndicated: med && !red ? true : med, emergency: red, level, reasons, cautions };
}
