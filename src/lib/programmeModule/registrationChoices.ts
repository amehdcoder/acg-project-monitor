// Standard answer lists for the beneficiary registration form.
//
// These replace free-text boxes with controlled vocabularies so the data can be
// counted, compared and disaggregated. They are applied to the presets and, at
// load time, to registers that were created before the lists existed — an
// administrator can still edit, extend or remove any of them in the
// configurator.

import type { Question } from "@/components/FormBuilder/types";
import type { ProgrammeModuleConfig } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export const VULNERABILITY_STATUS = [
  "Internally Displaced Person (IDP)",
  "Female-Headed Household",
  "Child-Headed Household",
  "Elderly (65+) without Caregiver",
  "Person Living with Disability (PWD)",
  "Extreme Poverty / Extremely Vulnerable",
  "None / Non-Vulnerable",
];

export const PRIMARY_HEALTH_CONDITION = [
  "Lymphatic Filariasis (Lymphedema / Hydrocele)",
  "Onchocerciasis (River Blindness)",
  "Trachoma",
  "Schistosomiasis",
  "Soil-Transmitted Helminthiasis (STH)",
  "Leprosy",
  "Buruli Ulcer",
  "None / Healthy",
  "Other (Specify)",
];

export const OCCUPATION = [
  "Farmer / Agriculturalist",
  "Trader / Vendor",
  "Artisan / Craftsman",
  "Civil Servant / Salaried Worker",
  "Informal / Daily Wage Laborer",
  "Student",
  "Homemaker",
  "Unemployed",
];

export const INCOME_SOURCE = [
  "Crop Farming / Livestock",
  "Petty Business / Retail Trade",
  "Formal Salary / Wages",
  "Casual / Day Labor",
  "Remittances / Family Support",
  "Social Protection / Humanitarian Aid",
  "No Regular Income",
];

export const choiceOptions = (values: string[]) =>
  values.map((v) => ({ id: uid(), label: v, value: v }));

/** Registration fields that must be picked from a list rather than typed. */
export const REGISTRATION_CHOICES: Record<string, string[]> = {
  vulnerability_status: VULNERABILITY_STATUS,
  primary_condition: PRIMARY_HEALTH_CONDITION,
  primary_health_condition: PRIMARY_HEALTH_CONDITION,
  occupation: OCCUPATION,
  income_source: INCOME_SOURCE,
};

/** Location fields rendered as a cascading State → LGA → Ward → Community set. */
export const GEO_FIELDS = ["state", "lga", "ward", "village"];

/**
 * Upgrades a stored configuration so registers built before these lists exist
 * still collect standardised answers. Only untouched free-text boxes are
 * converted; anything an administrator already customised is left alone.
 */
export const applyRegistrationChoices = (
  config: ProgrammeModuleConfig,
): ProgrammeModuleConfig => {
  let changed = false;

  const sections = (config.sections || []).map((section) => {
    const questions: Question[] = [];
    for (const q of section.questions || []) {
      const list = q.name ? REGISTRATION_CHOICES[q.name] : undefined;
      if (list && q.type === "text" && !(q.options || []).length) {
        changed = true;
        questions.push({ ...q, type: "select_one", options: choiceOptions(list) });
      } else {
        questions.push(q);
      }

      // Free-text companion for "Other (Specify)".
      const isCondition = q.name === "primary_condition" || q.name === "primary_health_condition";
      const hasOther = (section.questions || []).some((s) => s.name === `${q.name}_other`);
      if (isCondition && !hasOther) {
        changed = true;
        questions.push({
          id: uid(),
          name: `${q.name}_other`,
          label: "Other condition (specify)",
          type: "text",
          required: false,
          relevant: `\${${q.name}} = 'Other (Specify)'`,
        });
      }
    }
    return { ...section, questions };
  });

  return changed ? { ...config, sections } : config;
};
