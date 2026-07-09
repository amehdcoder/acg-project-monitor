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

type ProjectLite = { id: string; name: string };
type ProjectFull = ProjectLite & Record<string, any>;

const projectListKey = (userId: string) => `amehnities:projects:list:${userId}`;
const formsProjectKey = (userId: string) => `amehnities:forms:projects:${userId}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeFullRows = (rows: any[] = []): ProjectFull[] =>
  rows.map((project: any) => ({
    ...project,
    forms_count: project.forms_count ?? 0,
    members_count: project.members_count ?? 0,
    entries_count: project.entries_count ?? 0,
    recent_entries_count: project.recent_entries_count ?? 0,
  }));

const normalizeLiteRows = (rows: any[] = []): ProjectLite[] =>
  rows
    .filter((p: any) => p?.id && p?.name)
    .map((p: any) => ({ id: p.id, name: p.name }))
    .sort((a: ProjectLite, b: ProjectLite) => (a.name || "").localeCompare(b.name || ""));

export function writeProjectCaches(userId: string, rows: any[]): void {
  try {
    const fullRows = normalizeFullRows(rows);
    const liteRows = normalizeLiteRows(rows);
    localStorage.setItem(projectListKey(userId), JSON.stringify(fullRows));
    localStorage.setItem(formsProjectKey(userId), JSON.stringify(liteRows));
  } catch {
    /* storage may be unavailable; network reads still populate the UI */
  }
}

export async function fetchProjectsWithRetry<T extends "lite" | "full">(
  mode: T,
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<T extends "lite" ? ProjectLite[] : ProjectFull[]> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 18000;
  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const query = mode === "lite"
        ? supabase.from("projects").select("id, name").order("name", { ascending: true })
        : supabase.from("projects").select("*").order("created_at", { ascending: false });
      const { data, error } = await withTimeout(query, timeoutMs, "projects_timeout");
      if (error) throw error;
      return (mode === "lite" ? normalizeLiteRows(data || []) : normalizeFullRows(data || [])) as any;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(450 * attempt);
    }
  }

  throw lastError || new Error("projects_timeout");
}

export async function prefetchProjects(userId?: string | null): Promise<void> {
  if (!userId || !navigator.onLine) return;
  if (inFlight.has(userId)) return;
  inFlight.add(userId);
  try {
    const liteRows = await fetchProjectsWithRetry("lite", { attempts: 3, timeoutMs: 18000 });
    localStorage.setItem(formsProjectKey(userId), JSON.stringify(liteRows));

    // Warm the richer Projects page cache after the dropdown cache is already
    // available, so Forms renders quickly even if the full project read is slow.
    const fullRows = await fetchProjectsWithRetry("full", { attempts: 2, timeoutMs: 18000 });
    writeProjectCaches(userId, fullRows);
  } catch {
    /* best-effort warm cache; failures are non-fatal */
  } finally {
    inFlight.delete(userId);
  }
}
