import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { mergeCatalogue, grid3Features, osmFeatures } from "../landCatalogue";

const g = grid3Features([{ name: "Gadaka", lga: "Fika", ward: "W", latitude: 11.0, longitude: 11.0 }, { name: "Far", lga: "Fika", ward: "W", latitude: 12, longitude: 12 }], "Yobe", 11, 11);
describe("land-feature catalogue", () => {
  it("keeps only GRID3 settlements near the point", () => expect(g.map((f) => f.name)).toEqual(["Gadaka"]));
  it("GRID3 wins over a nearby OpenStreetMap place", () => {
    const o = osmFeatures([{ name: "Gadaka OSM", feature: "place:village", lat: 11.001, lng: 11.0, population: null, source: "https://www.openstreetmap.org/node/1" }], "Yobe", "Fika");
    expect(mergeCatalogue(g, o).map((f) => f.kind)).toEqual(["grid3"]);
  });
  it("OpenStreetMap fills gaps with places and land features GRID3 lacks", () => {
    const o = osmFeatures([
      { name: "Distant hamlet", feature: "place:hamlet", lat: 11.02, lng: 11.0, population: null, source: "https://www.openstreetmap.org/node/2" },
      { name: "River", feature: "waterway:river", lat: 11.0005, lng: 11.0, population: null, source: "https://www.openstreetmap.org/way/3" },
    ], "Yobe", "Fika");
    expect(mergeCatalogue(g, o).map((f) => f.name)).toEqual(["Gadaka", "Distant hamlet", "River"]);
  });
});
