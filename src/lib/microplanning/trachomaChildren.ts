import { TARGET_POP_DISAGGREGATION_FIELDS, validTargetSelection } from "./targetPopulation";

export function isTrachomaTarget(fields: string[]): boolean {
  return validTargetSelection(fields) && fields.every(key => TARGET_POP_DISAGGREGATION_FIELDS.find(field => field.key === key)?.mode === "trachoma");
}

/** Independent overlapping cohort: never estimate it from wider age bands. */
export function trachomaChildrenTotals(entries: Record<string, unknown>[]) {
  entries = entries.filter(entry => {
    const metadata = entry.extra_metadata;
    const marker = metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>).ame_microplan : undefined;
    if (!marker || typeof marker !== 'object') return true;
    const m = marker as Record<string, unknown>;
    if (m.measure_scope === 'settlement_rollup') return false;
    return m.kind !== 'settlement' || m.measure_scope === 'settlement';
  });
  let male = 0, female = 0, maleRecorded = 0, femaleRecorded = 0, complete = 0;
  const count = (value: unknown): number | null => {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  for (const entry of entries) {
    const m = count(entry.trachoma_1_9_male), f = count(entry.trachoma_1_9_female);
    if (m !== null) { male += m; maleRecorded++; }
    if (f !== null) { female += f; femaleRecorded++; }
    if (m !== null && f !== null) complete++;
  }
  return { male, female, total: male + female, maleRecorded, femaleRecorded, complete, communities: entries.length, anyRecorded: maleRecorded > 0 || femaleRecorded > 0 };
}