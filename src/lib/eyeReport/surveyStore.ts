import { supabase } from "@/integrations/supabase/client";
import { cacheGetForUser, cacheSetForUser, cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { listQueued } from "@/lib/programmeModule/offlineQueue";
import { validateSurvey, type SavedSurvey } from "./surveyEvidence";
const key = (projectId: string) => `eye-who-surveys:${projectId}`;
export const savedSurveys = (projectId: string, userId: string) => cacheGetForUser<SavedSurvey[]>(userId, key(projectId));
export function overlaySurveyQueue(rows: SavedSurvey[], projectId: string, userId: string) {
  const map = new Map(rows.map(r => [r.id, r]));
  for (const item of listQueued()) {
    const op = item.payload;
    if (item.kind !== "op" || op.table !== "eye_who_surveys" || op.userId !== userId) continue;
    const values = op.values as SavedSurvey | undefined;
    if (values?.project_id === projectId && values.created_by === userId) map.set(values.id, values);
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
  const rows = overlaySurveyQueue(result.data ?? [], projectId, userId);
  if (result.data !== null) await cacheSetForUser(userId, key(projectId), rows);
  return { rows, unavailable: result.data === null, fromCache: result.fromCache };
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