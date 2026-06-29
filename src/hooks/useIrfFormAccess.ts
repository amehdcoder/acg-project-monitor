import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface IrfGrant {
  id: string;
  project_id: string | null;
  form_category: string;
  grant_type: "user" | "designation";
  user_id: string | null;
  designation: string | null;
  created_at: string;
}

/**
 * Resolves which LGA ACSM activity forms the current user may open, and whether
 * they may manage grants (Owner / Co-owner / admin). Grants are readable by all
 * authenticated users, so access is computed client-side against the user's own
 * profile (user_id + designation).
 */
export const useIrfFormAccess = (projectId?: string | null) => {
  const { user } = useAuth();
  const [grants, setGrants] = useState<IrfGrant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myDesignation, setMyDesignation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGrants = useCallback(async () => {
    const { data } = await supabase.from("irf_form_access" as any).select("*");
    setGrants((data as any) || []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: adminFlag }, { data: prof }] = await Promise.all([
        supabase.rpc("is_irf_admin" as any),
        user ? supabase.from("profiles").select("designation").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      await loadGrants();
      if (!active) return;
      setIsAdmin(!!adminFlag);
      setMyDesignation((prof as any)?.designation ?? null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user, loadGrants]);

  const canAccess = useCallback(
    (categoryId: string) => {
      if (isAdmin) return true;
      return grants.some((g) => {
        if (g.form_category !== categoryId) return false;
        if (g.project_id && projectId && g.project_id !== projectId) return false;
        if (g.grant_type === "user") return g.user_id === user?.id;
        return g.designation === myDesignation;
      });
    },
    [grants, isAdmin, projectId, user?.id, myDesignation],
  );

  return { loading, isAdmin, canAccess, grants, reloadGrants: loadGrants };
};
