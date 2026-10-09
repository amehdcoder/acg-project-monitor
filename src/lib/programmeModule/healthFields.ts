/** Built-in health & next-of-kin details shared by the register form, record and Hand Card. */
export const BLOOD_GROUPS = [
  "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-",
  "Bombay (hh)", "Rh-null", "Unknown",
] as const;

export const HEALTH_FIELDS = [
  { key: "blood_group", label: "Blood Group", type: "blood" },
  { key: "allergies", label: "Known Allergies", type: "textarea" },
  { key: "chronic_conditions", label: "Chronic Conditions", type: "textarea" },
  { key: "medications", label: "Regular Medications", type: "textarea" },
  { key: "next_of_kin", label: "Next of Kin", type: "text" },
  { key: "next_of_kin_phone", label: "Next of Kin Phone Number", type: "tel" },
] as const;

/** Legacy keys some older forms used for the same detail. */
const ALIASES: Record<string, string[]> = {
  blood_group: ["blood_type"],
  allergies: ["known_allergies"],
  chronic_conditions: ["comorbidities"],
  medications: ["regular_medications"],
  next_of_kin: ["next_of_kin_name", "caregiver_name"],
  next_of_kin_phone: ["caregiver_phone"],
};

export const healthValue = (p: Record<string, unknown> | null | undefined, key: string): string => {
  if (!p) return "";
  for (const k of [key, ...(ALIASES[key] || [])]) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};
