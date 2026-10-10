/** WHO mhGAP Intervention Guide (v2.0) — commonly used psychotropic medicines. */
export const MHGAP_DRUG_CLASSES = ["Antidepressant", "Antipsychotic"] as const;
export type MhgapDrugClass = (typeof MHGAP_DRUG_CLASSES)[number];

export interface MhgapDrug { name: string; drugClass: MhgapDrugClass; group: string; note: string }

export const MHGAP_DRUGS: MhgapDrug[] = [
  { name: "Fluoxetine", drugClass: "Antidepressant", group: "SSRI", note: "First-line for depression; also adolescents (12+)" },
  { name: "Sertraline", drugClass: "Antidepressant", group: "SSRI", note: "Preferred in pregnancy/breastfeeding" },
  { name: "Citalopram", drugClass: "Antidepressant", group: "SSRI", note: "Alternative SSRI" },
  { name: "Escitalopram", drugClass: "Antidepressant", group: "SSRI", note: "Alternative SSRI" },
  { name: "Paroxetine", drugClass: "Antidepressant", group: "SSRI", note: "Alternative SSRI" },
  { name: "Amitriptyline", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Avoid in cardiac disease and suicide risk" },
  { name: "Imipramine", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Alternative TCA" },
  { name: "Clomipramine", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Alternative TCA" },
  { name: "Nortriptyline", drugClass: "Antidepressant", group: "Tricyclic (TCA)", note: "Better tolerated in older adults" },
  { name: "Haloperidol", drugClass: "Antipsychotic", group: "First-generation", note: "Oral or injection; monitor for EPS" },
  { name: "Chlorpromazine", drugClass: "Antipsychotic", group: "First-generation", note: "Sedating; monitor blood pressure" },
  { name: "Fluphenazine depot", drugClass: "Antipsychotic", group: "Long-acting injection", note: "For poor adherence" },
  { name: "Haloperidol decanoate", drugClass: "Antipsychotic", group: "Long-acting injection", note: "For poor adherence" },
  { name: "Risperidone", drugClass: "Antipsychotic", group: "Second-generation", note: "First-line option per mhGAP" },
  { name: "Olanzapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Monitor weight and glucose" },
  { name: "Quetiapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Sedating; bipolar disorder" },
  { name: "Aripiprazole", drugClass: "Antipsychotic", group: "Second-generation", note: "Less metabolic effect" },
  { name: "Clozapine", drugClass: "Antipsychotic", group: "Second-generation", note: "Treatment-resistant psychosis; specialist supervision" },
];
