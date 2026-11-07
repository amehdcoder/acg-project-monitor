import { describe, expect, it } from "vitest";
import { assessDesign, classifySample, wilsonInterval } from "./quality";

describe("LQAS evidence safeguards", () => {
  it("accepts the configured 19-person 80/50 design with both risks under 10%", () => {
    const r = assessDesign(19, 80, 50);
    expect(r.d).toBe(13); expect(r.acceptable).toBe(true);
    expect(r.alpha).toBeCloseTo(0.067600, 5);
    expect(r.beta).toBeCloseTo(0.083534, 5);
  });
  it("rejects narrow thresholds that do not separate poor coverage", () => {
    expect(assessDesign(19, 80, 75).acceptable).toBe(false);
  });
  it("rejects noninteger sample sizes and reversed thresholds", () => {
    expect(assessDesign(19.5, 80, 50).valid).toBe(false);
    expect(assessDesign(19, 50, 80).valid).toBe(false);
  });
  it("does not fail or pass an incomplete 18-person sample", () => {
    expect(classifySample(18, 18, 19, 13)).toBe("incomplete");
    expect(classifySample(0, 18, 19, 13)).toBe("incomplete");
  });
  it("withholds decisions for oversampling or sampling deviations", () => {
    expect(classifySample(19, 20, 19, 13)).toBe("invalid");
    expect(classifySample(15, 19, 19, 13, true)).toBe("review");
  });
  it("classifies exact complete samples at the saved pass mark", () => {
    expect(classifySample(13, 19, 19, 13)).toBe("pass");
    expect(classifySample(12, 19, 19, 13)).toBe("mop_up");
  });
  it("retains uncertainty even with 19 of 19 covered", () => {
    expect(wilsonInterval(19, 19)?.lower).toBeCloseTo(0.8318, 3);
    expect(wilsonInterval(19, 19)?.upper).toBeCloseTo(1);
  });
});