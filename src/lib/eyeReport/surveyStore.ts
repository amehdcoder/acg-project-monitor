import { supabase } from "@/integrations/supabase/client";
import { cacheGetForUser, cacheSetForUser, cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { listQueued } from "@/lib/programmeModule/offlineQueue";
import { validateSurvey, type SavedSurvey } from "./surveyEvidence";
const key = (projectId: string) => `eye-who-surveys:${projectId}`;
export const savedSurveys = (projectId: string, userId: string) => cacheGetForUser<SavedSurvey[]>(userId, key(projectId));
const deletedKey = (projectId: string) => `eye-who-survey-deletions:${projectId}`;
export function overlaySurveyQueue(rows: SavedSurvey[], projectId: string, userId: string, deleted: string[] = []) {
  const excluded = new Set(deleted);
  const map = new Map(rows.filter(r => !excluded.has(r.id)).map(r => [r.id, r]));
  for (const item of listQueued()) {
    const op = item.payload;
    if (item.kind !== "op" || op.table !== "eye_who_surveys" || op.userId !== userId) continue;
    const values = op.values as SavedSurvey | undefined;
    if (values?.project_id === projectId && values.created_by === userId && !excluded.has(values.id)) map.set(values.id, values);
  }
  return [...map.values()];
}
export async function loadSurveys(projectId: string, userId: string) {
  const result = await cachedRead<SavedSurvey[]>(key(projectId), async () => {
    const rows: SavedSurvey[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("eye_who_surveys").select("*").eq("project_id", projectId).order("date").order("id").range(offset, offset + 999);
      if (error) return { data: null, error };
      rows.push(...(data as SavedSurvey[]));
      if (data.length < 1000) return { data: rows, error: null };
    }
  }, 12000, userId);
  const deleted = await cachedRead<string[]>(deletedKey(projectId), async () => {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("eye_who_deleted_surveys").select("id").eq("project_id", projectId).order("id").range(offset, offset + 999);
      if (error) return { data: null, error };
      ids.push(...data.map(r => r.id));
      if (data.length < 1000) return { data: ids, error: null };
    }
  }, 12000, userId);
  const rows = overlaySurveyQueue(result.data ?? [], projectId, userId, deleted.data ?? []);
  if (result.data !== null) await cacheSetForUser(userId, key(projectId), rows);
  return { rows, unavailable: result.data === null, fromCache: result.fromCache };
}
export async function deleteSurveys(projectId: string, userId: string, ids: string[] | null) {
  if (!navigator.onLine) throw new Error("Connect to the internet to delete shared survey evidence.");
  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user.id !== userId) throw new Error("Sign in again before deleting survey evidence.");
  const { data, error } = await supabase.rpc("delete_eye_who_surveys", { _project: projectId, ...(ids === null ? {} : { _ids: ids }) });
  if (error) throw new Error(error.message);
  const deleted = data ?? [];
  const prior = await cacheGetForUser<string[]>(userId, deletedKey(projectId)) ?? [];
  await cacheSetForUser(userId, deletedKey(projectId), [...new Set([...prior, ...deleted])]);
  const cached = await savedSurveys(projectId, userId) ?? [];
  await cacheSetForUser(userId, key(projectId), cached.filter(r => !deleted.includes(r.id)));
  window.dispatchEvent(new Event("eye-survey-saved"));
  return deleted;
}
export async function saveSurvey(projectId: string, userId: string, raw: unknown, prior?: SavedSurvey) {
  const normalized = validateSurvey(raw);
  if (prior && (prior.created_by !== userId || prior.project_id !== projectId)) throw new Error("Only the survey reporter can change this evidence.");
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error("Sign in again before saving survey evidence.");
  const values: SavedSurvey = { ...normalized, id: prior?.id ?? crypto.randomUUID(), project_id: projectId, created_by: userId };
  const result = await offlineMutate({ table: "eye_who_surveys", action: prior ? "update" : "upsert", id: values.id, values, userId });
  const cached = await savedSurveys(projectId, userId) ?? [];
  await cacheSetForUser(userId, key(projectId), [...cached.filter(r => r.id !== values.id), values]);
  window.dispatchEvent(new Event("eye-survey-saved"));
  return { row: values, queued: result.queued };
}