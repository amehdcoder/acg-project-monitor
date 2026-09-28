import { useCallback, useEffect, useState } from "react";

export const TARGET_POP_DISAGGREGATION_FIELDS: { key: string; label: string; field: string }[] = [
  { key: "total_population", label: "Total Population (whole community)", field: "estimated_total_population" },
  { key: "children_0_4", label: "Children 0–4 yrs", field: "estimated_children_0_4" },
  { key: "children_5_14", label: "Children 5–14 yrs", field: "estimated_children_5_14" },
  { key: "adults_15_plus", label: "Adults 15+ yrs", field: "estimated_adults_15_plus" },
  { key: "trachoma_0_5m", label: "Trachoma 0–5 months", field: "trachoma_0_5_months" },
  { key: "trachoma_6m_6y", label: "Trachoma 6m–6 yrs", field: "trachoma_6m_6y" },
  { key: "trachoma_7_14y", label: "Trachoma 7–14 yrs", field: "trachoma_7_14y" },
  { key: "trachoma_15_plus", label: "Trachoma 15+ yrs", field: "trachoma_15_plus" },
];

export const DEFAULT_TARGET_POP_FIELDS = ["children_5_14", "adults_15_plus"];
export const TARGET_POP_STORAGE_KEY = "microplan-target-pop-fields";
const EVENT_NAME = "microplan-target-pop-fields:changed";

/** Per-project storage key so each project can remember its own selection. */
export const targetPopStorageKeyFor = (projectName?: string | null): string =>
  projectName ? `${TARGET_POP_STORAGE_KEY}:p:${projectName.trim().toLowerCase()}` : TARGET_POP_STORAGE_KEY;

/** GiveWell projects target the 5–14 yrs cohort by default. */
export const defaultTargetPopFieldsFor = (projectName?: string | null): string[] =>
  projectName && /givewell/i.test(projectName) ? ["children_5_14"] : DEFAULT_TARGET_POP_FIELDS;

const validate = (arr: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(arr)) return fallback;
  const valid = arr.filter((f): f is string => typeof f === "string" && TARGET_POP_DISAGGREGATION_FIELDS.some(o => o.key === f));
  return valid.length > 0 ? valid : fallback;
};

const read = (storageKey: string, fallback: string[]): string[] => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return validate(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
};

/**
 * Shared hook for the Target Population disaggregation selection.
 * Pass the project name for per-project defaults (GiveWell projects target
 * the 5–14 yrs cohort by default) and per-project persistence.
 */
export function useTargetPopFields(projectName?: string | null) {
  const storageKey = targetPopStorageKeyFor(projectName);
  const fallback = defaultTargetPopFieldsFor(projectName);
  const readCurrent = useCallback(() => read(storageKey, fallback), [storageKey, fallback]);

  const [fields, setFieldsState] = useState<string[]>(readCurrent);

  // Re-read when the project changes so a switched project shows its own selection.
  useEffect(() => {
    setFieldsState(readCurrent());
  }, [readCurrent]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) setFieldsState(readCurrent());
    };
    const onCustom = () => setFieldsState(readCurrent());
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom as EventListener);
    };
  }, [storageKey, readCurrent]);

  const setFields = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    setFieldsState(prev => {
      const value = typeof next === "function" ? (next as (p: string[]) => string[])(prev) : next;
      const cleaned = validate(value, fallback);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
        window.dispatchEvent(new Event(EVENT_NAME));
      } catch {}
      return cleaned;
    });
  }, [storageKey, fallback]);

  const calcTargetPop = useCallback(
    (entry: Record<string, any> | null | undefined): number => {
      if (!entry) return 0;
      return fields.reduce((sum, key) => {
        const def = TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === key);
        if (!def) return sum;
        const v = entry[def.field];
        return sum + (typeof v === "number" ? v : 0);
      }, 0);
    },
    [fields]
  );

  const label = fields.length === 0
    ? "None selected"
    : fields.length === TARGET_POP_DISAGGREGATION_FIELDS.length
      ? "All Disaggregations"
      : fields.map(k => TARGET_POP_DISAGGREGATION_FIELDS.find(f => f.key === k)?.label || k).join(" + ");

  return { fields, setFields, calcTargetPop, label, options: TARGET_POP_DISAGGREGATION_FIELDS };
}
