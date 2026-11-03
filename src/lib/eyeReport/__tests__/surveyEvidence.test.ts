import { describe, expect, it } from "vitest";
import { validateSurvey } from "../surveyEvidence";
const survey = { indicator: "ecsc", state: "Jigawa", lga: "Dutse", date: "2026-10-01", baseline_date: "2020-01-01", numerator: 45, denominator: 100, baseline_numerator: 20, baseline_denominator: 100, source: "Test survey", methodology: "Representative population sample", representative: true };
describe("saved WHO survey measurements", () => {
  it("computes cataract coverage from actual numerator and denominator", () => { expect(validateSurvey(survey).value).toBe(45); expect(validateSurvey(survey).baseline).toBe(20); });
  it("computes refractive coverage from matched populations", () => { expect(validateSurvey({ ...survey, indicator: "erec", numerator: 30, denominator: 60 }).value).toBe(50); });
  it("computes adult TT prevalence rather than a visit total", () => { expect(validateSurvey({ ...survey, indicator: "tt", numerator: 1, denominator: 1000 }).value).toBe(0.1); });
  it("computes childhood TF prevalence", () => { expect(validateSurvey({ ...survey, indicator: "tf", numerator: 4, denominator: 100 }).value).toBe(4); });
  it("keeps verified backlog as people not a population percentage", () => { const r = validateSurvey({ ...survey, indicator: "backlog", numerator: 5, baseline_numerator: 80 }); expect(r.value).toBe(5); expect(r.baseline).toBe(80); expect(r.denominator).toBeNull(); });
  it("rejects a numerator above its population", () => { expect(() => validateSurvey({ ...survey, numerator: 101 })).toThrow(); });
  it("rejects absent representative evidence", () => { expect(() => validateSurvey({ ...survey, representative: false })).toThrow(); });
});