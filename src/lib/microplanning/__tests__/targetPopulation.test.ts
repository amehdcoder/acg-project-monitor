import { describe, expect, it } from "vitest";
import { targetPopulation, validTargetSelection } from "../targetPopulation";

describe("Target Population disaggregation", () => {
  it("excludes independent children 1–9 sex counts from Trachoma target totals", () => {
    expect(targetPopulation({ trachoma_0_5_months: 1, trachoma_6m_6y: 2, trachoma_7_14y: 3, trachoma_15_plus: 4, trachoma_1_9_male: 70, trachoma_1_9_female: 80 }, ["trachoma_0_5m", "trachoma_6m_6y", "trachoma_7_14y", "trachoma_15_plus"])).toBe(10);
  });
  it("sums selected standard ages exactly", () => {
    expect(targetPopulation({ estimated_children_0_4: 10, estimated_children_5_14: 30, estimated_adults_15_plus: 60 }, ["children_5_14", "adults_15_plus"])).toBe(90);
  });
  it("sums selected Trachoma ages exactly", () => {
    expect(targetPopulation({ trachoma_0_5_months: 5, trachoma_6m_6y: 20, trachoma_7_14y: 25, trachoma_15_plus: 50 }, ["trachoma_6m_6y", "trachoma_7_14y", "trachoma_15_plus"])).toBe(95);
  });
  it("rejects overlapping standard and Trachoma schemes", () => {
    expect(validTargetSelection(["children_5_14", "trachoma_7_14y"])).toBe(false);
  });
  it("rejects whole-community double counting", () => {
    expect(validTargetSelection(["total_population", "children_5_14"])).toBe(false);
  });
  it("requires a nonempty unique known selection", () => {
    for (const fields of [[], ["children_5_14", "children_5_14"], ["unknown"]]) expect(validTargetSelection(fields)).toBe(false);
  });
});