// Dashboard-level access grants.
//
// Owners & admins can grant named project members access to a specific dashboard
// (e.g. the SARMAAN ACSM dashboard or the Integrated MDA Supervisory dashboard).
// This hook exposes the current user's own grants (so the app can gate a
// dashboard behind an explicit grant) and re-checks in realtime.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withTimeoutFallback } from "@/lib/withTimeout";

export interface DashboardMeta {
  id: string;
  name: string;
  /** short blurb used in the access email */
  blurb: string;
}

export const DASHBOARDS: Record<string, DashboardMeta> = {
  sairf: {
    id: "sairf",
    name: "SARMAAN ACSM Indicator Tracking Dashboard",
    blurb:
      "Real-time ACSM advocacy, town-announcer, compound-meeting and community-dialogue insights across Kano State.",
  },
  mda_supervisory: {
    id: "mda_supervisory",
    name: "Integrated MDA Supervisory Dashboard",
    blurb:
      "Live supervisory coverage, treatment status, adverse-reaction and community-visit analytics for the Integrated MDA.",
  },
  sarmaan_supervisory: {
    id: "sarmaan_supervisory",
    name: "SARMAAN Integrated Supervisory Learning Dashboard",
    blurb:
      "Real-time programme implementation supervision — coverage, quality scores, community engagement, non-compliance resolution and learning-to-action analytics.",
  },
  sarmaan_acsm: {
    id: "sarmaan_acsm",
    name: "SARMAAN ACSM & MDA Supervision Dashboard",
    blurb:
      "Live ACSM & MDA supervision analytics — coverage, supervisor accountability, thematic text intelligence and statistical insights from the ACSM & MDA Supervision Checklist.",
  },
};

interface Grant {
  dashboard_id: string;
  project_id: string | null;
}

export function useDashboardAccess() {
  const { user } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setGrants([]); setLoading(false); return; }
    const { data } = await withTimeoutFallback(
      supabase
        .from("dashboard_access")
        .select("dashboard_id, project_id")
        .eq("user_id", user.id),
      8000,
      { data: [] } as any,
    );
    setGrants((data ?? []) as Grant[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 9000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`dashboard-access-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "dashboard_access", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  const hasDashboardAccess = useCallback(
    (dashboardId: string, projectId?: string | null): boolean =>
      grants.some((g) => g.dashboard_id === dashboardId && (!g.project_id || !projectId || g.project_id === projectId)),
    [grants],
  );

  return { grants, hasDashboardAccess, loadingDashboardAccess: loading, refetchDashboardAccess: load };
}
