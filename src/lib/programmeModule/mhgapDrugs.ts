/**
 * Medicines from the WHO mhGAP Intervention Guide v2.0 medicine tables
 * (DEP Table 1, PSY Tables 1–3, EPI Table 1, SUB Table 1), plus commonly
 * stocked alternatives that the guide does not list (flagged inGuide=false).
 */
export const MHGAP_DRUG_CLASSES = [
  "Antidepressant",
  "Antipsychotic",
  "Anticholinergic",
  "Mood stabiliser",
  "Antiepileptic",
  "Substance use",
] as const;
export type MhgapDrugClass = (typeof MHGAP_DRUG_CLASSES)[number];

export interface MhgapDrug { name: string; drugClass: MhgapDrugClass; group: string; note: string; inGuide: boolean }

export const MHGAP_DRUGS: MhgapDrug[] = [
  { name: "Fluoxetine", drugClass: "Antidepressant", group: "SSRI", note: "mhGAP first choice; only option for adolescents ≥ 12; preferred in older adults", inGuide: true },
  { name: "Amitriptyline", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "mhGAP option; avoid in cardiac disease, older adults, suicide risk", inGuide: true },
  { name: "Sertraline", drugClass: "Antidepressant", group: "SSRI", note: "Not in mhGAP-IG 2.0 tables — specialist/national protocol", inGuide: false },
  { name: "Citalopram", drugClass: "Antidepressant", group: "SSRI", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Escitalopram", drugClass: "Antidepressant", group: "SSRI", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Paroxetine", drugClass: "Antidepressant", group: "SSRI", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Imipramine", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Clomipramine", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Nortriptyline", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Haloperidol", drugClass: "Antipsychotic", group: "First-generation", note: "mhGAP: oral or IM; also agitation (Table 5)", inGuide: true },
  { name: "Risperidone", drugClass: "Antipsychotic", group: "Second-generation", note: "mhGAP option; metabolic monitoring", inGuide: true },
  { name: "Chlorpromazine", drugClass: "Antipsychotic", group: "First-generation", note: "mhGAP option; sedating, hypotension", inGuide: true },
  { name: "Fluphenazine depot", drugClass: "Antipsychotic", group: "Long-acting injection", note: "mhGAP: for poor adherence; not in pregnancy or children", inGuide: true },
  { name: "Haloperidol decanoate", drugClass: "Antipsychotic", group: "Long-acting injection", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Olanzapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Quetiapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Aripiprazole", drugClass: "Antipsychotic", group: "Second-generation", note: "Not in mhGAP-IG 2.0 tables", inGuide: false },
  { name: "Clozapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Specialist only — treatment-resistant psychosis", inGuide: false },
  { name: "Biperiden", drugClass: "Anticholinergic", group: "For EPS", note: "mhGAP PSY Table 2 — short-term for side effects", inGuide: true },
  { name: "Trihexyphenidyl", drugClass: "Anticholinergic", group: "For EPS (benzhexol)", note: "mhGAP PSY Table 2", inGuide: true },
  { name: "Lithium", drugClass: "Mood stabiliser", group: "Bipolar", note: "Only where blood-level monitoring exists", inGuide: true },
  { name: "Sodium valproate", drugClass: "Mood stabiliser", group: "Bipolar & epilepsy", note: "Avoid in women of childbearing age; preferred with HIV", inGuide: true },
  { name: "Carbamazepine", drugClass: "Mood stabiliser", group: "Bipolar & epilepsy", note: "Many drug interactions (contraception, ARVs)", inGuide: true },
  { name: "Phenobarbital", drugClass: "Antiepileptic", group: "Epilepsy", note: "mhGAP EPI Table 1", inGuide: true },
  { name: "Phenytoin", drugClass: "Antiepileptic", group: "Epilepsy", note: "Avoid in pregnancy", inGuide: true },
  { name: "Diazepam", drugClass: "Substance use", group: "Withdrawal / seizures", note: "Alcohol withdrawal, convulsions, agitation", inGuide: true },
  { name: "Thiamine", drugClass: "Substance use", group: "Vitamin B1", note: "Prevent/treat Wernicke's encephalopathy", inGuide: true },
  { name: "Naloxone", drugClass: "Substance use", group: "Opioid antagonist", note: "Opioid overdose", inGuide: true },
  { name: "Methadone", drugClass: "Substance use", group: "Opioid agonist", note: "Supervised programme", inGuide: true },
  { name: "Buprenorphine", drugClass: "Substance use", group: "Opioid agonist", note: "Supervised programme", inGuide: true },
  { name: "Acamprosate", drugClass: "Substance use", group: "Alcohol relapse prevention", note: "12 months", inGuide: true },
  { name: "Naltrexone", drugClass: "Substance use", group: "Alcohol relapse prevention", note: "Not in liver failure", inGuide: true },
];
