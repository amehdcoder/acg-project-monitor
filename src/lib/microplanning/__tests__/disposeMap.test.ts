import { describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { disposeMap } from "../disposeMap";

describe("map cleanup ordering", () => {
  it("drains groups before destroying their canvas renderer", () => {
    const events: string[] = [];
    const group = L.layerGroup();
    const path = L.circleMarker([12, 9]);
    group.addLayer(path);
    const renderer = new L.Canvas();
    const layers = new Set<L.Layer>([group, path, renderer]);
    const clear = vi.spyOn(group, "clearLayers");
    const map = {
      stop: () => events.push("stop"),
      eachLayer: (fn: (layer: L.Layer) => void) => [...layers].forEach(fn),
      removeLayer: (layer: L.Layer) => {
        if (layer === renderer) {
          expect(clear).toHaveBeenCalledOnce();
          expect(group.getLayers()).toHaveLength(0);
          expect(layers.has(path)).toBe(false);
          events.push("renderer");
        }
        layers.delete(layer);
      },
      remove: () => events.push("map"),
    };
    disposeMap(map as unknown as L.Map);
    expect(events).toEqual(["stop", "renderer", "map"]);
  });
});