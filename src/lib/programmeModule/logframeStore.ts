// Per-project editable logframe, persisted in programme_logframes. Falls back
// to the bundled CiSKuLA-2 logframe when a project has not customised it.

import { supabase } from "@/integrations/supabase/client";
import { cachedRead, cacheSet } from "./offlineReadCache";
import { defaultLogframe, type ProjectLogframe } from "./logframe";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadProjectLogframe(projectId: string): Promise<ProjectLogframe> {
  const { data } = await cachedRead<{ data: unknown }>(`logframe:${projectId}`, () => db.from("programme_logframes").select("data").eq("project_id", projectId).maybeSingle());
  const lf = data?.data as ProjectLogframe | undefined;
  if (lf && Array.isArray(lf.objectives) && lf.project) return lf;
  return defaultLogframe();
}

export async function saveProjectLogframe(projectId: string, lf: ProjectLogframe): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("programme_logframes").upsert(
    { project_id: projectId, data: lf, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "project_id" },
  );
  if (error) throw new Error(error.message);
  void cacheSet(`logframe:${projectId}`, { data: lf });
}
