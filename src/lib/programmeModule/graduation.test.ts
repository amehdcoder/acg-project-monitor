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

import { graduationOverview, GRADUATION_STAGES as STAGES } from "./graduation";
describe("graduationOverview", () => {
  const bens = [
    { id: "a", full_name: "A", lga: "Kano", profile: { graduation: { status: "selected" } } },
    { id: "b", full_name: "B", lga: "Kano", profile: { graduation: { status: "verified" } } },
    { id: "c", full_name: "C", lga: "Dala", profile: { graduation: { status: "not_selected" } } },
    { id: "d", full_name: "D", lga: null, profile: {} },
  ];
  it("counts the selection gate sequentially and excludes non-livelihood records", () => {
    const o = graduationOverview(bens, [{ beneficiary_id: "a", service_name: STAGES[0], service_date: "2026-10-01" }]);
    expect(o.totals.tracked).toBe(3);
    expect(o.funnel.slice(0, 3).map(s => s.count)).toEqual([3, 3, 1]);
    expect(o.funnel[3].count).toBe(1);
    expect(o.totals.graduated).toBe(0);
  });
  it("marks a selected beneficiary graduated only when every stage is recorded", () => {
    const o = graduationOverview([bens[0]], STAGES.map(s => ({ beneficiary_id: "a", service_name: s })));
    expect(o.totals.graduated).toBe(1);
    expect(o.totals.avgPercent).toBe(100);
  });
});
