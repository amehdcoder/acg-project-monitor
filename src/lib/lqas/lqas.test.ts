import { describe, it, expect } from "vitest";
import { decisionRule, lotDecision, buildPlan, aggregateCoverage } from "./lqas";

describe("LQAS rules", () => {
  it("uses the standard decision rule of 13 for n=19 at 80% target", () => {
    expect(decisionRule(19, 0.8)).toBe(13);
  });
  it("flags a lot with 12 of 19 covered for mop-up at 80%", () => {
    expect(lotDecision(12, 19, 0.8)).toBe("mop_up");
    expect(lotDecision(13, 19, 0.8)).toBe("pass");
  });
  it("selects 19 sampling points per evaluation unit and flags insecure areas", () => {
    const rows = [
      { state: "Jigawa", lga: "Dutse", ward: "A", flhf_name: "F1", community_name: "C1", estimated_total_population: 900, security_clearance: "cleared" },
      { state: "Jigawa", lga: "Dutse", ward: "B", flhf_name: "F2", community_name: "C2", estimated_total_population: 100, security_clearance: "not_cleared" },
      { state: "Jigawa", lga: "Kiyawa", ward: "C", flhf_name: "F3", community_name: "C3", estimated_total_population: 500 },
    ];
    const plan = buildPlan(rows, "lga");
    expect(plan).toHaveLength(2);
    expect(plan[0].sample).toHaveLength(19);
    expect(plan[0].insecureCommunities).toBe(1);
  });
  it("aggregates coverage across lots", () => {
    const r = aggregateCoverage([{ eu_name: "a", eu_level: "lga", sampled: 19, covered: 19 }, { eu_name: "b", eu_level: "lga", sampled: 19, covered: 10 }], 0.8);
    expect(r.passed).toBe(1);
    expect(r.mopUp).toBe(1);
    expect(r.coverage).toBeCloseTo(29 / 38, 5);
  });
});
