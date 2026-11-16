import { normState } from "./heatmaps";

export interface AdminBoundary {
  type: "Feature";
  properties: {
    state: string;
    state_pcode: string;
    pcode: string;
    lga?: string;
    center_lat: number;
    center_lon: number;
  };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}
export interface AdminCollection { type: "FeatureCollection"; features: AdminBoundary[] }
export interface NigeriaAdminBoundaries { states: AdminCollection; lgas: AdminCollection }

// Immutable, revisioned files are precached for prepared offline devices.
export const NIGERIA_ADMIN_BASE = "/data/nigeria-admin/cod-v01";
export const NIGERIA_ADMIN_SOURCE_URL = "https://data.humdata.org/dataset/cod-ab-nga";
export const NIGERIA_ADMIN_ATTRIBUTION = `<a href="${NIGERIA_ADMIN_SOURCE_URL}" target="_blank" rel="noopener noreferrer">State/LGA: OSGOF · OCHA COD-AB v01 (CC BY-IGO)</a>`;
export const adminStateKey = (state: string | null | undefined) => normState(state).replace(/^NASSARAWA$/, "NASARAWA");

let pending: Promise<NigeriaAdminBoundaries> | undefined;
export function loadNigeriaAdminBoundaries(): Promise<NigeriaAdminBoundaries> {
  if (!pending) {
    const read = async (file: string, count: number): Promise<AdminCollection> => {
      const response = await fetch(`${NIGERIA_ADMIN_BASE}/${file}.geojson`);
      if (!response.ok) throw new Error("Nigeria administrative boundaries unavailable; reconnect and reopen the map.");
      const data = await response.json() as AdminCollection;
      if (data.type !== "FeatureCollection" || data.features?.length !== count) throw new Error("Nigeria administrative boundary file is incomplete.");
      return data;
    };
    pending = Promise.all([read("states", 37), read("lgas", 774)])
      .then(([states, lgas]) => ({ states, lgas }))
      .catch(error => { pending = undefined; throw error; });
  }
  return pending;
}

/** Public boundary context only; record scope and recorded GPS never change. */
export function selectAdminBoundaries(data: NigeriaAdminBoundaries, states: string[]): NigeriaAdminBoundaries {
  const keys = new Set(states.map(adminStateKey).filter(Boolean));
  const select = (fc: AdminCollection): AdminCollection => ({
    type: "FeatureCollection",
    features: fc.features.filter(f => keys.has(adminStateKey(f.properties.state))),
  });
  return { states: select(data.states), lgas: select(data.lgas) };
}

export function adminBoundaryPalette() {
  const element = document.createElement("span");
  element.hidden = true;
  document.body.appendChild(element);
  const color = (token: string) => {
    element.style.color = `hsl(var(${token}))`;
    return getComputedStyle(element).color;
  };
  const palette = { state: color("--map-admin-state"), lga: color("--map-admin-lga"), casing: color("--map-admin-casing") };
  element.remove();
  return palette;
}