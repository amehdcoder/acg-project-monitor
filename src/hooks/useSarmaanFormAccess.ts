// Per-module access grants for the SARMAAN Integrated Supervisory Checklist.
//
// Each section of the checklist is an independent, separately-submittable form.
// Owners / Co-owners / Admins may grant named project members access to specific
// modules. This hook exposes the current user's own grants (for gating the
// checklist launcher's module list) and, for managers, the full grant list.
// Access re-checks in realtime.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SarmaanGrant {
  id: string;
  form_id: string;
  section_id: string;
  user_id: string;
  project_id: string | null;
}

export function useSarmaanFormAccess(formId?: string | null, isManager = false) {
  const { user } = useAuth();
  const [grants, setGrants] = useState<SarmaanGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !formId) { setGrants([]); setLoading(false); return; }
    let q = supabase
      .from("sarmaan_form_access" as any)
      .select("id, form_id, section_id, user_id, project_id")
      .eq("form_id", formId);
    // Non-managers can only read their own rows anyway (RLS), but scope the
    // query for clarity and to reduce payload.
    if (!isManager) q = q.eq("user_id", user.id);
    const { data } = await q;
    setGrants((data as unknown as SarmaanGrant[]) ?? []);
    setLoading(false);
  }, [user?.id, formId, isManager]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!formId) return;
    const ch = supabase
      .channel(`sarmaan-access-${formId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "sarmaan_form_access", filter: `form_id=eq.${formId}` },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [formId, load]);

  /** Whether the current user may open a specific checklist module. */
  const canAccessSection = useCallback(
    (sectionId: string): boolean =>
      grants.some((g) => g.section_id === sectionId && g.user_id === user?.id),
    [grants, user?.id],
  );

  /** Does the current user have ANY module grant for this checklist? */
  const hasAnyGrant = grants.some((g) => g.user_id === user?.id);

  return { grants, canAccessSection, hasAnyGrant, loadingSarmaanAccess: loading, refetchSarmaanAccess: load };
}
