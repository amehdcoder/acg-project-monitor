import { describe, expect, it } from "vitest";
import { blankLogframe, defaultLogframe, flatIndicators } from "./logframe";
import { validateLogframe } from "./logframeValidation";

describe("framework integrity", () => {
  it("supports a completely new design with explicit impact, outcome and output indicators", () => {
    const lf = blankLogframe({ name: "New education project" });
    lf.objectives.push({ key: "so", title: "Specific Objective", statement: "Improve education", tone: "teal", color: "#e41962", results: ["impact", "outcome", "output"].map((level, i) => ({ key: `r${i}`, title: level, level: level as "impact" | "outcome" | "output", indicators: [{ code: `I${i}`, title: "Education indicator", mov: "School register", targets: ["20"], disaggregation: ["School type"], disaggregationConfig: [{ label: "School type", kind: "options", options: ["Primary", "Secondary"] }] }], activities: [] })) });
    expect(validateLogframe(lf)).toEqual([]);
    expect(flatIndicators(lf.objectives).map(i => i.kind)).toEqual(["impact", "outcome", "output"]);
    expect(flatIndicators(lf.objectives)[0].mov).toBe("School register");
  });
  it("rejects duplicate custom disaggregation options", () => {
    const lf = defaultLogframe();
    lf.objectives[0].results[0].indicators[0].disaggregationConfig = [{ label: "School", kind: "options", options: ["Primary", "primary"] }];
    expect(validateLogframe(lf).some(e => e.includes("unique, non-empty options"))).toBe(true);
  });
  it("accepts any valid user colour but rejects CSS injection", () => {
    const lf = defaultLogframe(); lf.objectives[0].color = "#f018ac";
    expect(validateLogframe(lf)).toEqual([]);
    lf.objectives[0].color = "url(https://example.org)";
    expect(validateLogframe(lf).some(e => e.includes("hex colour"))).toBe(true);
  });
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