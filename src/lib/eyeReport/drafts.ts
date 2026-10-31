import { cacheGet, cacheSet } from "@/lib/programmeModule/offlineReadCache";

// IndexedDB keeps source photos out of the small, synchronous localStorage quota.
export const loadEyeDraft = <T>(key: string) => cacheGet<T>(key);
export const saveEyeDraft = (key: string, draft: unknown) => cacheSet(key, draft);
export const clearEyeDraft = (key: string) => cacheSet(key, null);

export function restoredPatients<T>(draft: { patients?: T[] } | null, existing: T[], editing: boolean): T[] {
  return editing ? existing : Array.isArray(draft?.patients) ? draft.patients : existing;
}