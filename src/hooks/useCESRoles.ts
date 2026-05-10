import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CESRoleKey = "community_locator" | "household_surveyor" | "peer_validator";

export interface CESRolesState {
  loading: boolean;
  roles: CESRoleKey[];
  canLocate: boolean;
  canSurvey: boolean;
  canValidate: boolean;
  isAdminBypass: boolean;
}

/**
 * Returns the current user's CES roles for a given project, with admin/owner bypass.
 * Locators are also allowed to survey (they were on-site).
 */
export function useCESRoles(projectId?: string | null): CESRolesState {
  const { user, isAdmin, isOwner } = useAuth();
  const [roles, setRoles] = useState<CESRoleKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !projectId) {
      setRoles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("ces_role_assignments" as any)
        .select("role")
        .eq("user_id", user.id)
        .eq("project_id", projectId);
      if (!cancelled) {
        setRoles(((data as any) ?? []).map((r: any) => r.role as CESRoleKey));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, projectId]);

  const isAdminBypass = !!(isAdmin || isOwner);
  const has = (r: CESRoleKey) => roles.includes(r);

  return {
    loading,
    roles,
    canLocate: isAdminBypass || has("community_locator"),
    canSurvey: isAdminBypass || has("household_surveyor") || has("community_locator"),
    canValidate: isAdminBypass || has("peer_validator"),
    isAdminBypass,
  };
}
