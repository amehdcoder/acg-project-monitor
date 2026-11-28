import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "./withTimeout";
import { fetchFormsMemberProjects, writeFormsMemberProjects } from "./formsProjectMembership";
import { writeOfflineFormGrants } from "./offlineFormAccess";

/** One server-verified resolver for list, download, Dashboard and QR opening. */
export async function fetchAuthorizedForms(userId: string) {
  const projects = await fetchFormsMemberProjects(userId);
  const ids = projects.map(p => p.id);
  if (!ids.length) { writeFormsMemberProjects(userId, projects); writeOfflineFormGrants(userId, []); return []; }
  const [owner, roles, direct, sarmaan, forms] = await withTimeout(Promise.all([
    supabase.rpc("is_owner_level", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("user_form_assignments").select("form_id").eq("user_id", userId),
    supabase.from("sarmaan_form_access").select("form_id").eq("user_id", userId),
    supabase.from("forms").select("*").in("project_id", ids).order("created_at", { ascending: false }),
  ]), 18000, "forms_access_timeout");
  for (const result of [owner, roles, direct, sarmaan, forms]) if (result.error) throw result.error;
  // RLS already resolves accessible_form_ids, including all accessible project
  // forms. A second assignment-only filter dropped legitimate special forms.
  const allowed = forms.data || [];
  writeFormsMemberProjects(userId, projects);
  writeOfflineFormGrants(userId, allowed.map(f => f.id));
  return allowed;
}