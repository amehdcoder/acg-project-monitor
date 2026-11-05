import { describe, expect, it } from "vitest";
import { categoryOf, entryPoint, groupByState } from "../heatmaps";

const square = { type: "Polygon", coordinates: [[[9, 11], [10, 11], [10, 12], [9, 12], [9, 11]]] };
describe("planning heatmaps", () => {
  it("prefers corrected GPS and rejects 0,0 / out-of-Nigeria points", () => {
    expect(entryPoint({ community_latitude: 11.5, community_longitude: 9.5, community_lat_override: 11.6, community_lng_override: 9.6 })).toEqual([11.6, 9.6]);
    expect(entryPoint({ community_latitude: 0, community_longitude: 0 })).toBeNull();
    expect(entryPoint({ community_latitude: 51, community_longitude: 0 })).toBeNull();
  });
  it("drops GPS outside the recorded State", () => {
    const g = groupByState([
      { state: "Jigawa", community_latitude: 11.5, community_longitude: 9.5 },
      { state: "Jigawa", community_latitude: 7, community_longitude: 5 },
      { state: "Jigawa" },
    ], [{ properties: { state: "Jigawa" }, geometry: square }]);
    expect(g[0].points.length).toBe(1); expect(g[0].outside).toBe(1); expect(g[0].noGps).toBe(1);
  });
  it("classifies categories and population bands", () => {
    expect(categoryOf({ accessibility: "Hard to reach" }, "accessibility").key).toBe("hard_to_reach");
    expect(categoryOf({}, "security").key).toBe("unknown");
    expect(categoryOf({ estimated_total_population: 12000 }, "population").key).toBe("p5");
  });
});
