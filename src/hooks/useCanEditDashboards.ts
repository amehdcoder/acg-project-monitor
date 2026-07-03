import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * True when the current user may edit ANY dashboard in the app:
 * Owner, Co-owner, Super Admin, or Systems Admin.
 */
export function useCanEditDashboards() {
  const { isOwner, isCoOwner, isSuperAdmin, role } = useAuth();

  const canEditDashboards =
    !!isOwner ||
    !!isCoOwner ||
    !!isSuperAdmin ||
    role === "super_admin" ||
    role === "systems_admin";

  const assertCanEdit = useCallback(() => canEditDashboards, [canEditDashboards]);

  return { canEditDashboards, assertCanEdit };
}
