// Remembers which DHIS2 dashboard was imported to the "DHIS2 Dashboard" page.
export type ImportedDashboard = { projectId: string; projectName?: string; connId: string; dashboardId: string; dashboardName: string; importedAt: string };
const KEY = "amehnities:dhis2-imported-dashboard";

export function getImportedDashboard(): ImportedDashboard | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function setImportedDashboard(d: ImportedDashboard | null) {
  try { d ? localStorage.setItem(KEY, JSON.stringify(d)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("amehnities:dhis2-dashboard-changed"));
}
export function openAppTab(tab: string) {
  window.dispatchEvent(new CustomEvent("amehnities:open-tab", { detail: tab }));
}
