import { describe, it, expect } from "vitest";
import { reconciliationUsage, validActualUsage } from "../reconciliationUsage";
describe("allocation defaults and actual medicine use", () => {
  it("defaults missing usage to saved allocation and updates with the latest allocation", () => {
    expect(reconciliationUsage(160, null, true)).toBe(160);
    expect(reconciliationUsage(200, null, true)).toBe(200);
    expect(reconciliationUsage(160, null, false)).toBe(0);
  });
  it("preserves actual use including zero instead of overwriting with allocation", () => {
    expect(reconciliationUsage(160, 80, true)).toBe(80);
    expect(reconciliationUsage(160, 0, true)).toBe(0);
    expect(160 - reconciliationUsage(160, 80, true) - 10 - 5).toBe(65);
  });
  it("accepts nonnegative whole quantities and rejects invalid actual usage", () => {
    expect(validActualUsage("0")).toBe(true);
    expect(validActualUsage("160")).toBe(true);
    for (const value of ["", "-1", "1.5", "NaN", "Infinity"]) expect(validActualUsage(value)).toBe(false);
  });
});