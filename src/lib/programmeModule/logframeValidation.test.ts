import { describe, expect, it } from "vitest";
import { defaultLogframe } from "./logframe";
import { validateLogframe } from "./logframeValidation";

describe("framework integrity", () => {
  it("accepts the complete existing framework", () => expect(validateLogframe(defaultLogframe())).toEqual([]));
  it("rejects duplicate indicator codes to prevent overwriting values", () => {
    const lf = defaultLogframe();
    lf.objectives[0].results[0].indicators[1].code = lf.objectives[0].results[0].indicators[0].code;
    expect(validateLogframe(lf).some(e => e.startsWith("Duplicate code:"))).toBe(true);
  });
  it("rejects referral completion targets above 100 percent", () => {
    const lf = defaultLogframe();
    const indicator = lf.objectives[0].results[3].indicators.find(i => i.autoKey === "referral_completion");
    if (!indicator) throw new Error("Referral indicator missing");
    indicator.targets[0] = "101";
    expect(validateLogframe(lf).some(e => e.includes("between 0 and 100%"))).toBe(true);
  });
});