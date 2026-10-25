export const TARGET_POP_DISAGGREGATION_FIELDS: { key: string; label: string; field: string; mode: PopulationMode }[] = [
  { key: "total_population", label: "Whole community", field: "estimated_total_population", mode: "total" },
  { key: "children_0_4", label: "Children 0–4 years", field: "estimated_children_0_4", mode: "standard" },
  { key: "children_5_14", label: "Children 5–14 years", field: "estimated_children_5_14", mode: "standard" },
  { key: "adults_15_plus", label: "Adults 15+ years", field: "estimated_adults_15_plus", mode: "standard" },
  { key: "trachoma_0_5m", label: "0–5 months", field: "trachoma_0_5_months", mode: "trachoma" },
  { key: "trachoma_6m_6y", label: "6 months–6 years", field: "trachoma_6m_6y", mode: "trachoma" },
  { key: "trachoma_7_14y", label: "7–14 years", field: "trachoma_7_14y", mode: "trachoma" },
  { key: "trachoma_15_plus", label: "15+ years", field: "trachoma_15_plus", mode: "trachoma" },
];

export type PopulationMode = "standard" | "trachoma" | "total";
export function validTargetSelection(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length) return false;
  const definitions = value.map(key => TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === key));
  return definitions.every(Boolean) && new Set(definitions.map(f => f?.mode)).size === 1;
}
export function targetPopulation(entry: Record<string, unknown> | null | undefined, fields: string[]): number {
  if (!entry || !validTargetSelection(fields)) return 0;
  return fields.reduce((sum, key) => {
    const definition = TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === key);
    const value = definition ? Number(entry[definition.field] ?? 0) : 0;
    return sum + (Number.isFinite(value) && value >= 0 ? value : 0);
  }, 0);
}