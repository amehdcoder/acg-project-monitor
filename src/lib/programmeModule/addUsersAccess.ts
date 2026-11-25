// Add-users wizard — turns a simple access choice (view only / view & record /
// record only) plus a scope (components, tabs, individual records) into the
// per-member permission set stored on `programme_team_members.permissions`.
import { ACCESS_PAGES } from "./accessStudio";
import type { TeamPermissions } from "./projectTeam";

export type AccessLevel = "view" | "view_record" | "record";

export const ACCESS_LEVELS: { key: AccessLevel; label: string; hint: string }[] = [
  { key: "view", label: "View only", hint: "Can open records and dashboards. Cannot add or change anything." },
  { key: "view_record", label: "View & record", hint: "Can open records, register people and record services and follow-ups." },
  { key: "record", label: "Record only", hint: "Can register people and record services, but cannot browse records or dashboards." },
];

export interface AccessScope {
  /** Component keys; empty = all components. */
  components: string[];
  /** Tabs / features they may open; empty = every tab. */
  pages: string[];
  /** Individual beneficiary records; empty = every record in their scope. */
  beneficiaryIds: string[];
}

export const ALL_PAGE_KEYS = ACCESS_PAGES.flatMap((g) => g.items.map((i) => i.key));
const DASHBOARD_KEYS = ACCESS_PAGES.find((g) => g.group === "Overview")?.items.map((i) => i.key) || [];

export const buildAccessPermissions = (level: AccessLevel, scope: AccessScope): TeamPermissions => {
  const view = level !== "record";
  const write = level !== "view";
  const perms: TeamPermissions = {
    view_records: view || undefined,
    view_dashboards: view || undefined,
    edit_records: write || undefined,
    record_services: write || undefined,
    home_visits: write || undefined,
  };
  let hidden: string[] = [];
  if (scope.pages.length) hidden = ALL_PAGE_KEYS.filter((k) => !scope.pages.includes(k));
  if (!view) hidden = Array.from(new Set([...hidden, ...DASHBOARD_KEYS]));
  if (hidden.length) perms.hidden_views = hidden;
  if (scope.components.length) perms.components = [...scope.components];
  if (scope.beneficiaryIds.length) perms.beneficiary_ids = [...scope.beneficiaryIds];
  return Object.fromEntries(Object.entries(perms).filter(([, v]) => v !== undefined)) as TeamPermissions;
};

/** Plain-language summary shown on the review step. */
export const describeScope = (scope: AccessScope, componentLabel: (k: string) => string) => ({
  components: scope.components.length ? scope.components.map(componentLabel).join(", ") : "All components",
  pages: scope.pages.length ? `${scope.pages.length} of ${ALL_PAGE_KEYS.length} tabs` : "All tabs & features",
  records: scope.beneficiaryIds.length ? `${scope.beneficiaryIds.length} selected record(s)` : "All records in their components",
});
