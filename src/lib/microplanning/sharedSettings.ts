/**
 * Shared Geo Microplanning settings.
 * Owners / Co-owners / Super Admins save a project's configuration to the
 * server; every other user picks it up instantly (live updates) and keeps an
 * offline copy in localStorage. Other users' edits stay local only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const projectKeyFor = (projectName?: string | null) =>
  projectName ? `name:${projectName.trim().toLowerCase()}` : "all";

export async function fetchSharedSetting(projectKey: string, settingKey: string): Promise<unknown | undefined> {
  try {
    const { data, error } = await (supabase as any)
      .from("microplan_project_settings")
      .select("value")
      .eq("project_key", projectKey)
      .eq("setting_key", settingKey)
      .maybeSingle();
    if (error || !data) return undefined;
    return data.value;
  } catch {
    return undefined;
  }
}

export async function saveSharedSetting(projectKey: string, settingKey: string, value: unknown) {
  try {
    const { data: u } = await supabase.auth.getUser();
    await (supabase as any).from("microplan_project_settings").upsert(
      { project_key: projectKey, setting_key: settingKey, value, updated_by: u?.user?.id ?? null },
      { onConflict: "project_key,setting_key" },
    );
  } catch { /* not permitted / offline — local copy still applies */ }
}

/** Subscribe to remote changes for one setting; returns unsubscribe. */
export function subscribeSharedSetting(projectKey: string, settingKey: string, onValue: (v: unknown) => void) {
  const ch = supabase
    .channel(`mp-setting-${settingKey}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "microplan_project_settings", filter: `project_key=eq.${projectKey}` },
      (payload: any) => {
        const row = payload?.new;
        if (row && row.setting_key === settingKey) onValue(row.value);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Generic shared setting hook with localStorage mirror. */
export function useSharedMicroplanSetting<T>(
  projectKey: string,
  settingKey: string,
  fallback: T,
  validate: (v: unknown) => T | undefined,
): [T, (next: T) => void] {
  const lsKey = `microplan.shared.${projectKey}.${settingKey}`;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const readLocal = useCallback((): T => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw != null) {
        const v = validateRef.current(JSON.parse(raw));
        if (v !== undefined) return v;
      }
    } catch { /* ignore */ }
    return fallbackRef.current;
  }, [lsKey]);

  const [value, setValue] = useState<T>(readLocal);

  const apply = useCallback((raw: unknown) => {
    const v = validateRef.current(raw);
    if (v === undefined) return;
    try { localStorage.setItem(lsKey, JSON.stringify(v)); } catch { /* ignore */ }
    setValue(prev => (JSON.stringify(prev) === JSON.stringify(v) ? prev : v));
  }, [lsKey]);

  useEffect(() => {
    setValue(readLocal());
    let cancelled = false;
    fetchSharedSetting(projectKey, settingKey).then(v => { if (!cancelled && v !== undefined) apply(v); });
    const off = subscribeSharedSetting(projectKey, settingKey, apply);
    return () => { cancelled = true; off(); };
  }, [projectKey, settingKey, readLocal, apply]);

  const set = useCallback((next: T) => {
    setValue(next);
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* ignore */ }
    void saveSharedSetting(projectKey, settingKey, next);
  }, [lsKey, projectKey, settingKey]);

  return [value, set];
}

export const validNumber = (min: number, max: number) => (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
