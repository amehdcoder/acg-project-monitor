/**
 * Dev-only MDA Lens harness (`/__test/mda-lens`).
 *
 * Drives the REAL gating surfaces — `usePageAccess`, `Sidebar`, `BottomNavBar`,
 * `LensScopeBanner` and `ChecklistFilters` — with a deterministic lens grant
 * supplied through the URL, so Playwright can prove that:
 *   • a lens user reaches ONLY the two MDA pages (direct navigation included),
 *   • scoped State/LGA/Ward filters are locked and cannot be widened,
 *   • the export row-set never contains out-of-scope rows.
 *
 * Query params: `states`, `lgas`, `wards` (comma separated), `export=0|1`,
 * `enabled=0|1`.
 *
 * Production returns 404.
 */
import { useMemo, useState } from "react";
import NotFound from "./NotFound";
import Sidebar from "@/components/Sidebar";
import BottomNavBar from "@/components/BottomNavBar";
import LensScopeBanner from "@/components/MdaLens/LensScopeBanner";
import ChecklistFilters, {
  EMPTY_FILTERS,
  applyChecklistFilters,
  type ChecklistFilterState,
} from "@/components/IntegratedSupervisory/ChecklistFilters";
import { usePageAccess } from "@/hooks/usePageAccess";
import { useMdaLens } from "@/hooks/useMdaLens";
import { enforceLensTab, rowInLensScope, type MdaLensGrant } from "@/lib/mdaLens/config";

const PAGE_IDS = [
  "microplanning",
  "integrated-supervisory",
  "integrated-supervisory-raw",
  "dashboard",
  "users",
  "analytics",
  "forms",
  "cases",
];

/** Fixture rows spanning in-scope and out-of-scope geography. */
const PARENTS: Record<string, unknown>[] = [
  { _id: 1, _submission_time: "2026-05-02T09:00:00", State: "Kano", LGA: "Dala", Ward: "Gwammaja", MDA_Campaign_Type: "ntd_mda" },
  { _id: 2, _submission_time: "2026-05-03T09:00:00", State: "Kano", LGA: "Dala", Ward: "Kabuwaya", MDA_Campaign_Type: "ntd_mda" },
  { _id: 3, _submission_time: "2026-05-04T09:00:00", State: "Kano", LGA: "Ungogo", Ward: "Zango", MDA_Campaign_Type: "ntd_mda" },
  { _id: 4, _submission_time: "2026-05-05T09:00:00", State: "Jigawa", LGA: "Dutse", Ward: "Limawa", MDA_Campaign_Type: "ntd_mda" },
  { _id: 5, _submission_time: "2026-05-06T09:00:00", State: "Jigawa", LGA: "Dala", Ward: "Gwammaja", MDA_Campaign_Type: "ntd_mda" },
];

const list = (v: string | null) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export default function MdaLensHarness() {
  if (!import.meta.env.DEV) return <NotFound />;

  const params = new URLSearchParams(window.location.search);
  const grant: MdaLensGrant = useMemo(
    () => ({
      user_id: "harness-user",
      enabled: params.get("enabled") !== "0",
      microplan_tabs: list(params.get("microplan_tabs")),
      supervisory_tabs: list(params.get("supervisory_tabs")),
      states: list(params.get("states")),
      lgas: list(params.get("lgas")),
      wards: list(params.get("wards")),
      project_ids: list(params.get("projects")),
      campaign_types: list(params.get("campaigns")),
      can_export: params.get("export") !== "0",
    }),
    [],
  );

  // Inject BEFORE any child reads `useMdaLens` (component body runs first).
  (window as unknown as { __MDA_LENS_TEST__?: MdaLensGrant }).__MDA_LENS_TEST__ = grant;

  const { lens, lensEnabled } = useMdaLens();
  const { canAccessPage } = usePageAccess();
  const [filters, setFilters] = useState<ChecklistFilterState>({ ...EMPTY_FILTERS });
  // Direct navigation: `?tab=` is treated exactly as Index treats a deep link,
  // and the real lens route guard decides where the user actually lands.
  const requestedTab = params.get("tab") || "microplanning";
  const [activeTab, setActiveTab] = useState(requestedTab);
  const guardedTab = lensEnabled
    ? enforceLensTab(activeTab, canAccessPage("microplanning"))
    : activeTab;

  // What the dashboards/exports are allowed to read: lens scope first, then
  // the user's own filter choices — exactly the order the real pages use.
  const scoped = useMemo(
    () => PARENTS.filter((p) => rowInLensScope(lens, p.State, p.LGA, p.Ward)),
    [lens],
  );
  const visible = useMemo(() => applyChecklistFilters(scoped, filters), [scoped, filters]);

  return (
    <div data-testid="mda-lens-harness" className="min-h-screen bg-background p-4 space-y-4">
      <Sidebar
        isOpen
        onClose={() => {}}
        activeTab={guardedTab}
        onTabChange={setActiveTab}
        profile={{ first_name: "Lens", last_name: "User", designation: "enumerator" }}
        role="user"
        isAdmin={false}
        isOwner={false}
        isAdhoc={false}
        canAccessPage={canAccessPage}
        minimalAccess={false}
        lensEnabled={lensEnabled}
        collapsed={false}
        onToggleCollapse={() => {}}
      />

      <div className="space-y-4 md:pl-72">
        <span data-testid="lens-enabled">{String(lensEnabled)}</span>
        <span data-testid="active-tab">{guardedTab}</span>

        <LensScopeBanner lens={lens} />

        <div data-testid="page-access" className="flex flex-wrap gap-2">
          {PAGE_IDS.map((id) => (
            <span
              key={id}
              data-testid={`page-${id}`}
              data-allowed={String(canAccessPage(id))}
              className="text-xs rounded border px-2 py-1"
            >
              {id}
            </span>
          ))}
        </div>

        <ChecklistFilters parents={PARENTS} value={filters} onChange={setFilters} />

        <div className="text-xs space-x-4">
          <span data-testid="filter-state">{filters.state}</span>
          <span data-testid="filter-lga">{filters.lga}</span>
          <span data-testid="scoped-count">{scoped.length}</span>
          <span data-testid="visible-count">{visible.length}</span>
          <span data-testid="visible-ids">{visible.map((r) => r._id).join(",")}</span>
        </div>

        {lensEnabled && lens?.can_export && (
          <button data-testid="lens-export" className="rounded border px-3 py-1 text-xs">
            Export scoped data ({visible.length})
          </button>
        )}
      </div>

      <BottomNavBar
        activeTab={guardedTab}
        onTabChange={setActiveTab}
        onMenuClick={() => {}}
        isAdmin={false}
        lensEnabled={lensEnabled}
      />
    </div>
  );
}
