// "View as" — lets Super Admins see the records workspace exactly as another
// kind of user would, narrowed to components, a state or a health facility.
// This only changes what the workspace shows on this screen; it never grants
// or removes anyone's real access.
import type { TeamPermissions } from "./projectTeam";

export type ViewAsRole =
  | "facility_focal" | "clinician" | "pharmacist" | "records_officer" | "programme_officer" | "team_member" | "safeguarding_officer";

export interface ViewAsConfig {
  role: ViewAsRole;
  /** Component keys to limit the view to (empty = every component the role may see). */
  components: string[];
  state?: string;
  facilityId?: string;
}

export const VIEW_AS_ROLES: { key: ViewAsRole; label: string; hint: string; needsFacility?: boolean }[] = [
  { key: "facility_focal", label: "Facility Focal Person", hint: "One facility's clinical records, follow-ups, households and case search", needsFacility: true },
  { key: "clinician", label: "Clinician", hint: "Confirms cases, records services and accepts referrals for health components" },
  { key: "pharmacist", label: "Pharmacist", hint: "Reads records, records medicines and services, handles referrals" },
  { key: "records_officer", label: "Records Officer", hint: "Registers and updates records, services and home visits" },
  { key: "programme_officer", label: "Programme Officer", hint: "Dashboards, records and the Programme Report" },
  { key: "team_member", label: "Project team member", hint: "Read-only records and dashboards for chosen components" },
  { key: "safeguarding_officer", label: "Safeguarding Officer", hint: "Safeguarding dashboard and restricted cases only" },
];

const BASE: Record<ViewAsRole, TeamPermissions> = {
  facility_focal: { view_records: true, view_dashboards: true },
  clinician: { health_worker: "Clinician", view_records: true, edit_records: true, record_services: true, confirm_cases: true, accept_referrals: true, view_dashboards: true },
  pharmacist: { health_worker: "Pharmacist", view_records: true, record_services: true, accept_referrals: true, view_dashboards: true },
  records_officer: { view_records: true, edit_records: true, record_services: true, home_visits: true, export_data: true, view_dashboards: true },
  programme_officer: { view_records: true, view_dashboards: true, export_data: true },
  team_member: { view_records: true, view_dashboards: true },
  safeguarding_officer: { view_safeguarding: true },
};

/** Built-in starting access for a category, before any Access studio changes. */
export const defaultRolePermissions = (role: ViewAsRole): TeamPermissions => ({ ...BASE[role] });

/** The team-register permissions the simulated person would have. */
export const viewAsPermissions = (v: ViewAsConfig, profile?: TeamPermissions | null): TeamPermissions => ({
  ...(profile || BASE[v.role]),
  ...(v.components.length ? { components: [...v.components] } : {}),
});

/** Records the simulated person would see, narrowed by state and facility. */
export const viewAsRecordVisible = (
  v: ViewAsConfig,
  b: { state?: string | null; facility_id?: string | null },
) => {
  if (v.facilityId && b.facility_id !== v.facilityId) return false;
  if (v.state && (b.state || "").trim().toLowerCase() !== v.state.trim().toLowerCase()) return false;
  return true;
};

export const viewAsLabel = (v: ViewAsConfig) => VIEW_AS_ROLES.find((r) => r.key === v.role)?.label || "User";
