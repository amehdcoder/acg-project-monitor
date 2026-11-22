import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";

export type FormsProject = { id: string; name: string };
const cacheKey = (userId: string) => `amehnities:forms:member-projects:v1:${userId}`;

export function readFormsMemberProjects(userId: string | null | undefined): FormsProject[] {
  if (!userId) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey(userId)) || "null");
    if (saved?.userId !== userId || !Array.isArray(saved.projects)) return [];
    return saved.projects.filter((p: FormsProject) => typeof p?.id === "string" && typeof p?.name === "string");
  } catch { return []; }
}

export function writeFormsMemberProjects(userId: string, projects: FormsProject[]): void {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify({ userId, projects })); }
  catch { /* Offline storage may be unavailable. */ }
}

export function memberProjectRows(rows: FormsProject[], assignments: { project_id: string }[]): FormsProject[] {
  const ids = new Set(assignments.map((a) => a.project_id));
  return rows.filter((p) => ids.has(p.id));
}

export async function fetchFormsMemberProjects(userId: string): Promise<FormsProject[]> {
  // Explicit membership applies even to administrators; general project RLS can
  // deliberately expose more projects for management outside the Forms page.
  const { data: assignments, error: assignmentError } = await withTimeout(
    supabase.from("user_project_assignments").select("project_id").eq("user_id", userId),
    18000, "forms_memberships_timeout",
  );
  if (assignmentError) throw assignmentError;
  if (!assignments?.length) return [];
  const ids = [...new Set(assignments.map((a) => a.project_id))];
  const { data, error } = await withTimeout(
    supabase.from("projects").select("id, name").in("id", ids).order("name", { ascending: true }),
    18000, "forms_member_projects_timeout",
  );
  if (error) throw error;
  return memberProjectRows(data || [], assignments);
}