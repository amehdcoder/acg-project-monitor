/**
 * Role-based permissions for the Integrated Supervisory Checklist.
 *
 * Tiers
 *  • Owner / Co-owner / Super Admin / Systems Admin → full access
 *  • Users with an explicit `integrated-supervisory` page grant → view + export
 *  • Supervisory field designations → view only (no export, no integrations)
 *  • Everyone else → no access
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";

/** Designations allowed to read the checklist analytics without an explicit grant. */
const VIEWER_DESIGNATIONS = new Set([
  "independent_monitor",
  "state_supervisor",
  "lga_supervisor",
  "flhf_supervisor",
  "electronic_data_manager",
  "hands_staff",
  "sightsavers_staff",
  "cbmg_staff",
  "cbmi_staff",
]);

export interface ChecklistPermissions {
  canView: boolean;
  /** Download raw/flattened data (Excel, CSV, PDF/PNG snapshots). */
  canExport: boolean;
  /** Add, edit or remove KoboToolbox integrations and run syncs. */
  canManageIntegrations: boolean;
  /** Edit dashboards in the Studio (widgets, calculated fields, presets). */
  canEditDashboards: boolean;
  loading: boolean;
  roleLabel: string;
}

export function useChecklistPermissions(): ChecklistPermissions {
  const { profile, role, isOwner, isCoOwner, isSuperAdmin, isAdmin, loading } = useAuth();
  const { canAccessPage, loadingAccess } = usePageAccess();

  return useMemo(() => {
    const admin =
      !!isOwner || !!isCoOwner || !!isSuperAdmin || !!isAdmin ||
      role === "super_admin" || role === "systems_admin";

    const granted = (() => {
      try { return canAccessPage("integrated-supervisory"); } catch { return false; }
    })();

    const designation = String(profile?.designation ?? "").toLowerCase();
    const viewerByDesignation = VIEWER_DESIGNATIONS.has(designation);

    const canView = admin || granted || viewerByDesignation;

    return {
      canView,
      canExport: admin || granted,
      canManageIntegrations: admin,
      canEditDashboards: admin || granted,
      loading: loading || loadingAccess,
      roleLabel: admin
        ? "Administrator"
        : granted
          ? "Granted analyst"
          : viewerByDesignation
            ? "Supervisory viewer"
            : "No access",
    };
  }, [profile?.designation, role, isOwner, isCoOwner, isSuperAdmin, isAdmin, loading, loadingAccess, canAccessPage]);
}

export default useChecklistPermissions;
