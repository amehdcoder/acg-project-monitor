import { describe, expect, it } from "vitest";
import { correlatePairs, correlationMatrix, CORRELATION_GROUPS, tiedRanks } from "../correlations";
describe("microplanning correlations", () => {
  it("uses average ranks for ties", () => { expect(tiedRanks([10, 20, 20, 40])).toEqual([1, 2.5, 2.5, 4]); });
  it("computes exact positive and negative relationships", () => {
    expect(correlatePairs([1,2,3,4,5].map(x => ({ x, y: x*2 })), "pearson").value).toBeCloseTo(1);
    expect(correlatePairs([1,2,3,4,5].map(x => ({ x, y: 10-x })), "spearman").value).toBeCloseTo(-1);
  });
  it("withholds correlations below five paired records", () => { expect(correlatePairs([{ x: 1, y: 2 }], "pearson").value).toBeNull(); });
  it("never makes constant-series or constant diagonal correlations equal one", () => { expect(correlatePairs([1,2,3,4,5].map(x => ({ x, y: 0 })), "spearman").value).toBeNull(); });
  it("excludes missing values pairwise but retains real zeros", () => {
    const rows = [0,1,2,3,4].map(v => ({ estimated_total_population: v, number_of_households: v }));
    const m = correlationMatrix([...rows, { estimated_total_population: 6, number_of_households: null }], CORRELATION_GROUPS[0].metrics, "spearman");
    expect(m[0][1].n).toBe(5); expect(m[0][1].value).toBeCloseTo(1);
  });
  it("does not encode unknown access/security or missing staff as zero", () => {
    const metrics = CORRELATION_GROUPS[1].metrics;
    expect(metrics[3].value({ accessibility: "unknown" })).toBeNull(); expect(metrics[4].value({ security_clearance: "unknown" })).toBeNull(); expect(metrics[5].value({ cdd_names: "" })).toBeNull();
    expect(metrics[3].value({ accessibility: "accessible" })).toBe(0); expect(metrics[4].value({ security_clearance: "not_cleared" })).toBe(1);
  });
});