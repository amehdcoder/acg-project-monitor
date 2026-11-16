import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { adminBoundaryPalette, NIGERIA_ADMIN_ATTRIBUTION, type NigeriaAdminBoundaries } from "./nigeriaAdminBoundaries";

/** Separate noninteractive panes keep sourced outlines above thematic fills, below markers. */
export function drawNigeriaAdminBoundaries(map: L.Map, data: NigeriaAdminBoundaries) {
  for (const [name, order] of [["admin-lga", "465"], ["admin-state", "470"]]) {
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = order;
    pane.style.pointerEvents = "none";
  }
  const palette = adminBoundaryPalette();
  const layers = L.layerGroup().addTo(map);
  const add = (fc: NigeriaAdminBoundaries["states"], pane: string, color: string, weight: number, className: string) => {
    const style: L.PolylineOptions = { color, weight, fill: false, opacity: 1, lineCap: "round", lineJoin: "round", className, smoothFactor: 0 };
    return L.geoJSON(fc as unknown as GeoJsonObject, { pane, interactive: false, style }).addTo(layers);
  };
  add(data.lgas, "admin-lga", palette.casing, 4.5, "geo-admin-lga-casing");
  add(data.lgas, "admin-lga", palette.lga, 2.2, "geo-admin-lga-line");
  add(data.states, "admin-state", palette.casing, 7, "geo-admin-state-casing");
  const outline = add(data.states, "admin-state", palette.state, 4.5, "geo-admin-state-line");
  map.attributionControl?.addAttribution(NIGERIA_ADMIN_ATTRIBUTION);
  return {
    bounds: outline.getBounds(),
    remove: () => { layers.remove(); map.attributionControl?.removeAttribution(NIGERIA_ADMIN_ATTRIBUTION); },
  };
}