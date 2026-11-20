import { describe, it, expect } from "vitest";
import L from "leaflet";
import { classifyWay, overpassQuery } from "../geoFeatures";
describe("geo features", () => {
  it("classifies OSM ways into legend categories", () => {
    expect(classifyWay({ highway: "trunk" })).toBe("road");
    expect(classifyWay({ waterway: "river" })).toBe("river");
    expect(classifyWay({ landuse: "forest" })).toBe("forest");
    expect(classifyWay({ natural: "sand" })).toBe("desert");
    expect(classifyWay({ building: "yes" })).toBeNull();
  });
  it("adds secondary roads and streams only when zoomed in", () => {
    const b = L.latLngBounds([12, 11], [13, 12]);
    expect(overpassQuery(b, 10)).not.toContain("secondary");
    expect(overpassQuery(b, 12)).toContain("stream");
  });
});
