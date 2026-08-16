/**
 * Loads Geo-enabled Microplanning data for a single project so other pages
 * (e.g. the Medicine Accountability dashboard) can use the plan as a
 * denominator.
 *
 * - Projects the signed-in user may see are listed through RLS.
 * - Entries are paged (1,000 rows/request) so large projects load completely.
 * - The last successful pull is cached in localStorage, so the analysis still
 *   renders offline and instantly on the next visit.
 * - A realtime subscription refreshes the cache when new entries land.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MicroplanProjectOption {
  id: string;
  name: string;
}

export type MicroplanEntry = Record<string, unknown>;

const ENTRY_COLUMNS =
  "id, state, lga, ward, flhf_name, community_name, settlement_name, " +
  "estimated_total_population, estimated_children_0_4, estimated_children_5_14, estimated_adults_15_plus, " +
  "trachoma_0_5_months, trachoma_6m_6y, trachoma_7_14y, trachoma_15_plus, " +
  "community_distance_to_flhf_km, settlement_distance_to_flhf_km, accessibility, terrain_type, " +
  "project_id, created_at";

const PAGE_SIZE = 1000;
const cacheKey = (projectId: string) => `microplan-linkage-cache:${projectId}`;

const readCache = (projectId: string): MicroplanEntry[] | null => {
  try {
    const raw = localStorage.getItem(cacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? (parsed.rows as MicroplanEntry[]) : null;
  } catch {
    return null;
  }
};

const writeCache = (projectId: string, rows: MicroplanEntry[]) => {
  try {
    localStorage.setItem(cacheKey(projectId), JSON.stringify({ at: Date.now(), rows }));
  } catch {
    /* quota — the analysis still works from memory this session */
  }
};

/** Projects the current user can read (RLS scoped). */
export function useMicroplanProjects() {
  const [projects, setProjects] = useState<MicroplanProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      if (cancelled) return;
      const rows = (data ?? []).map((p) => ({ id: String(p.id), name: String(p.name ?? "Untitled project") }));
      setProjects(rows);
      try { localStorage.setItem("microplan-linkage-projects", JSON.stringify(rows)); } catch { /* noop */ }
      setLoading(false);
    })().catch(() => {
      // offline: fall back to the last known project list
      try {
        const raw = localStorage.getItem("microplan-linkage-projects");
        if (raw && !cancelled) setProjects(JSON.parse(raw));
      } catch { /* noop */ }
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { projects, loading };
}

/** All microplan entries for a project, cached offline and kept live. */
export function useMicroplanProjectEntries(projectId: string | null | undefined) {
  const [entries, setEntries] = useState<MicroplanEntry[]>(() => (projectId ? readCache(projectId) ?? [] : []));
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!projectId) { setEntries([]); return; }
    const req = ++reqRef.current;
    const cached = readCache(projectId);
    if (cached) { setEntries(cached); setFromCache(true); }
    setLoading(true);
    try {
      const all: MicroplanEntry[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("microplan_entries")
          .select(ENTRY_COLUMNS)
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data?.length) break;
        all.push(...(data as MicroplanEntry[]));
        if (data.length < PAGE_SIZE) break;
      }
      if (req !== reqRef.current) return;
      setEntries(all);
      setFromCache(false);
      setSyncedAt(Date.now());
      writeCache(projectId, all);
    } catch {
      if (req === reqRef.current && !cached) setEntries([]);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`microplan-linkage-${projectId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "microplan_entries", filter: `project_id=eq.${projectId}` },
        () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, load]);

  return useMemo(
    () => ({ entries, loading, fromCache, syncedAt, refresh: load }),
    [entries, loading, fromCache, syncedAt, load],
  );
}
