import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "./withTimeout";
import { fetchFormsMemberProjects, writeFormsMemberProjects } from "./formsProjectMembership";
import { isMdaChecklistLike } from "./mdaFollowUp";

/** One server-verified resolver for list, download, Dashboard and QR opening. */
export async function fetchAuthorizedForms(userId: string) {
  const projects = await fetchFormsMemberProjects(userId);
  const ids = projects.map(p => p.id);
  if (!ids.length) { writeFormsMemberProjects(userId, projects); return []; }
  const [owner, roles, direct, sarmaan, forms] = await withTimeout(Promise.all([
    supabase.rpc("is_owner_level", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("user_form_assignments").select("form_id").eq("user_id", userId),
    supabase.from("sarmaan_form_access").select("form_id").eq("user_id", userId),
    supabase.from("forms").select("*").in("project_id", ids).order("created_at", { ascending: false }),
  ]), 18000, "forms_access_timeout");
  for (const result of [owner, roles, direct, sarmaan, forms]) if (result.error) throw result.error;
  const admin = owner.data === true || (roles.data || []).some(r => r.role === "super_admin" || r.role === "systems_admin");
  const assigned = new Set([...(direct.data || []), ...(sarmaan.data || [])].map(a => a.form_id));
  const allowed = (forms.data || []).filter(f => {
    const settings = f.settings as Record<string, unknown> | null;
    const items = Array.isArray(f.questions) ? f.questions : [];
    return admin || assigned.has(f.id) || settings?.sarmaan_acsm === true || f.name === "SARMAAN ACSM Supervision Checklist" ||
      isMdaChecklistLike({ settings: settings || {}, formName: f.name, groups: items.filter(q => q && typeof q === "object" && "questions" in q) as never });
  });
  writeFormsMemberProjects(userId, projects);
  return allowed;
}