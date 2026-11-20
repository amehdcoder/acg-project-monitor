import { describe, it, expect } from "vitest";
import { buildCatchments, catchmentOutline } from "../flhfCatchments";
describe("FLHF catchments", () => {
  const rows = [
    { flhf_name: "PHC Gashua", flhf_latitude: 12.87, flhf_longitude: 11.04, community_latitude: 12.9, community_longitude: 11.0, community_name: "A" },
    { flhf_name: "phc gashua ", community_latitude: 12.85, community_longitude: 11.1, community_name: "B" },
    { flhf_name: "PHC Yusufari", flhf_latitude: 13.06, flhf_longitude: 11.17, settlement_latitude: 13.1, settlement_longitude: 11.2, settlement_name: "S1" },
  ];
  it("groups communities per FLHF with distinct colours and facility location", () => {
    const c = buildCatchments(rows);
    expect(c.map(x => x.communities.length)).toEqual([2, 1]);
    expect(c[0].facility).toEqual([12.87, 11.04]);
    expect(c[0].color).not.toBe(c[1].color);
    expect(c[1].communities[0].name).toBe("S1");
  });
  it("builds a closed outline around every point", () => {
    expect(catchmentOutline(buildCatchments(rows)[0]).length).toBeGreaterThanOrEqual(3);
  });
});
