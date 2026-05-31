// Unified Participant Registration & Payment (UPRP) form
// Built from the XLSForm "Unified Participant Registration and Payment Form".
// Holds the choice lists, validation regexes and ODK-style relevance rules.

export interface UProOption {
  value: string;
  label: string;
}

export const TRAINING_TYPES: UProOption[] = [
  { value: "planning_meeting", label: "State Level & LGA TOT/ Planning Meeting" },
  { value: "flhf_training", label: "FLHF Training" },
  { value: "cdds_training", label: "CDDs Training" },
  { value: "adocacy", label: "Advocacy" },
];

export const DESIGNATIONS: UProOption[] = [
  { value: "state_team", label: "State Team" },
  { value: "lga_team", label: "LGA Team" },
  { value: "flhf_in_charge", label: "FLHF In-charge" },
  { value: "cdds", label: "CDDs" },
  { value: "independent_monitor", label: "Independent Monitor" },
  { value: "community_leaders", label: "Community Leaders" },
];

// LGA list from the XLSForm choices (eb3jv35).
export const LGAS: UProOption[] = [
  { value: "kura", label: "Kura" },
  { value: "sumaila", label: "Sumaila" },
];

// LGA is only relevant for these designations.
export const LGA_RELEVANT_DESIGNATIONS = new Set([
  "lga_team",
  "flhf_in_charge",
  "cdds",
  "community_leaders",
]);

export const SEXES: UProOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export const DISABILITY_TYPES: UProOption[] = [
  { value: "hearing_impairment", label: "Hearing Impairment" },
  { value: "visual_impairment", label: "Visual Impairment" },
  { value: "physically_challenged", label: "Physically Challenged" },
  { value: "lymphoedema", label: "Lymphoedema" },
  { value: "hydrocoele", label: "Hydrocoele" },
  { value: "leprosy", label: "Leprosy" },
  { value: "buruli_ulcer", label: "Buruli Ulcer" },
  { value: "others", label: "Others" },
];

export const BANKS: UProOption[] = [
  { value: "access_bank_of_nigeria_plc__diamond_bank", label: "Access Bank of Nigeria Plc (Diamond Bank Plc)" },
  { value: "ecobank_nigeria", label: "Ecobank Nigeria" },
  { value: "fidelity_bank_plc", label: "Fidelity Bank Plc" },
  { value: "first_bank_of_nigeria_plc", label: "First Bank of Nigeria Plc" },
  { value: "first_city_monument_bank__fcmb", label: "First City Monument Bank (FCMB)" },
  { value: "guaranty_trust_bank_plc__gtb", label: "Guaranty Trust Bank Plc (GTB)" },
  { value: "jaiz_bank", label: "Jaiz Bank" },
  { value: "keystone_bank_ltd", label: "Keystone Bank Ltd" },
  { value: "skye_bank_plc", label: "Skye Bank Plc" },
  { value: "stanbic_ibtc_plc", label: "Stanbic IBTC Plc" },
  { value: "sterling_bank_plc", label: "Sterling Bank Plc" },
  { value: "union_bank_nigeria_plc", label: "Union Bank Nigeria Plc" },
  { value: "united_bank_for_africa__uba", label: "United Bank for Africa (UBA)" },
  { value: "unity_bank_plc", label: "Unity Bank Plc" },
  { value: "wema_bank_plc", label: "WEMA Bank Plc" },
  { value: "zenith_bank", label: "Zenith Bank" },
  { value: "polaris_bank", label: "Polaris Bank" },
  { value: "standard_chartered_bank", label: "Standard Chartered Bank" },
  { value: "taj_bank", label: "Taj Bank" },
];

// Validation regexes straight from the XLSForm constraints.
export const PHONE_REGEX = /^\+?(0)?[789][01]\d{8}$/;
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{10}$/;

export const labelOf = (opts: UProOption[], value: string) =>
  opts.find((o) => o.value === value)?.label || value;

export interface UProParticipant {
  id: string;
  designation: string;
  lga: string;
  name: string;
  sex: string;
  phone: string;
  has_disability: string;
  disability_type: string;
  other_disability: string;
  account_name: string;
  account_number: string;
  bank_name: string;
}

export const emptyParticipant = (): UProParticipant => ({
  id: crypto.randomUUID(),
  designation: "",
  lga: "",
  name: "",
  sex: "",
  phone: "",
  has_disability: "",
  disability_type: "",
  other_disability: "",
  account_name: "",
  account_number: "",
  bank_name: "",
});

// Returns the first validation error message for a participant, or null.
export const validateParticipant = (p: UProParticipant): string | null => {
  if (!p.designation) return "Select a designation.";
  if (LGA_RELEVANT_DESIGNATIONS.has(p.designation) && !p.lga) return "Select the LGA of the participant.";
  if (!p.name.trim()) return "Enter the participant's name.";
  if (!p.sex) return "Select the participant's sex.";
  if (p.phone && !PHONE_REGEX.test(p.phone.trim())) return "Please enter a valid phone number.";
  if (!p.has_disability) return "Indicate whether the participant has a disability.";
  if (p.has_disability === "yes" && !p.disability_type) return "Select the disability type.";
  if (p.has_disability === "yes" && p.disability_type === "others" && !p.other_disability.trim())
    return "Describe the other disability type.";
  if (!p.account_name.trim()) return "Enter the account name.";
  if (p.account_name.trim().toLowerCase() !== p.name.trim().toLowerCase())
    return "The name in the attendance does not match the account name. Please ensure the account name matches the participant's name.";
  if (!ACCOUNT_NUMBER_REGEX.test(p.account_number.trim())) return "Please enter a valid 10-digit account number.";
  if (!p.bank_name) return "Select the bank name.";
  return null;
};
