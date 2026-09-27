import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GeoLockRow {
  id: string;
  project_id: string;
  user_id: string | null;
}

const MODE_KEY = "amehnities:owner-geo-mode";

/**
 * Geo Microplanning workspace lock. Owners / Super Admins can lock a whole
 * project, or chosen users on a project, to the full-screen Geo Microplanning
 * workspace. Locked users see no side menu at all.
 */
export function useGeoWorkspaceLock() {
  const { user, isOwner, isCoOwner, isSuperAdmin, loading: authLoading } = useAuth();
  const canManage = !!(isOwner || isCoOwner || isSuperAdmin);
  const [rows, setRows] = useState<GeoLockRow[]>([]);
  const [myProjects, setMyProjects] = useState<Set<string>>(new Set());
  const [ownerMode, setOwnerModeState] = useState<boolean>(() => {
    try { return localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data }, { data: assigns }] = await Promise.all([
      (supabase as any).from("microplan_workspace_locks").select("id, project_id, user_id").limit(5000),
      supabase.from("user_project_assignments").select("project_id").eq("user_id", user.id),
    ]);
    setRows((data as GeoLockRow[]) || []);
    setMyProjects(new Set(((assigns as any[]) || []).map((a) => a.project_id)));
  }, [user?.id]);

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);

  const setOwnerMode = (on: boolean) => {
    setOwnerModeState(on);
    try { localStorage.setItem(MODE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  };

  // A user is locked when targeted directly, or when a whole project they belong to is locked.
  const lockedForMe =
    !canManage &&
    rows.some((r) => r.user_id === user?.id || (r.user_id === null && myProjects.has(r.project_id)));
  const anyLocks = rows.length > 0;
  const active = lockedForMe || (canManage && anyLocks && ownerMode);

  return { rows, canManage, active, lockedForMe, anyLocks, ownerMode, setOwnerMode, reload: load };
}
