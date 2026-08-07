/**
 * MDA Lens — scoped access configuration for the two MDA field-operations pages.
 *
 * An admin can switch the lens on for any user, then choose exactly which tabs
 * of the Geo Microplanning page and the Integrated Supervisory Checklist page
 * that user may open, and which States / LGAs their data is filtered to.
 */

export interface MdaLensGrant {
  user_id: string;
  enabled: boolean;
  microplan_tabs: string[];
  supervisory_tabs: string[];
  states: string[];
  lgas: string[];
  can_export: boolean;
}

export const MICROPLAN_TABS = [
  { id: "list", label: "Planning" },
  { id: "medicine", label: "Medicine" },
  { id: "coverage", label: "Coverage" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "gaps", label: "Gaps" },
  { id: "map", label: "Map" },
  { id: "routes", label: "Routes" },
  { id: "historical", label: "Historical" },
] as const;

export const SUPERVISORY_TABS = [
  { id: "checklist", label: "Checklist Dashboard" },
  { id: "records", label: "Raw Kobo Data" },
  { id: "studio", label: "Dashboard Studio" },
  { id: "reconciliation", label: "Medicine Accountability" },
] as const;

export const MICROPLAN_TAB_IDS = MICROPLAN_TABS.map((t) => t.id) as unknown as string[];
export const SUPERVISORY_TAB_IDS = SUPERVISORY_TABS.map((t) => t.id) as unknown as string[];

/** Page ids the lens unlocks in the sidebar / route guard. */
export const LENS_PAGE_IDS = ["microplanning", "integrated-supervisory", "integrated-supervisory-raw"];

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** True when a row (any object with state/lga-ish fields) is inside the lens scope. */
export function rowInLensScope(
  lens: { states: string[]; lgas: string[] } | null,
  state: unknown,
  lga: unknown,
): boolean {
  if (!lens) return true;
  const states = (lens.states || []).map(norm).filter(Boolean);
  const lgas = (lens.lgas || []).map(norm).filter(Boolean);
  if (states.length && !states.includes(norm(state))) return false;
  if (lgas.length && !lgas.includes(norm(lga))) return false;
  return true;
}

/** Pull a State / LGA value out of a (possibly group-prefixed) Kobo row. */
export function readKoboGeo(row: Record<string, unknown>): { state: string; lga: string } {
  let state = "";
  let lga = "";
  for (const [k, v] of Object.entries(row || {})) {
    const leaf = k.split("/").pop() || k;
    if (!state && /^state$/i.test(leaf)) state = String(v ?? "");
    if (!lga && /^lga$/i.test(leaf)) lga = String(v ?? "");
    if (state && lga) break;
  }
  return { state, lga };
}
