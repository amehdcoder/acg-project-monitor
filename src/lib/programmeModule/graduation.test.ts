import { describe, expect, it } from "vitest";
import { GRADUATION_STAGES, pathwayPercent, stageProgress } from "./graduation";

describe("graduation pathway", () => {
  it("tracks the 10 delivery stages after selection", () => {
    expect(GRADUATION_STAGES).toHaveLength(10);
  });
  it("counts stages from recorded services", () => {
    const p = stageProgress([
      { service_name: "Skills acquisition training", service_date: "2026-01-02" },
      { service_name: "skills acquisition training", service_date: "2026-03-02" },
    ]);
    const skills = p.find((s) => s.stage === "Skills acquisition training")!;
    expect(skills.count).toBe(2);
    expect(skills.lastDate).toBe("2026-03-02");
    expect(pathwayPercent(p)).toBe(10);
  });
});
