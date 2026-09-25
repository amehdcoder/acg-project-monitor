import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RecordsOnlyProject {
  id: string;
  name: string;
  description: string | null;
}

const CACHE_KEY = "amehnities:records-only:projects";

/**
 * Projects that the Owner / Co-Owner has locked to the Longitudinal
 * Beneficiary Records system.
 *
 * Everyone else (Super Admin, Systems Admin, regular users) sees nothing but
 * the records system on those projects. When every project a user can reach is
 * locked, the whole app shell becomes the records workspace.
 */
export function useRecordsOnlyProjects() {
  const { user, isOwnerLevel, loading: authLoading } = useAuth();
  const [locked, setLocked] = useState<RecordsOnlyProject[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user?.id) return;
    void (async () => {
      const [{ data, error }, modules] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, description, records_only")
          .order("name", { ascending: true }),
        supabase.from("programme_modules").select("project_id").limit(5000),
      ]);
      if (cancelled) return;
      if (!error && data) {
        // Any project with Beneficiary Records configured is records-only.
        const moduleProjects = new Set(
          ((modules.data as any[]) || []).map((m) => m.project_id).filter(Boolean),
        );
        const lockedRows = data
          .filter((row: any) => row.records_only || moduleProjects.has(row.id))
          .map((row: any) => ({ id: row.id, name: row.name, description: row.description ?? null }));
        setLocked(lockedRows);
        setTotalProjects(data.length);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(lockedRows));
        } catch {
          /* storage may be unavailable */
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const lockedIds = new Set(locked.map((p) => p.id));
  /** Every project this user can reach is locked → lock the entire shell. */
  const exclusive =
    !isOwnerLevel && locked.length > 0 && totalProjects !== null && totalProjects === locked.length;

  return { locked, lockedIds, exclusive, loading, isOwnerLevel };
}
