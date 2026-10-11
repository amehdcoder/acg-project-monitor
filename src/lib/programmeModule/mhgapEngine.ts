/**
 * Operational form of the WHO mhGAP Intervention Guide v2.0 (2016) for
 * non-specialist health workers: stepwise assessment, protocol selection,
 * guideline medicine tables, special populations and follow-up schedules.
 * Decision support only — clinical judgement and national protocols apply.
 */

export type MhgapModuleKey = "DEP" | "PSY" | "BPD" | "SUI" | "EPI" | "CMH" | "DEM" | "SUB" | "OTH";

export type CriterionWeight = "core" | "symptom" | "severity" | "red" | "caution" | "exclude" | "override";
export interface Criterion { id: string; text: string; weight?: CriterionWeight; step?: string }

export type DrugRole = "first" | "alternative" | "eps" | "mood" | "emergency" | "withdrawal" | "relapse" | "specialist";

export interface DrugRegimen {
  name: string;
  role: DrugRole;
  adult: string;
  older?: string;
  child?: string;
  pregnancy?: string;
  sideEffects: string;
  cautions: string;
}

export interface MhgapModule {
  key: MhgapModuleKey;
  label: string;
  short: string;
  hue: string;
  summary: string;
  criteria: Criterion[];
  psychosocial: string[];
  /** Key messages for the person and carers (psychoeducation). */
  messages: string[];
  followUp: string;
  referWhen: string[];
  regimens: DrugRegimen[];
}

export interface PatientContext {
  ageYears?: number | null;
  female?: boolean;
}

export const ESSENTIAL_CARE = [
  "Use effective communication: private space, listen, show respect, explain in plain words, involve the person in decisions.",
  "Assess physical health (history, examination, basic tests) and treat concurrent physical illness — people with MNS conditions die earlier from preventable disease.",
  "Conduct an MNS assessment: presenting complaint, past and family history, psychosocial history; check every priority condition on the master chart.",
  "Protect human rights: informed consent, no restraint, chaining or seclusion, confidentiality, avoid stigma.",
  "Promote wellbeing: sleep, physical activity, nutrition, avoid alcohol/drugs, reduce stress, strengthen social supports.",
  "Link to livelihood, education, housing and community services; support carers.",
  "Plan follow-up and continuity of care; refer when the guide says so.",
];

export const EMERGENCY_FLAGS = [
  "Medically serious act of self-harm — poisoning, bleeding, loss of consciousness (SUI Protocol 1)",
  "Imminent risk of self-harm/suicide — current thoughts or plan (SUI Protocol 2)",
  "Convulsions lasting > 5 minutes, or repeated without recovery (EPI emergency)",
  "Agitated and/or aggressive behaviour (PSY Table 5)",
  "Acute confusion / delirium — look for physical cause first",
  "Alcohol or sedative withdrawal, Wernicke's encephalopathy, opioid overdose (SUB emergency)",
];

/** Emergency medicines in the guide (EPI / SUB / SUI). */
export const EMERGENCY_MEDS = [
  { title: "Convulsions — no IV", text: "Diazepam rectally (adult 10 mg, child 1 mg/year of age) OR midazolam buccal/intranasal (adult 5–10 mg, child 0.2 mg/kg)." },
  { title: "Convulsions — IV established", text: "Normal saline slowly (30 drops/min), glucose IV (adult 5 ml 50%; child 2–5 ml/kg 10%), then diazepam 10 mg IV (child 1 mg/year) OR lorazepam 4 mg IV (child 0.1 mg/kg). Second dose if not stopped in 10 min; refer urgently." },
  { title: "Possible eclampsia", text: "Second half of pregnancy or ≤ 1 week post-partum with no epilepsy history: magnesium sulphate 10 g IM; if diastolic > 110 mmHg hydralazine 5 mg IV slowly, repeat every 30 min (max 20 mg). Refer urgently." },
  { title: "Opioid overdose", text: "Naloxone 0.4–2 mg IV/IM/SC/intranasal, repeat as needed; support breathing." },
  { title: "Wernicke's encephalopathy", text: "Thiamine 100–500 mg IV/IM 2–3 times daily for 3–5 days (prevention: 100 mg orally daily for 5 days)." },
  { title: "Pesticide poisoning", text: "Treat per WHO pesticide guidance; atropine IV for cholinergic signs, diazepam IV for seizures; activated charcoal if conscious and < 1 hour. NO forced vomiting, NO oral fluids." },
];

const SSRI_FLX: DrugRegimen = {
  name: "Fluoxetine", role: "first",
  adult: "Start 10 mg daily for 1 week, then 20 mg daily. If no response in 6 weeks increase to 40 mg (max 80 mg).",
  older: "Preferred choice. Start 10 mg daily, then 20 mg (max 40 mg).",
  child: "Adolescents ≥ 12 only: start 10 mg; 20 mg if no response in 6 weeks (max 40 mg). Review weekly for 4 weeks for suicidal thoughts.",
  pregnancy: "Avoid if possible; lowest effective dose. If breastfeeding avoid (long-acting).",
  sideEffects: "Sedation, insomnia, headache, dizziness, GI upset, appetite change, sexual dysfunction. Serious: bleeding with aspirin/NSAIDs, low sodium.",
  cautions: "Caution with history of seizure. Avoid with warfarin. Raises levels of TCAs, antipsychotics, beta-blockers; reduces effect of tamoxifen, codeine, tramadol.",
};
const TCA_AMI: DrugRegimen = {
  name: "Amitriptyline", role: "alternative",
  adult: "Start 25 mg at bedtime; increase 25–50 mg/week to 100–150 mg daily (max 300 mg). Minimum effective adult dose 75 mg.",
  older: "Avoid if possible. Start 25 mg at bedtime to 50–75 mg daily (max 100 mg).",
  child: "Do not use in children/adolescents.",
  pregnancy: "Avoid if possible.",
  sideEffects: "Sedation, postural hypotension (falls), blurred vision, urinary retention, nausea, weight gain. Serious: QTc prolongation, arrhythmia, seizures. Overdose can be fatal.",
  cautions: "Avoid in cardiac disease, seizure history, hyperthyroidism, urinary retention, glaucoma, bipolar disorder, suicide risk. Levels raised by quinine/antimalarials.",
};

