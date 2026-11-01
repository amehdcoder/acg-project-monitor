import { supabase } from "@/integrations/supabase/client";
import { cachedRead, cachePatchRows, cacheGet, cacheSet } from "@/lib/programmeModule/offlineReadCache";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { validateTrajectory, type VisualTrajectory } from "./trajectory";
const key = (project: string) => `eye-trajectory:${project}`;
export async function loadTrajectories(projectId: string) {
  const result = await cachedRead<VisualTrajectory[]>(key(projectId), async () => {
    const rows: VisualTrajectory[] = [];
    for (let offset=0;;offset+=1000) {
      const {data,error} = await supabase.from("eye_visual_trajectories").select("*").eq("project_id",projectId).order("surgery_date",{ascending:false}).order("id").range(offset,offset+999);
      if (error) return { data:null,error };
      rows.push(...(data as unknown as VisualTrajectory[] ?? []));
      if (!data || data.length < 1000) return {data:rows,error:null};
    }
  },30000);
  return { rows:result.data ?? [], unavailable:result.data === null, fromCache:result.fromCache };
}
export async function importTrajectories(projectId: string, userId: string, raw: Record<string,unknown>[], existing: VisualTrajectory[]) {
  if (!raw.length || raw.length>500) throw new Error("Import between 1 and 500 surgical episodes at a time.");
  const normalized = raw.map((r,i) => { try { return validateTrajectory(r); } catch(e) { throw new Error(`Row ${i+2}: ${e instanceof Error ? e.message : "Invalid episode"}`); } });
  if (new Set(normalized.map((r)=>r.episode_key)).size !== normalized.length) throw new Error("The import contains duplicate episode keys.");
  const rows = normalized.map((r) => {
    const prior = existing.find((p)=>p.episode_key===r.episode_key);
    if (prior && prior.created_by !== userId) throw new Error("An episode in this file belongs to another reporter. Ask its reporter to update it.");
    return {...r,id:prior?.id ?? crypto.randomUUID(),project_id:projectId,created_by:userId,source:"tracker_import" as const};
  });
  const result = await offlineMutate({table:"eye_visual_trajectories",action:"batch",userId,operations:rows.map((values)=>({table:"eye_visual_trajectories",action:"upsert",values}))});
  if (await cacheGet(key(projectId))===null) await cacheSet(key(projectId),[]);
  for (const r of rows) await cachePatchRows(key(projectId),r.id,r,true);
  return result;
}