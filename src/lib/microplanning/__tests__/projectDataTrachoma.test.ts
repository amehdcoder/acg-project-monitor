import { describe, it, expect } from "vitest";
import { buildProjectAggregates, ageBandsFor } from "../projectDataExcel";
const rows = [
  { state: "Kano", lga: "Gwale", ward: "W1", community_name: "A", trachoma_0_5_months: 2, trachoma_6m_6y: 10, trachoma_7_14y: 8, trachoma_15_plus: 30, trachoma_1_9_male: 4, trachoma_1_9_female: 5, estimated_children_0_4: 99 },
  { state: "Kano", lga: "Gwale", ward: "W2", community_name: "B", trachoma_0_5_months: 1, trachoma_6m_6y: 5, trachoma_7_14y: 4, trachoma_15_plus: 20, trachoma_1_9_male: 3, trachoma_1_9_female: 2 },
];
describe("complete data export age groups", () => {
  it("uses Trachoma age groups and the separate 5–9 cohort for Trachoma projects", () => {
    expect(ageBandsFor("trachoma").map(b => b.label)).toEqual(["0–5 months", "6 months–6 yrs", "7–14 yrs", "15+ yrs", "Children 5–9 yrs (male)", "Children 5–9 yrs (female)"]);
    expect(buildProjectAggregates(rows, "trachoma").totals.ages).toEqual([3, 15, 12, 50, 7, 7]);
  });
  it("keeps standard age groups for other projects", () => {
    expect(buildProjectAggregates(rows).totals.ages).toEqual([99, 0, 0]);
  });
});
