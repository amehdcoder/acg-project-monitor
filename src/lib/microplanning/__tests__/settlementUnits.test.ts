import { describe, it, expect } from "vitest";
import { countSettlementUnits } from "../settlementUnits";
const b = { state: "Kano", lga: "Gwale", ward: "W1", flhf_name: "PHC A" };
describe("countSettlementUnits", () => {
  it("adds unique settlements to communities without settlements", () => {
    const r = countSettlementUnits([
      { ...b, community_name: "Alpha", settlement_name: "S1" },
      { ...b, community_name: "Alpha", settlement_name: "s1 " },
      { ...b, community_name: "Alpha", settlement_name: "S2" },
      { ...b, community_name: "Beta", settlement_name: null },
      { ...b, community_name: "Gamma", settlement_name: "" },
    ]);
    expect(r).toEqual({ uniqueSettlements: 2, communitiesWithoutSettlements: 2, communities: 3, total: 4 });
  });
  it("does not count a community whose parent row also has settlements", () => {
    const r = countSettlementUnits([
      { ...b, community_name: "Alpha", settlement_name: null },
      { ...b, community_name: "Alpha", settlement_name: "S1" },
    ]);
    expect(r.total).toBe(1);
  });
  it("keeps same-named settlements in different communities separate", () => {
    const r = countSettlementUnits([
      { ...b, community_name: "Alpha", settlement_name: "Sabon Gari" },
      { ...b, community_name: "Beta", settlement_name: "Sabon Gari" },
    ]);
    expect(r.uniqueSettlements).toBe(2);
  });
});
