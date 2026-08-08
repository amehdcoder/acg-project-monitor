import { Eye, Ear, Accessibility, Brain, MessageSquareText, HeartHandshake, Sun, type LucideIcon } from "lucide-react";

/**
 * Disability disaggregation catalogue for the Geo Microplanning KPIs.
 * `field` maps to the `microplan_entries` column captured in the form/XLSForm.
 */
export interface DisabilityType {
  key: string;
  label: string;
  field: string;
  icon: LucideIcon;
  color: string;
}

export const DISABILITY_TYPES: DisabilityType[] = [
  { key: "visual", label: "Visual / Seeing", field: "pwd_visual", icon: Eye, color: "hsl(215, 70%, 45%)" },
  { key: "hearing", label: "Hearing", field: "pwd_hearing", icon: Ear, color: "hsl(190, 65%, 40%)" },
  { key: "physical", label: "Physical / Mobility", field: "pwd_physical", icon: Accessibility, color: "hsl(262, 55%, 52%)" },
  { key: "intellectual", label: "Intellectual / Cognitive", field: "pwd_intellectual", icon: Brain, color: "hsl(330, 60%, 50%)" },
  { key: "communication", label: "Communication / Speech", field: "pwd_communication", icon: MessageSquareText, color: "hsl(25, 75%, 48%)" },
  { key: "selfcare", label: "Self-care", field: "pwd_selfcare", icon: HeartHandshake, color: "hsl(142, 55%, 36%)" },
  { key: "albinism", label: "Albinism", field: "pwd_albinism", icon: Sun, color: "hsl(45, 85%, 45%)" },
];

export const DISABILITY_BY_KEY: Record<string, DisabilityType> = Object.fromEntries(
  DISABILITY_TYPES.map((d) => [d.key, d]),
);

export const pwdValue = (entry: Record<string, unknown> | null | undefined, field: string): number => {
  const v = entry?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

/** Total persons with disability for a row (sum of types, else recorded total). */
export const pwdTotalFor = (entry: Record<string, unknown> | null | undefined): number => {
  const sum = DISABILITY_TYPES.reduce((s, d) => s + pwdValue(entry, d.field), 0);
  if (sum > 0) return sum;
  return pwdValue(entry, "pwd_total");
};
