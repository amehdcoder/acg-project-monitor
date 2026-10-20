import { describe, expect, it } from "vitest";
import { referralCompletionPercent } from "./referralMetrics";

describe("referral completion percentage", () => {
  it("expresses three completed referrals out of four as 75 percent", () => {
    expect(referralCompletionPercent(3, 4)).toBe(75);
  });
  it("returns zero when no referrals have been recorded", () => {
    expect(referralCompletionPercent(0, 0)).toBe(0);
  });
  it("rounds to two percentage decimal places", () => {
    expect(referralCompletionPercent(2, 3)).toBe(66.67);
  });
});