const AP: DrugRegimen[] = [
  { name: "Haloperidol", role: "first", adult: "Start 1.5–3 mg daily, increase as needed (max 20 mg). Oral or IM.", older: "Use lower doses.", pregnancy: "Lowest effective dose if needed; consult specialist.", child: "Specialist only.",
    sideEffects: "Sedation, dizziness, dry mouth, constipation. Serious: postural hypotension, EPS, prolonged QT, weight gain, galactorrhoea, NMS.",
    cautions: "Caution in kidney, liver, cardiac disease, long QT. Monitor ECG if possible." },
  { name: "Risperidone", role: "first", adult: "Start 1 mg daily, increase to 2–6 mg daily (max 10 mg).", child: "Adolescents only under specialist supervision.", pregnancy: "Consult specialist.",
    sideEffects: "Sedation, dizziness, tachycardia. Serious: hypotension, weight gain, lipids/insulin resistance, EPS, raised prolactin, NMS.",
    cautions: "Caution in cardiac disease. Carbamazepine lowers levels; fluoxetine raises levels." },
  { name: "Chlorpromazine", role: "alternative", adult: "Start 25–50 mg daily, increase to 75–300 mg (up to 1000 mg in severe cases).", pregnancy: "Consult specialist.",
    sideEffects: "Sedation, dry mouth, constipation, tachycardia. Serious: hypotension, syncope, EPS, photosensitivity, agranulocytosis, jaundice, NMS.",
    cautions: "Contraindicated: impaired consciousness, bone marrow depression, phaeochromocytoma. Raises effect of BP medicines; levels raised by quinine." },
  { name: "Fluphenazine depot", role: "alternative", adult: "Start 12.5 mg IM (gluteal); then 12.5–50 mg every 2–4 weeks. Consider when oral adherence is poor.", older: "Use with caution.", child: "Do not use.", pregnancy: "Avoid.",
    sideEffects: "As chlorpromazine; EPS common.", cautions: "Contraindicated: impaired consciousness, parkinsonism. Caution in cardiac, kidney, liver disease." },
];
const ANTICHOL: DrugRegimen[] = [
  { name: "Biperiden", role: "eps", adult: "Start 1 mg twice daily, increase to 3–12 mg daily (oral or IV). Short-term use only for EPS.", pregnancy: "Avoid if possible.",
    sideEffects: "Sedation, confusion and memory disturbance (older adults), tachycardia, dry mouth, urinary retention.", cautions: "Caution in cardiac, liver, kidney disease; rarely glaucoma, myasthenia, GI obstruction." },
  { name: "Trihexyphenidyl", role: "eps", adult: "Start 1 mg daily, increase to 4–12 mg/day in 3–4 doses (max 20 mg).", pregnancy: "Avoid if possible.",
    sideEffects: "As biperiden.", cautions: "As biperiden." },
];
const MOOD: DrugRegimen[] = [
  { name: "Lithium", role: "mood", adult: "Start 300 mg daily; increase every 7 days to target level (max 600–1200 mg). Target 0.8–1.0 mEq/L acute, 0.6–0.8 maintenance. Only if lab monitoring available; check every 2–3 months.", pregnancy: "Avoid.",
    sideEffects: "Tremor, polyuria, thirst, nausea, weight gain. Serious: hypothyroidism, diabetes insipidus, arrhythmia; toxicity → seizures, delirium, death.",
    cautions: "Contraindicated in severe cardiac/kidney disease. Dehydration, NSAIDs, ACE inhibitors, thiazides, metronidazole raise levels." },
  { name: "Sodium valproate", role: "mood", adult: "Start 500 mg daily, increase slowly to 1000–2000 mg (max 60 mg/kg/day). Preferred in people living with HIV.", pregnancy: "Avoid in pregnancy and women of childbearing age where possible.",
    sideEffects: "Sedation, tremor, nausea, weight gain, hair loss. Serious: liver failure, low platelets, pancreatitis.", cautions: "Caution in liver disease; monitor LFTs and platelets. Carbamazepine lowers, aspirin raises levels." },
  { name: "Carbamazepine", role: "mood", adult: "Start 200 mg daily; increase 200 mg weekly to 400–600 mg in 2 doses (max 1200 mg). Adjust after 2 weeks (self-induction).", pregnancy: "Use with caution / avoid.",
    sideEffects: "Sedation, dizziness, ataxia, double vision. Serious: hepatotoxicity, low sodium, severe rash.", cautions: "Contraindicated with blood disorders, kidney, liver, cardiac disease. Reduces hormonal contraception, antipsychotics, ARVs, methadone." },
];
const AED: DrugRegimen[] = [
  { name: "Carbamazepine", role: "first", adult: "Start 100–200 mg daily in 2–3 doses; increase 200 mg weekly (max 1400 mg).", child: "Start 5 mg/kg/day in 2–3 doses; increase 5 mg/kg/day weekly (max 40 mg/kg or 1400 mg).", pregnancy: "Use with caution.",
    sideEffects: "Sedation, confusion, ataxia, double vision. Serious: hepatotoxicity, cardiac conduction delay, low sodium.", cautions: "Caution with blood disorders, kidney, liver, cardiac disease." },
  { name: "Phenobarbital", role: "first", adult: "Start 60 mg daily in 1–2 doses; increase weekly by 2.5–5 mg (max 180 mg).", child: "Start 2–3 mg/kg/day in 2 doses; increase 1–2 mg/kg/day weekly (max 6 mg/kg).", pregnancy: "Consult specialist.",
    sideEffects: "Sedation, hyperactivity in children, ataxia, depression. Serious: liver failure, low bone density.", cautions: "Contraindicated in acute intermittent porphyria. Lower doses in kidney/liver disease." },
  { name: "Phenytoin", role: "first", adult: "Start 150–200 mg daily in 2 doses; increase 50 mg every 3–4 weeks (max 400 mg).", child: "Start 3–4 mg/kg/day in 2 doses; increase 5 mg/kg/day every 3–4 weeks (max 300 mg).", older: "Lower doses.", pregnancy: "Avoid.",
    sideEffects: "Sedation, tremor, ataxia, slurred speech, gum hypertrophy, acne. Serious: blood disorders, hepatitis, suicidal ideation.", cautions: "Lower doses in kidney/liver disease." },
  { name: "Sodium valproate", role: "first", adult: "Start 400 mg daily in 2 doses; increase 500 mg weekly (max 3000 mg).", child: "Start 15–20 mg/kg/day in 2–3 doses; increase 15 mg/kg weekly (max 15–40 mg/kg).", older: "Lower doses.", pregnancy: "Avoid.",
    sideEffects: "Sedation, tremor, nausea, weight gain, hair loss. Serious: liver failure, low platelets, hyperammonaemic encephalopathy, pancreatitis.", cautions: "Caution in liver disease; carbamazepine lowers, aspirin raises levels." },
];
const SUBMEDS: DrugRegimen[] = [
  { name: "Diazepam", role: "withdrawal", adult: "Alcohol withdrawal / stimulant intoxication: 10–20 mg every 2 hours until features settle or lightly sedated. Outpatient: up to 10 mg four times daily, taper over 3–7 days.", older: "Single low dose 5–10 mg first (or oxazepam if liver disease).",
    sideEffects: "Sedation, respiratory depression; dependence with prolonged use.", cautions: "Do not use if sedated; avoid other sedatives; supervise dosing (diversion)." },
  { name: "Thiamine", role: "withdrawal", adult: "100 mg orally daily for 5 days to prevent Wernicke's; 100–500 mg IV/IM 2–3×/day for 3–5 days to treat.", sideEffects: "Rare.", cautions: "Give to all people with harmful alcohol use / withdrawal." },
  { name: "Naloxone", role: "emergency", adult: "Opioid overdose: 0.4–2 mg IV/IM/SC/intranasal, repeat as needed.", sideEffects: "Withdrawal symptoms.", cautions: "Short-acting — observe for re-sedation." },
  { name: "Methadone", role: "specialist", adult: "Withdrawal: 20 mg, +5–10 mg after 4 h if needed. Maintenance: 10–20 mg, increase 5–10 mg every few days until no withdrawal or illicit use.", sideEffects: "Sedation, constipation, QT prolongation, respiratory depression.", cautions: "Caution in cardiac/respiratory disease. Supervised programme." },
  { name: "Buprenorphine", role: "specialist", adult: "4–8 mg, increasing by 4–8 mg daily until no withdrawal or illicit use.", sideEffects: "Sedation, nausea, constipation, respiratory depression.", cautions: "Caution in heart failure, respiratory or liver disease; abuse potential." },
  { name: "Acamprosate", role: "relapse", adult: "2 × 333 mg three times daily for 12 months (< 60 kg: 2 tablets twice daily).", sideEffects: "Diarrhoea, nausea, pain, depression, itching.", cautions: "Lower dose in moderate kidney disease; contraindicated in severe kidney/liver disease." },
  { name: "Naltrexone", role: "relapse", adult: "50 mg daily for 6–12 months. If opioid dependent, ensure no opioid use for 7 days.", sideEffects: "Nausea, dizziness, insomnia; liver toxicity.", cautions: "Do NOT use in liver failure/acute hepatitis. Risk of fatal overdose if opioids used after stopping." },
];

