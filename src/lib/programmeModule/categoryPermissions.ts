import type { TeamPermissions } from "./projectTeam";
import { defaultRolePermissions, VIEW_AS_ROLES } from "./viewAs";

export const CATEGORY_PERSONAL_KEYS = ["components", "programme_areas", "programme_staff", "health_worker", "dashboards", "feedback_share"] as const;

/** Category actions/pages are authoritative; personal programme scope is retained. */
export function resolveCategoryPermissions(own: TeamPermissions, profiles: Record<string, TeamPermissions | undefined>): TeamPermissions {
  const category = VIEW_AS_ROLES.find(r => r.key === own.access_category);
  if (!category) return own;
  const personal = Object.fromEntries(CATEGORY_PERSONAL_KEYS.filter(k => own[k] !== undefined).map(k => [k, own[k]]));
  return { ...(profiles[category.key] ?? defaultRolePermissions(category.key)), ...personal, access_category: category.key };
}