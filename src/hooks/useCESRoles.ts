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

  // Every signed-in user who can reach the CES page (granted to all members
  // via the Integrated MDA Supervisory Checklist) gets full survey access.
  // This removes the "No CES role assigned" / "Step 1 is restricted to
  // Community Locators" lock for ordinary field users. Analysis/validation
  // remains gated to validators/admins so it stays hidden from regular users.
  const allAccess = !!user?.id;
  const effectiveRoles: CESRoleKey[] = allAccess
    ? Array.from(new Set<CESRoleKey>([...roles, "community_locator", "household_surveyor"]))
    : roles;

  return {
    loading,
    roles: effectiveRoles,
    canLocate: allAccess || isAdminBypass || has("community_locator"),
    canSurvey: allAccess || isAdminBypass || has("household_surveyor") || has("community_locator"),
    canValidate: isAdminBypass || has("peer_validator"),
    isAdminBypass,
  };
}


