// Geo Microplanning access levels.
//
//   "dashboard" — the full Geo Microplanning page (KPIs, tabs, maps, management):
//                 the Owner/co-owners, admins with an explicit page grant, users
//                 with a Tier-2 "Manage Microplanning Form Access" grant, MDA Lens
//                 users, or a time-bounded owner page grant.
//   "entry"     — the New Microplan Entry Form only: every member of a project
//                 that has microplanning enabled (assignment ∩ project grant −
//                 exclusion), plus field designations (enumerator, CDD, FLHF
//                 supervisor).
//   "none"      — no access at all.
//
// The minimal-access lock (Forms / Project Chat / My Submissions only) always
// wins over entry access for non-admins.

export type MicroplanAccessLevel = "dashboard" | "entry" | "none";

export interface MicroplanAccessInput {
  isOwner: boolean;
  isOwnerLevel: boolean;
  /** Time-bounded owner grant for the microplanning page. */
  hasUserPageGrant: boolean;
  /** Tier-2 microplan_form_access grant. */
  hasFormAccess: boolean;
  lensEnabled: boolean;
  isAdmin: boolean;
  /** Page ids granted via admin_page_access. */
  grantedPages: string[];
  minimalAccess: boolean;
  isFieldDesignation: boolean;
  /** Projects where the user may submit microplan entries. */
  entryProjectIds: string[];
}

export const resolveMicroplanAccess = (input: MicroplanAccessInput): MicroplanAccessLevel => {
  if (input.isOwner || input.isOwnerLevel) return "dashboard";
  if (input.hasUserPageGrant) return "dashboard";
  if (input.hasFormAccess) return "dashboard";
  if (input.lensEnabled) return "dashboard";
  if (input.isAdmin && input.grantedPages.includes("microplanning")) return "dashboard";
  if (input.minimalAccess && !input.isAdmin) return "none";
  if (input.isFieldDesignation) return "entry";
  if (input.entryProjectIds.length > 0) return "entry";
  return "none";
};
