import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSharedSetting, projectKeyFor, subscribeSharedSetting } from "@/lib/microplanning/sharedSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TARGET_POP_DISAGGREGATION_FIELDS, targetPopulation, validTargetSelection } from "@/lib/microplanning/targetPopulation";
export { TARGET_POP_DISAGGREGATION_FIELDS } from "@/lib/microplanning/targetPopulation";


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
  return validTargetSelection(arr) ? arr : fallback;
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
  const { role } = useAuth();
  const storageKey = targetPopStorageKeyFor(projectName);
  const isGiveWell = !!projectName && /givewell/i.test(projectName);
  // Stable reference: a fresh array each render caused an endless re-render loop (page freeze).
  const fallback = useMemo(() => (isGiveWell ? ["children_5_14"] : DEFAULT_TARGET_POP_FIELDS), [isGiveWell]);
  const readCurrent = useCallback(() => read(storageKey, fallback), [storageKey, fallback]);

  const [fields, setFieldsState] = useState<string[]>(readCurrent);

  // Re-read when the project changes so a switched project shows its own selection.
  useEffect(() => {
    const next = readCurrent();
    setFieldsState(prev => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
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

  // Shared configuration: Owner/Super Admin choice applies to every user.
  const projectKey = projectKeyFor(projectName);
  useEffect(() => {
    let cancelled = false;
    const apply = (raw: unknown) => {
      if (cancelled || !Array.isArray(raw)) return;
      const next = validate(raw, fallback);
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      setFieldsState(prev => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    fetchSharedSetting(projectKey, "target_pop_fields").then(apply);
    const off = subscribeSharedSetting(projectKey, "target_pop_fields", apply);
    return () => { cancelled = true; off(); };
  }, [projectKey, storageKey, fallback]);

  const setFields = useCallback(async (next: string[]) => {
    if (role !== "super_admin") throw new Error("Only Super Admins may configure Target Population.");
    if (!validTargetSelection(next)) throw new Error("Select age groups from one disaggregation only.");
    if (!projectName) {
      // No project context (e.g. Record Quality Brain): keep the device-level selection.
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        window.dispatchEvent(new Event(EVENT_NAME));
      } catch {}
      setFieldsState(next);
      return;
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Please sign in again.");
    const { data, error } = await supabase.from("microplan_project_settings").upsert(
      { project_key: projectKey, setting_key: "target_pop_fields", value: next, updated_by: auth.user.id },
      { onConflict: "project_key,setting_key" },
    ).select("value").single();
    if (error) throw error;
    if (!data || !validTargetSelection(data.value)) throw new Error("Population settings were not saved.");
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data.value));
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {}
    setFieldsState(data.value);
  }, [storageKey, projectKey, projectName, role]);

  const calcTargetPop = useCallback(
    (entry: Record<string, any> | null | undefined): number => {
      return targetPopulation(entry, fields);
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
