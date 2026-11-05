import { describe, expect, it } from "vitest";
import { areaKm2, buildLandblocks } from "../landblocks";

const state = { type: "Polygon", coordinates: [[[9, 11], [10, 11], [10, 12], [9, 12], [9, 11]]] };
describe("landblocks", () => {
  it("caps a lone settlement at the 5 km radius", () => {
    const [b] = buildLandblocks([{ lat: 11.5, lng: 9.5, pop: 785 }], [state]);
    expect(b.areaKm2).toBeGreaterThan(70); expect(b.areaKm2).toBeLessThan(79); // π·5² ≈ 78.5
    expect(b.density).toBeCloseTo(785 / b.areaKm2);
  });
  it("clips landblocks at the State edge", () => {
    const [b] = buildLandblocks([{ lat: 11.5, lng: 9.01, pop: 100 }], [state]);
    expect(b.areaKm2).toBeLessThan(50);
  });
  it("splits neighbours so areas do not overlap", () => {
    const blocks = buildLandblocks([{ lat: 11.5, lng: 9.5, pop: 1 }, { lat: 11.5, lng: 9.52, pop: 1 }], [state]);
    const lone = buildLandblocks([{ lat: 11.5, lng: 9.5, pop: 1 }], [state])[0].areaKm2;
    expect(blocks[0].areaKm2 + blocks[1].areaKm2).toBeLessThan(2 * lone);
    expect(areaKm2([[[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]])).toBeGreaterThan(1.2);
  });
});
