import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";

/**
 * Prefetch the user's accessible projects immediately after sign-in / session
 * restore and warm the same localStorage caches that ProjectsView and FormsView
 * read on mount. This makes the Forms page "All projects" dropdown render
 * instantly from cache, then update in the background once the fresh network
 * read completes.
 *
 * Cache keys (must stay in sync with the consuming components):
 *   - ProjectsView: `amehnities:projects:list:${userId}`  (full project rows)
 *   - FormsView:    `amehnities:forms:projects:${userId}`  ({ id, name })
 */
const inFlight = new Set<string>();

export async function prefetchProjects(userId?: string | null): Promise<void> {
  if (!userId || !navigator.onLine) return;
  if (inFlight.has(userId)) return;
  inFlight.add(userId);
  try {
    const { data, error } = await withTimeout(
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      12000,
      "prefetch_projects_timeout",
    );
    if (error || !data) return;

    const fullRows = data.map((project: any) => ({
      ...project,
      forms_count: project.forms_count ?? 0,
      members_count: project.members_count ?? 0,
      entries_count: project.entries_count ?? 0,
      recent_entries_count: project.recent_entries_count ?? 0,
    }));

    // Forms dropdown only needs id + name, sorted by name.
    const lite = data
      .map((p: any) => ({ id: p.id, name: p.name }))
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

    try {
      localStorage.setItem(`amehnities:projects:list:${userId}`, JSON.stringify(fullRows));
      localStorage.setItem(`amehnities:forms:projects:${userId}`, JSON.stringify(lite));
    } catch {
      /* storage may be unavailable; network reads still populate the UI */
    }
  } catch {
    /* best-effort warm cache; failures are non-fatal */
  } finally {
    inFlight.delete(userId);
  }
}
