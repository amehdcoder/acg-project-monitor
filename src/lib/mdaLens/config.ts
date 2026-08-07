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
  wards: string[];
  project_ids: string[];
  campaign_types: string[];
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

/**
 * Tolerant comparison key: Kobo/microplan rows store geography in many shapes
 * ("Kano", "kano", "c__kano", "Kano|Dala", "state_kano_01", "Dala LGA").
 * We compare on the last hierarchy segment, without code prefixes, spacing or
 * punctuation, so an admin's plain "Kano" grant always matches the data.
 */
const norm = (s: unknown) => {
  const value = String(s ?? "").trim();
  const leaf = value.split("|").pop() ?? value;
  return leaf
    .toLowerCase()
    .replace(/^[a-z]+__/, "")
    .replace(/^[a-z]+_[a-z0-9]+_/, "")
    .replace(/^(c|s)__?/i, "")
    .replace(/\b(state|lga|ward)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
};


/** True when a row (any object with state/lga-ish fields) is inside the lens scope. */
export function rowInLensScope(
  lens: { states: string[]; lgas: string[]; wards?: string[] } | null,
  state: unknown,
  lga: unknown,
  ward?: unknown,
): boolean {
  if (!lens) return true;
  const states = (lens.states || []).map(norm).filter(Boolean);
  const lgas = (lens.lgas || []).map(norm).filter(Boolean);
  const wards = (lens.wards || []).map(norm).filter(Boolean);
  const s = norm(state);
  const l = norm(lga);
  const w = norm(ward);
  // A level is only enforced when the row actually carries a value there, so a
  // State grant keeps every LGA/Ward inside it and rows missing a ward stay visible.
  if (states.length && s && !states.includes(s)) return false;
  if (lgas.length && l && !lgas.includes(l)) return false;
  if (wards.length && w && !wards.includes(w)) return false;
  return true;

}

export const projectInLensScope = (lens: MdaLensGrant | null, projectId: unknown): boolean =>
  !lens || lens.project_ids.length === 0 || lens.project_ids.includes(String(projectId ?? ""));

export const campaignInLensScope = (lens: MdaLensGrant | null, campaign: unknown): boolean => {
  if (!lens || lens.campaign_types.length === 0) return true;
  return lens.campaign_types.map(norm).includes(norm(campaign));
};

export function readKoboCampaign(row: Record<string, unknown>): unknown {
  const match = Object.entries(row || {}).find(([key]) => {
    const leaf = key.split("/").pop() || key;
    return /^(mda_?)?campaign_?type$/i.test(leaf.replace(/\s+/g, "_"));
  });
  return match?.[1];
}

/** Pull a State / LGA value out of a (possibly group-prefixed) Kobo row. */
export function readKoboGeo(row: Record<string, unknown>): { state: string; lga: string; ward: string } {
  let state = "";
  let lga = "";
  let ward = "";
  const pick = (leaf: string, level: "state" | "lga" | "ward") =>
    new RegExp(`^((mda|sel|q)_?)?${level}(_?(name|label|select|code))?$`, "i").test(leaf.replace(/\s+/g, "_"));
  for (const [k, v] of Object.entries(row || {})) {
    const leaf = k.split("/").pop() || k;
    if (!state && pick(leaf, "state")) state = String(v ?? "");
    if (!lga && pick(leaf, "lga")) lga = String(v ?? "");
    if (!ward && pick(leaf, "ward")) ward = String(v ?? "");
    if (state && lga && ward) break;
  }

  return { state, lga, ward };
}