export const MHGAP_MODULES: MhgapModule[] = [
  {
    key: "DEP", label: "Depression", short: "DEP", hue: "262 70% 55%",
    summary: "DEP 1: ≥ 2 weeks of depressed mood or loss of interest, plus several other symptoms, with considerable difficulty in daily functioning.",
    criteria: [
      { id: "dep_mood", step: "1 · Core", text: "Persistent depressed mood OR markedly diminished interest/pleasure for at least 2 weeks", weight: "core" },
      { id: "dep_symptoms", step: "1 · Core", text: "Several additional symptoms ≥ 2 weeks: sleep, appetite/weight, worthlessness/guilt, fatigue, poor concentration, indecisiveness, agitation, slowness, hopelessness, suicidal thoughts", weight: "core" },
      { id: "dep_function", step: "1 · Core", text: "Considerable difficulty with personal, family, social, school or work functioning", weight: "core" },
      { id: "dep_physical", step: "2 · Other explanations", text: "Physical condition that resembles/worsens depression (anaemia, malnutrition, hypothyroidism, substance or steroid effects) not yet treated", weight: "exclude" },
      { id: "dep_mania", step: "2 · Other explanations", text: "History of mania: ≥ 1 week of elevated/irritable mood, little sleep, overactivity, rapid speech, recklessness", weight: "caution" },
      { id: "dep_loss", step: "2 · Other explanations", text: "Major loss (e.g. bereavement) within the last 6 months", weight: "caution" },
      { id: "dep_override", step: "2 · Other explanations", text: "Despite loss: suicidal ideation, worthlessness, psychotic symptoms, slowed speech/movement, or previous depression", weight: "override" },
      { id: "dep_psychotic", step: "3 · Concurrent", text: "Psychotic symptoms (delusions, hallucinations) present", weight: "caution" },
      { id: "dep_suicide", step: "3 · Concurrent", text: "Imminent risk of suicide (thoughts or plan) — assess and manage SUI first", weight: "red" },
      { id: "dep_no_response", step: "4 · Response", text: "No response to psychosocial interventions / psychological treatment", weight: "severity" },
      { id: "dep_preg", step: "Special populations", text: "Pregnant or breastfeeding", weight: "caution" },
      { id: "dep_cardiac", step: "Special populations", text: "Cardiovascular disease", weight: "caution" },
    ],
    psychosocial: [
      "Psychoeducation (2.1)",
      "Reduce stress & strengthen social supports (2.2)",
      "Promote daily functioning & community life (2.3)",
      "Brief psychological treatment — IPT, CBT, behavioural activation, problem-solving / PM+ (2.4)",
      "Thinking Healthy (perinatal)",
      "Relaxation / stress management",
    ],
    messages: [
      "Depression is very common and can happen to anybody — it does not mean the person is weak or lazy.",
      "Negative thoughts about self and the future are part of depression and improve as it improves.",
      "If thoughts of self-harm come, do not act on them — tell a trusted person and come back immediately.",
      "Restart pleasurable activities, keep regular sleep, be physically active, eat regularly, spend time with trusted people.",
      "Antidepressants are not addictive, take several weeks to work, and must be taken daily.",
    ],
    followUp: "Second appointment within 1 week; then monthly for the first 3 months; then every 3 months. Continue antidepressant 9–12 months after symptoms resolve, then taper over ≥ 4 weeks.",
    referWhen: ["Depression with psychotic features", "Depressive episode in bipolar disorder (Protocol 2)", "Child/adolescent (go to CMH)", "Woman of childbearing age considering pregnancy", "No improvement after dose adjustment"],
    regimens: [SSRI_FLX, TCA_AMI],
  },
  {
    key: "PSY", label: "Psychosis", short: "PSY", hue: "199 85% 45%",
    summary: "PSY 1: delusions, hallucinations, disorganised speech or behaviour, after excluding delirium, substance use and other physical causes.",
    criteria: [
      { id: "psy_halluc", step: "1 · Core", text: "Hallucinations — hearing voices or seeing things that are not there", weight: "core" },
      { id: "psy_delusion", step: "1 · Core", text: "Delusions — fixed false beliefs not shared by others in the culture", weight: "core" },
      { id: "psy_disorg", step: "1 · Core", text: "Disorganised behaviour/speech, agitation, social withdrawal, neglect of responsibilities", weight: "core" },
      { id: "psy_organic", step: "2 · Other explanations", text: "Possible delirium, infection, head injury, drug/alcohol intoxication or withdrawal not excluded", weight: "exclude" },
      { id: "psy_agitated", step: "Emergency", text: "Agitated and/or aggressive behaviour now (Table 5)", weight: "red" },
      { id: "psy_eps", step: "Review (Table 4)", text: "Extrapyramidal side effects (stiffness, tremor, restlessness) on current antipsychotic", weight: "caution" },
      { id: "psy_adherence", step: "Review (Table 4)", text: "Poor adherence to oral medicine", weight: "caution" },
      { id: "psy_preg", step: "Special populations", text: "Pregnant or breastfeeding", weight: "caution" },
      { id: "psy_cardiac", step: "Special populations", text: "Cardiac disease / older adult", weight: "caution" },
    ],
    psychosocial: ["Psychoeducation for person and carers", "Family involvement in care plan", "Support daily routine & adherence", "Rehabilitation, independent living & work", "Calm, safe environment — no restraint"],
    messages: [
      "Psychosis is a treatable health condition, not caused by witchcraft or weakness.",
      "Taking medicine regularly prevents relapse; do not stop suddenly.",
      "Avoid alcohol and drugs; keep regular sleep and routines.",
      "Watch for early warning signs (poor sleep, withdrawal, suspiciousness) and come back early.",
    ],
    followUp: "Frequent initially; monitor weight, BP, fasting sugar and cholesterol. Continue antipsychotic at least 12 months after full remission, then reduce gradually.",
    referWhen: ["Child/adolescent", "Pregnant or breastfeeding", "No response to adequate dose of 2 antipsychotics", "Danger to self or others not settling"],
    regimens: [...AP, ...ANTICHOL],
  },
  {
    key: "BPD", label: "Bipolar disorder (mania)", short: "BPD", hue: "330 75% 52%",
    summary: "PSY 1: several manic symptoms together for ≥ 1 week — elevated/irritable mood, less need for sleep, overactivity, rapid speech, recklessness, inflated self-esteem.",
    criteria: [
      { id: "bpd_mood", step: "1 · Core", text: "Elevated, expansive or irritable mood for at least 1 week", weight: "core" },
      { id: "bpd_activity", step: "1 · Core", text: "Decreased need for sleep, increased activity/energy, rapid speech, distractibility, loss of inhibition, reckless spending/sex", weight: "core" },
      { id: "bpd_function", step: "1 · Core", text: "Severe enough to interfere with work/social life or need hospitalisation", weight: "severity" },
      { id: "bpd_on_ad", step: "2 · Medicines", text: "Currently taking an antidepressant", weight: "caution" },
      { id: "bpd_agitated", step: "Emergency", text: "Agitated and/or aggressive behaviour now", weight: "red" },
      { id: "bpd_lab", step: "2 · Medicines", text: "Lithium blood-level monitoring available", weight: "caution" },
      { id: "bpd_hiv", step: "Special populations", text: "Living with HIV", weight: "caution" },
      { id: "bpd_preg", step: "Special populations", text: "Pregnant, breastfeeding or woman of childbearing age", weight: "caution" },
    ],
    psychosocial: ["Psychoeducation & early warning signs", "Regular sleep and routines", "Avoid alcohol and drugs", "Carer support", "Relapse plan"],
    messages: [
      "Bipolar disorder causes episodes of very high and very low mood; treatment prevents relapse.",
      "Keep regular sleep — loss of sleep can trigger mania.",
      "Never take an antidepressant without a mood stabiliser.",
    ],
    followUp: "Weekly during mania; then monthly. 6 months on a mood stabiliser is needed to judge maintenance effect. Do not stop lithium suddenly.",
    referWhen: ["Lithium without lab monitoring", "Pregnancy", "Mania not responding", "Bipolar depression (antidepressant only with mood stabiliser)"],
    regimens: [...MOOD, AP[0], AP[1], AP[2], ...ANTICHOL],
  },
  {
    key: "SUI", label: "Self-harm / suicide", short: "SUI", hue: "0 80% 55%",
    summary: "SUI 1: assess everyone over 10 with thoughts, plan or act of self-harm, or with any other priority MNS condition, chronic pain or acute distress.",
    criteria: [
      { id: "sui_medical", step: "1 · Medically serious act", text: "Act of self-harm with poisoning/intoxication, bleeding wound, loss of consciousness or extreme lethargy", weight: "red" },
      { id: "sui_pesticide", step: "1 · Medically serious act", text: "Pesticide ingestion suspected", weight: "red" },
      { id: "sui_imminent", step: "2 · Imminent risk", text: "Current thoughts or plan of self-harm/suicide", weight: "red" },
      { id: "sui_hist_agitated", step: "2 · Imminent risk", text: "History of thoughts/plan (past month) or act (past year) AND now extremely agitated, violent, distressed or uncommunicative", weight: "red" },
      { id: "sui_history", step: "2 · Risk", text: "History of thoughts or plan of self-harm in the past month, or act in the past year", weight: "core" },
      { id: "sui_concurrent", step: "3 · Concurrent", text: "Concurrent depression, psychosis, substance use, epilepsy or child/adolescent disorder", weight: "caution" },
      { id: "sui_pain", step: "4 · Chronic pain", text: "Chronic pain", weight: "caution" },
      { id: "sui_emotional", step: "5 · Emotional symptoms", text: "Emotional symptoms severe enough for clinical management (difficulty functioning, repeated self-medication, marked distress)", weight: "severity" },
    ],
    psychosocial: [
      "Do NOT leave the person alone — named staff/family supervision",
      "Remove means of self-harm (pesticides, medicines, firearms)",
      "Explore reasons and ways to stay alive; focus on strengths",
      "Problem-solving therapy (act within last year)",
      "Mobilise family, friends, religious leaders, crisis services",
      "Carer support — avoid hostility and criticism",
      "Psychoeducation: talking about suicide does not provoke it",
    ],
    messages: [
      "If you have thoughts of self-harm, seek help immediately from a trusted person or health worker.",
      "It is okay to talk about suicide — talking does not provoke it. Suicides are preventable.",
      "Remove pesticides, firearms and stored medicines from the home.",
    ],
    followUp: "Contact daily/weekly for the first 2 months (phone, home visit, contact card); then every 2–4 weeks; continue for 2 years (twice in the second year). Prescribe only 1 week of medicine at a time.",
    referWhen: ["Medically serious act — treat injury/poisoning first", "Imminent risk — consult mental health specialist", "Pesticide poisoning without airway/atropine capacity — transfer immediately"],
    regimens: [],
  },
  {
    key: "EPI", label: "Epilepsy", short: "EPI", hue: "35 92% 50%",
    summary: "EPI 1: at least 2 unprovoked seizures on different days in the past 12 months, after excluding acute causes.",
    criteria: [
      { id: "epi_status", step: "Emergency", text: "Convulsing now, > 5 minutes, or repeated without regaining consciousness", weight: "red" },
      { id: "epi_eclampsia", step: "Emergency", text: "Second half of pregnancy or ≤ 1 week post-partum with no past epilepsy (suspect eclampsia)", weight: "red" },
      { id: "epi_movement", step: "1 · Convulsive", text: "Convulsive movements > 1–2 min with loss of consciousness, stiffness, tongue bite, incontinence, confusion after", weight: "core" },
      { id: "epi_two", step: "1 · Convulsive", text: "At least 2 seizures on different days in the last 12 months", weight: "core" },
      { id: "epi_acute", step: "2 · Acute cause", text: "Acute cause: fever/neuro-infection (meningitis), head injury, metabolic, alcohol/drug withdrawal", weight: "exclude" },
      { id: "epi_febrile", step: "2 · Acute cause", text: "Child 6 months–6 years with fever (febrile seizure) — manage per IMCI", weight: "exclude" },
      { id: "epi_concurrent", step: "3 · Concurrent", text: "Concurrent depression, psychosis, behavioural problems, self-harm risk", weight: "caution" },
      { id: "epi_preg", step: "Special populations", text: "Woman of childbearing age / pregnant / breastfeeding", weight: "caution" },
      { id: "epi_hiv", step: "Special populations", text: "Living with HIV (drug interactions — prefer valproate)", weight: "caution" },
    ],
    psychosocial: ["Seizure first aid for family", "Safety: avoid open fire, heights, swimming alone, driving", "Address stigma — epilepsy is not contagious", "School & work inclusion", "Adherence & seizure diary"],
    messages: [
      "Epilepsy is a brain condition, not possession or contagious; most people can be well controlled.",
      "During a seizure: lay on side, protect head, nothing in the mouth, stay until fully awake.",
      "Take medicine daily; do not stop suddenly.",
      "Seek urgent help if a seizure lasts more than 5 minutes.",
    ],
    followUp: "Every 3–6 months. If < 50% reduction: check adherence, increase dose, then switch. Consider stopping after 2 seizure-free years (taper over ≥ 2 months).",
    referWhen: ["Status epilepticus not responding to 2 doses", "Suspected eclampsia", "Neuro-infection or head injury", "Uncontrolled on 2 medicines", "Pregnancy planning"],
    regimens: AED,
  },
  {
    key: "CMH", label: "Child & adolescent conditions", short: "CMH", hue: "160 70% 40%",
    summary: "CMH 1: developmental delay, problems with overactivity/attention, repeated defiance or aggression, emotional problems; always check for maltreatment.",
    criteria: [
      { id: "cmh_dev", step: "1 · Development", text: "Delay in development for age (speech, motor, social, learning) — developmental disorder", weight: "core" },
      { id: "cmh_adhd", step: "1 · Attention", text: "Overactivity/inattention in ≥ 2 settings for ≥ 6 months interfering with functioning (ADHD)", weight: "core" },
      { id: "cmh_conduct", step: "1 · Conduct", text: "Repeated defiance, aggression, disobedience for ≥ 6 months (conduct disorder)", weight: "core" },
      { id: "cmh_emotional", step: "1 · Emotional", text: "Persistent sadness, fear, worry, withdrawal or physical complaints (emotional disorder)", weight: "core" },
      { id: "cmh_depression", step: "1 · Emotional", text: "Adolescent with moderate-severe depression not responding to psychosocial care", weight: "severity" },
      { id: "cmh_abuse", step: "2 · Environment", text: "Signs of maltreatment, abuse, neglect or bullying", weight: "red" },
      { id: "cmh_under12", step: "Age", text: "Child under 12 years", weight: "caution" },
      { id: "cmh_carer", step: "3 · Carer", text: "Carer has depression or high stress", weight: "caution" },
    ],
    psychosocial: ["Psychoeducation & parenting advice (2.2)", "Caregiver skills training", "Liaise with teachers / school (2.7)", "Carer support (2.6)", "Behavioural interventions", "Promote development: play, communication, early learning"],
    messages: [
      "Spend positive time with the child; praise good behaviour immediately.",
      "Give simple, clear instructions; avoid harsh or physical punishment.",
      "Keep consistent routines for sleep, meals and play.",
    ],
    followUp: "Monthly reviews; if adolescent on fluoxetine weekly for 4 weeks. Re-assess development and school progress.",
    referWhen: ["Any medication — specialist only (methylphenidate for ADHD ≥ 6 years)", "Abuse/neglect — activate safeguarding", "Adolescent depression needing fluoxetine", "Developmental regression"],
    regimens: [{ ...SSRI_FLX, role: "specialist" }],
  },
  {
    key: "DEM", label: "Dementia", short: "DEM", hue: "25 70% 48%",
    summary: "DEM 1: decline in memory, orientation, thinking, often with mood/behaviour change, interfering with everyday activities — usually chronic and progressive.",
    criteria: [
      { id: "dem_memory", step: "1 · Core", text: "Decline or problems with memory (especially recent) and orientation", weight: "core" },
      { id: "dem_function", step: "1 · Core", text: "Difficulty with everyday work, domestic or social activities", weight: "core" },
      { id: "dem_delirium", step: "2 · Other explanations", text: "Acute onset, fluctuating attention or consciousness (delirium) — look for physical cause", weight: "red" },
      { id: "dem_reversible", step: "2 · Other explanations", text: "Possible reversible cause (hypothyroid, B12 deficiency, depression, medicine side effects) not yet excluded", weight: "exclude" },
      { id: "dem_bpsd", step: "3 · Behaviour", text: "Behavioural or psychological symptoms (agitation, psychosis) causing risk", weight: "severity" },
      { id: "dem_carer", step: "4 · Carer", text: "Carer strain", weight: "caution" },
      { id: "dem_young", step: "Age", text: "Onset under 65 years", weight: "caution" },
    ],
    psychosocial: ["Psychoeducation for person and carer", "Cognitive stimulation & orientation", "Home safety, ADL support", "Carer support, respite, skills training", "Treat physical health, vision, hearing, pain"],
    messages: [
      "Dementia is a brain illness, not normal ageing; behaviour changes are part of the illness.",
      "Keep routines, familiar objects, calendars and clocks visible.",
      "Carers must look after their own health and seek respite.",
    ],
    followUp: "At least every 3 months: cognition, function, behaviour, physical health, carer strain.",
    referWhen: ["Onset < 65 years", "Behavioural symptoms not responding to psychosocial care (low-dose antipsychotic only with specialist)", "Cholinesterase inhibitors only where specialist monitoring exists"],
    regimens: [{ ...AP[0], role: "specialist", adult: "Only if psychosis/agitation persists despite psychosocial care: start 0.5 mg daily, lowest dose, short term.", older: "Lowest possible dose; high risk of falls and stroke." }],
  },
  {
    key: "SUB", label: "Substance use", short: "SUB", hue: "45 90% 45%",
    summary: "SUB 1: harmful use or dependence on alcohol or drugs — check emergency presentations first (intoxication, overdose, withdrawal, Wernicke's).",
    criteria: [
      { id: "sub_overdose", step: "Emergency", text: "Opioid overdose — unresponsive, pinpoint pupils, slow breathing", weight: "red" },
      { id: "sub_withdraw", step: "Emergency", text: "Alcohol/sedative withdrawal — tremor, sweating, agitation, hallucinations, seizures, delirium", weight: "red" },
      { id: "sub_wernicke", step: "Emergency", text: "Confusion, eye movement problems, unsteady gait (Wernicke's)", weight: "red" },
      { id: "sub_harm", step: "1 · Harmful use", text: "Frequent or heavy use causing physical, mental or social harm", weight: "core" },
      { id: "sub_depend", step: "1 · Dependence", text: "Strong craving, loss of control, tolerance, withdrawal, continued use despite harm", weight: "severity" },
      { id: "sub_alcohol", step: "2 · Substance", text: "Alcohol", weight: "caution" },
      { id: "sub_opioid", step: "2 · Substance", text: "Opioids", weight: "caution" },
      { id: "sub_benzo", step: "2 · Substance", text: "Benzodiazepines", weight: "caution" },
      { id: "sub_preg", step: "Special populations", text: "Pregnant or breastfeeding", weight: "caution" },
      { id: "sub_adolescent", step: "Special populations", text: "Adolescent", weight: "caution" },
    ],
    psychosocial: ["Brief motivational intervention (FRAMES)", "Harm reduction", "Mutual help groups", "Address housing, employment, family", "Psychological treatment (CBT, contingency management)", "Carer / family support"],
    messages: [
      "Reducing or stopping use improves physical health, mood, money and relationships.",
      "Never stop heavy alcohol or benzodiazepines suddenly without support — withdrawal can be dangerous.",
      "After a break, tolerance is lower — the old dose can cause fatal overdose.",
    ],
    followUp: "Frequent contact in the first weeks (detox daily); then monthly. Relapse is common — re-engage without judgement.",
    referWhen: ["Severe withdrawal, delirium or seizures", "Opioid agonist treatment (methadone/buprenorphine) programme", "Pregnancy", "Injecting use"],
    regimens: SUBMEDS,
  },
  {
    key: "OTH", label: "Other significant complaints", short: "OTH", hue: "215 25% 45%",
    summary: "OTH: distress, unexplained physical symptoms, acute or prolonged grief, or reaction to recent stress that does not meet another priority condition.",
    criteria: [
      { id: "oth_distress", step: "1 · Core", text: "Significant distress or functional difficulty not explained by another priority condition", weight: "core" },
      { id: "oth_somatic", step: "1 · Core", text: "Physical symptoms with no physical condition that fully explains them", weight: "core" },
      { id: "oth_stress", step: "2 · Recent stress", text: "Exposure to a recent extreme stressor (violence, disaster, loss)", weight: "caution" },
      { id: "oth_grief", step: "2 · Grief", text: "Grief > 6 months with intense longing, preoccupation and functional difficulty (possible prolonged grief)", weight: "caution" },
      { id: "oth_ptsd", step: "2 · Stress", text: "> 1 month after event: re-experiencing, avoidance, hyper-alertness (possible PTSD)", weight: "caution" },
    ],
    psychosocial: ["Address current psychosocial stressors", "Strengthen social supports", "Relaxation / stress management", "Acknowledge symptoms are real; explain stress–body link", "Encourage return to daily activities", "Psychological first aid"],
    messages: [
      "No serious disease has been found; the symptoms are real and linked to stress.",
      "Gradually return to normal activities and stay connected with others.",
    ],
    followUp: "Follow up in 2–4 weeks; if no improvement re-assess for depression, PTSD or other conditions.",
    referWhen: ["Suspected PTSD or prolonged grief", "No improvement after 2–4 weeks"],
    regimens: [],
  },
];

export interface DrugAdvice {
  regimen: DrugRegimen;
  allowed: boolean;
  /** Dose line chosen for this patient. */
  dose: string;
  note?: string;
}

export interface MhgapDecision {
  meets: boolean;
  medicationIndicated: boolean;
  emergency: boolean;
  level: "none" | "mild" | "moderate_severe" | "emergency";
  protocol: string;
  reasons: string[];
  cautions: string[];
  actions: string[];
  /** Suggested days until next contact. */
  followUpDays: number | null;
  /** Prescribe one week at a time (suicide risk). */
  limitedSupply: boolean;
  drugAdvice: (r: DrugRegimen) => DrugAdvice;
}

const patientDose = (r: DrugRegimen, p: PatientContext, pregnant: boolean): string => {
  const age = p.ageYears ?? null;
  if (pregnant && r.pregnancy) return `${r.adult} — Pregnancy/breastfeeding: ${r.pregnancy}`;
  if (age != null && age < 18 && r.child) return r.child;
  if (age != null && age >= 60 && r.older) return r.older;
  return r.adult;
};

/** Applies the mhGAP-IG 2.0 decision pathways for the selected module. */
export function decide(mod: MhgapModule, checked: Record<string, boolean>, phq9?: number | null, patient: PatientContext = {}): MhgapDecision {
  const c = (id: string) => !!checked[id];
  const age = patient.ageYears ?? null;
  const red = mod.criteria.some((x) => x.weight === "red" && c(x.id));
  const exclude = mod.criteria.some((x) => x.weight === "exclude" && c(x.id));
  const reasons: string[] = [];
  const cautions: string[] = [];
  const actions: string[] = [];
  const blocked = new Map<string, string>();
  let meets = false;
  let med = false;
  let protocol = "Essential care";
  let followUpDays: number | null = null;
  let limitedSupply = false;
  const pregnant = Object.keys(checked).some((k) => /_preg$/.test(k) && checked[k]);

  switch (mod.key) {
    case "DEP": {
      const core = c("dep_mood") && c("dep_symptoms") && c("dep_function");
      meets = core;
      if (!core) reasons.push("DEP 1: all three core questions must be YES — otherwise depression is unlikely (consider OTH)");
      if (core && exclude) { meets = false; reasons.push("Manage the physical condition first; reassess if depressive symptoms remain"); }
      if (meets && c("dep_loss") && !c("dep_override")) { meets = false; protocol = "OTH (grief)"; reasons.push("Major loss within 6 months without warning features — do NOT manage as depression; go to OTH"); }
      if (meets) {
        if (c("dep_mania")) {
          protocol = "DEP Protocol 2 — depression in bipolar disorder";
          cautions.push("NEVER prescribe an antidepressant alone — only with a mood stabiliser (lithium, carbamazepine, valproate). Consult a specialist.");
          ["Fluoxetine", "Amitriptyline"].forEach((n) => blocked.set(n, "Bipolar history — needs mood stabiliser cover"));
        } else protocol = "DEP Protocol 1 — depression";
        const sev = c("dep_no_response") || (phq9 != null && phq9 >= 15);
        if (phq9 != null) reasons.push(`Latest PHQ-9: ${phq9} (${phq9 >= 20 ? "severe" : phq9 >= 15 ? "moderately severe" : phq9 >= 10 ? "moderate" : phq9 >= 5 ? "mild" : "minimal"})`);
        med = sev || c("dep_suicide") ? true : (phq9 != null && phq9 >= 10);
        if (!med) reasons.push("Start with psychosocial interventions; consider antidepressant if no response");
        else reasons.push("Consider an antidepressant together with psychosocial care — decide with the person");
        if (age != null && age < 12) { med = false; protocol = "Go to CMH"; cautions.push("Under 12: do NOT prescribe antidepressants — manage under CMH"); }
        else if (age != null && age < 18) { cautions.push("Adolescent ≥ 12: fluoxetine only (no other SSRI or TCA), review weekly for 4 weeks"); blocked.set("Amitriptyline", "Not for children/adolescents"); }
        if (age != null && age >= 60) { cautions.push("Older adult: fluoxetine preferred; avoid amitriptyline"); blocked.set("Amitriptyline", "Avoid in older adults"); }
        if (c("dep_cardiac")) blocked.set("Amitriptyline", "Do NOT prescribe in cardiovascular disease");
        if (c("dep_suicide")) { limitedSupply = true; blocked.set("Amitriptyline", "TCA overdose can be fatal — SSRI first choice with suicidal thoughts"); cautions.push("Imminent suicide risk — manage SUI first; give 1 week supply, carers hold medicines"); }
        if (c("dep_preg")) { cautions.push("Pregnant/breastfeeding: avoid antidepressants if possible (esp. 1st trimester); lowest effective dose only if no response to psychological treatment; avoid fluoxetine if breastfeeding"); if (!c("dep_no_response")) med = false; }
        if (c("dep_psychotic")) cautions.push("Psychotic features — treatment must be adapted: CONSULT A SPECIALIST");
        actions.push("Psychoeducation; reduce stress; reactivate social network; promote daily activities", "Do NOT use vitamin injections or other ineffective treatments", "Start one medicine at the lowest dose; never combine antidepressants (serotonin syndrome)", "If mania develops: stop antidepressant immediately and go to PSY");
        followUpDays = 7;
      }
      break;
    }
    case "PSY": {
      const coreHit = ["psy_halluc", "psy_delusion", "psy_disorg"].filter(c).length;
      meets = coreHit >= 1;
      if (meets && exclude) { meets = false; reasons.push("PSY 1 step 2: exclude/treat delirium, infection, substances first — then reassess"); }
      if (meets) {
        protocol = "PSY Protocol 1 — psychosis";
        med = true;
        reasons.push("Start antipsychotic medication immediately, alongside psychosocial care");
        if (c("psy_eps")) { cautions.push("Table 4: reduce dose; if EPS persists switch antipsychotic; short-term anticholinergic if severe"); }
        if (c("psy_adherence")) cautions.push("Table 4: discuss reasons; consider depot (fluphenazine) after discussing side effects");
        if (c("psy_preg")) { cautions.push("Pregnant/breastfeeding: consult specialist; haloperidol lowest dose if needed"); blocked.set("Fluphenazine depot", "Avoid in pregnancy/breastfeeding"); }
        if (age != null && age < 18) { cautions.push("Child/adolescent: consult specialist; risperidone only under supervision"); blocked.set("Fluphenazine depot", "Do not use in children/adolescents"); blocked.set("Chlorpromazine", "Specialist only in children"); }
        if (c("psy_cardiac")) cautions.push("Cardiac disease/older adult: low doses, monitor ECG; caution with haloperidol and chlorpromazine");
        actions.push("Monitor weight, BP, fasting glucose, cholesterol", "Continue ≥ 12 months after remission; reduce gradually", "Anticholinergics only for EPS, not routinely");
        followUpDays = 14;
      }
      if (c("psy_agitated")) { actions.unshift("Table 5: calm, safe space, de-escalate; if needed haloperidol 2–5 mg IM (repeat after 30–60 min, max 20 mg) or diazepam 10 mg; NO restraint"); }
      break;
    }
    case "BPD": {
      meets = c("bpd_mood") && c("bpd_activity");
      if (meets) {
        protocol = "PSY Protocol 2 — bipolar disorder (manic episode)";
        med = true;
        reasons.push("Start lithium, valproate, carbamazepine or an antipsychotic; benzodiazepine short-term for behavioural disturbance");
        if (c("bpd_on_ad")) cautions.push("DISCONTINUE ANTIDEPRESSANTS now");
        if (!c("bpd_lab")) { blocked.set("Lithium", "Use only where clinical and laboratory monitoring are available"); }
        if (c("bpd_hiv")) cautions.push("Living with HIV: valproate preferred (drug interactions)");
        if (c("bpd_preg") || (patient.female && age != null && age >= 12 && age <= 50)) {
          cautions.push("Woman of childbearing age/pregnant: avoid valproate, lithium and carbamazepine if possible; consider haloperidol; consult specialist");
          if (c("bpd_preg")) ["Lithium", "Sodium valproate", "Carbamazepine"].forEach((n) => blocked.set(n, "Avoid in pregnancy/breastfeeding"));
        }
        actions.push("6 months on medicine needed to judge maintenance effect", "Stopping lithium suddenly raises relapse risk");
        followUpDays = 7;
      }
      break;
    }
    case "SUI": {
      if (c("sui_medical") || c("sui_pesticide")) {
        meets = true; protocol = "SUI Protocol 1 — medically serious act of self-harm";
        actions.push("Secure, supportive environment at a facility; do NOT leave alone", "Medically treat injury or poisoning", c("sui_pesticide") ? "Pesticide: atropine for cholinergic signs, diazepam IV for seizures, charcoal if < 1 h and conscious — NO forced vomiting, NO oral fluids; transfer if no airway capacity" : "If hospitalised, monitor closely to prevent further self-harm", "Care for the person with the same respect as any patient; consult specialist");
      } else if (c("sui_imminent") || c("sui_hist_agitated")) {
        meets = true; protocol = "SUI Protocol 2 — imminent risk of self-harm/suicide";
        actions.push("Remove means of self-harm", "Separate quiet room; never alone — assign named staff/family member", "Attend to mental state; psychoeducation; activate psychosocial support", "Consult a mental health specialist");
      } else if (c("sui_history")) {
        meets = true; protocol = "SUI Protocol 3 — risk of self-harm/suicide";
        actions.push("Offer and activate psychosocial support", "Maintain regular contact and follow-up");
      } else reasons.push("Risk of self-harm/suicide is unlikely — still manage any concurrent condition");
      if (c("sui_concurrent")) actions.push("Manage concurrent MNS conditions using their modules");
      if (c("sui_pain")) actions.push("Manage chronic pain and medical conditions");
      if (c("sui_emotional")) actions.push("Manage emotional symptoms (go to OTH if no other condition)");
      if (meets) { limitedSupply = true; followUpDays = protocol.includes("1") || protocol.includes("2") ? 1 : 7; cautions.push("Any prescription: least hazardous medicines, 1-week supply, carers keep medicines"); }
      break;
    }
    case "EPI": {
      if (c("epi_status")) actions.push("EMERGENCY: airway, recovery position, nothing in mouth; diazepam rectal 10 mg (child 1 mg/yr) or midazolam buccal; 2nd dose after 10 min; refer");
      if (c("epi_eclampsia")) actions.push("Suspect ECLAMPSIA: magnesium sulphate 10 g IM; hydralazine if diastolic > 110; refer urgently");
      meets = c("epi_movement") && c("epi_two");
      if (meets && exclude) { meets = false; reasons.push("Acute cause present — treat the cause (IMCI for febrile seizures); not epilepsy unless seizures recur without cause"); }
      if (meets) {
        protocol = "EPI Protocol — convulsive epilepsy";
        med = true;
        reasons.push("Start a single antiepileptic at low dose and increase until seizures controlled");
        if (c("epi_preg")) { cautions.push("Avoid valproate in pregnancy and women of childbearing age; avoid phenytoin in pregnancy; give folic acid 5 mg daily; deliver in hospital"); blocked.set("Sodium valproate", "Avoid in pregnancy/childbearing age"); blocked.set("Phenytoin", "Avoid in pregnancy/breastfeeding"); }
        if (c("epi_hiv")) cautions.push("HIV: valproate preferred — carbamazepine/phenytoin/phenobarbital interact with ARVs");
        actions.push("Choose by availability, cost, side effects; one medicine", "Seizure diary; first-aid teaching", "Consider withdrawal after 2 seizure-free years");
        followUpDays = 90;
      }
      if (!meets && !c("epi_status")) reasons.push("EPI 1: needs ≥ 2 unprovoked convulsive seizures on different days in 12 months");
      break;
    }
    case "CMH": {
      meets = ["cmh_dev", "cmh_adhd", "cmh_conduct", "cmh_emotional"].some(c);
      if (meets) {
        protocol = "CMH Protocol — psychosocial first";
        reasons.push("Psychosocial interventions are first line for all child & adolescent conditions");
        if (c("cmh_depression") && !(age != null && age < 12) && !c("cmh_under12")) { med = true; cautions.push("Adolescent ≥ 12 with depression: fluoxetine only, with specialist, weekly review × 4 weeks"); }
        if (c("cmh_adhd")) cautions.push("ADHD: refer to specialist for methylphenidate (≥ 6 years) only if psychosocial care fails");
        cautions.push("DO NOT prescribe medicines for developmental, conduct or emotional disorders in children");
        followUpDays = 30;
      }
      if (c("cmh_abuse")) actions.unshift("Suspected maltreatment: ensure safety, activate child protection / safeguarding, document carefully");
      if (c("cmh_carer")) actions.push("Assess and support carer's own mental health");
      break;
    }
    case "DEM": {
      meets = c("dem_memory") && c("dem_function");
      if (c("dem_delirium")) actions.unshift("Possible DELIRIUM: find and treat physical cause (infection, dehydration, medicines) urgently; refer");
      if (meets && exclude) { meets = false; reasons.push("Treat reversible causes first, then reassess cognition"); }
      if (meets) {
        protocol = "DEM Protocol — dementia";
        reasons.push("Psychosocial interventions first; no routine medicines");
        if (c("dem_bpsd")) { med = true; cautions.push("Antipsychotic only if psychosis/agitation risk persists after psychosocial care — lowest dose (haloperidol 0.5 mg), short term, specialist advice"); }
        cautions.push("Do NOT consider cholinesterase inhibitors unless specialist monitoring is available");
        followUpDays = 90;
      }
      break;
    }
    case "SUB": {
      if (c("sub_overdose")) actions.push("Opioid overdose: naloxone 0.4–2 mg, support airway/breathing, observe");
      if (c("sub_withdraw")) actions.push("Alcohol withdrawal: diazepam 10–20 mg every 2 h until settled; thiamine; fluids; treat seizures/delirium; refer if severe");
      if (c("sub_wernicke")) actions.push("Wernicke's: thiamine 100–500 mg IV/IM 2–3×/day for 3–5 days");
      meets = c("sub_harm") || c("sub_depend");
      if (meets) {
        protocol = c("sub_depend") ? "SUB Protocol — dependence" : "SUB Protocol — harmful use (brief intervention)";
        med = c("sub_depend") || red;
        if (c("sub_alcohol")) actions.push("Alcohol: thiamine to all; planned withdrawal with diazepam; relapse prevention with acamprosate or naltrexone");
        if (c("sub_opioid")) actions.push("Opioids: refer for opioid agonist maintenance (methadone/buprenorphine); offer naloxone to family");
        if (c("sub_benzo")) actions.push("Benzodiazepine dependence: switch to long-acting diazepam and taper gradually (8–12 weeks)");
        if (c("sub_preg")) cautions.push("Pregnancy: do not detox from opioids — maintain on agonist; avoid naltrexone/acamprosate; specialist");
        if (c("sub_adolescent")) cautions.push("Adolescent: family involvement; avoid medication except emergencies");
        followUpDays = c("sub_depend") ? 7 : 30;
      } else if (red) { meets = true; med = true; protocol = "SUB emergency"; }
      if (!c("sub_opioid")) ["Methadone", "Buprenorphine", "Naloxone"].forEach((n) => !c("sub_overdose") && blocked.set(n, "Only for opioid use"));
      if (!c("sub_alcohol") && !c("sub_withdraw")) ["Acamprosate"].forEach((n) => blocked.set(n, "Only for alcohol dependence"));
      if (c("sub_preg")) ["Acamprosate", "Naltrexone"].forEach((n) => blocked.set(n, "Avoid in pregnancy"));
      break;
    }
    case "OTH": {
      meets = c("oth_distress") || c("oth_somatic");
      if (meets) {
        protocol = "OTH Protocol 1";
        cautions.push("DO NOT prescribe anti-anxiety or antidepressant medicines (unless advised by a specialist)", "DO NOT give vitamin injections or other ineffective treatments");
        if (c("oth_somatic")) actions.push("Acknowledge symptoms are real; avoid unnecessary investigations; explain stress–body link");
        if (c("oth_grief") || c("oth_ptsd")) actions.push("Suspected prolonged grief / PTSD: consult a specialist for psychological treatment");
        followUpDays = 21;
      }
      break;
    }
  }

  if (meets) reasons.unshift(`${protocol}`);
  const level: MhgapDecision["level"] = red ? "emergency" : !meets ? "none" : med ? "moderate_severe" : "mild";
  return {
    meets, medicationIndicated: med, emergency: red, level, protocol, reasons, cautions, actions, followUpDays, limitedSupply,
    drugAdvice: (r) => {
      const why = blocked.get(r.name);
      const specialist = r.role === "specialist";
      return {
        regimen: r,
        allowed: !why,
        dose: patientDose(r, patient, pregnant),
        note: why || (specialist ? "Specialist-supervised only" : r.role === "eps" ? "Only for extrapyramidal side effects" : undefined),
      };
    },
  };
}

/** Age in whole years from a beneficiary profile, if known. */
export function ageFromProfile(profile: Record<string, unknown> | null | undefined): number | null {
  if (!profile) return null;
  const direct = Number(profile.age ?? profile.age_years ?? profile.Age);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const dob = (profile.date_of_birth ?? profile.dob ?? profile.birth_date) as string | undefined;
  if (dob) {
    const d = new Date(dob);
    if (!Number.isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
  }
  return null;
}

export const isFemale = (profile: Record<string, unknown> | null | undefined) =>
  /^f/i.test(String(profile?.sex ?? profile?.gender ?? ""));
