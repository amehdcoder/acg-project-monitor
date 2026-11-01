import { describe, expect, it } from "vitest";
import { MILESTONES, milestoneProgress, parseMilestones, type MilestoneObservation } from "../milestones";
const row = { indicator: "ecsc", state: "Jigawa", lga: "Dutse", date: "2026-01-01", value: 40, baseline: 20, baseline_date: "2020-01-01", source: "Population survey" } as MilestoneObservation;
describe("WHO milestone evidence", () => {
  it("uses official 30 and 40 percentage-point coverage gains", () => {
    expect(MILESTONES.find((m)=>m.key==="ecsc")?.target).toBe(30);
    expect(MILESTONES.find((m)=>m.key==="erec")?.target).toBe(40);
    expect(milestoneProgress("ecsc",[row])?.completion).toBeCloseTo(66.6667,3);
  });
  it("requires strict WHO TT and TF thresholds", () => {
    expect(milestoneProgress("tt",[{...row,indicator:"tt",baseline:2,value:0.2}])?.reached).toBe(false);
    expect(milestoneProgress("tt",[{...row,indicator:"tt",baseline:2,value:0.19}])?.reached).toBe(true);
    expect(milestoneProgress("tf",[{...row,indicator:"tf",baseline:10,value:5}])?.reached).toBe(false);
  });
  it("never forecasts from sparse or stale surveys or mixed districts", () => {
    expect(milestoneProgress("ecsc",[row])?.forecast).toBe("Insufficient evidence");
    expect(milestoneProgress("ecsc",[row,{...row,lga:"Hadejia"}])).toBeNull();
    expect(milestoneProgress("ecsc",[row,{...row,date:"2026-06-01",value:42},{...row,date:"2026-10-01",value:45}],new Date("2029-11-01"))?.forecast).toBe("Insufficient evidence");
  });
  it("forecasts a measured improving series toward 2030", () => {
    const result = milestoneProgress("ecsc",[row,{...row,date:"2026-06-01",value:42},{...row,date:"2026-10-01",value:45}],new Date("2026-11-01"));
    expect(result?.forecast).toBe("On track"); expect(result?.crossing).toMatch(/^2027/);
  });
  it("rejects invented baselines, duplicate observations and invalid percentages", () => {
    expect(()=>parseMilestones([{...row,baseline_date:"2021-01-01"}])).toThrow();
    expect(()=>parseMilestones([row,row])).toThrow();
    expect(()=>parseMilestones([{...row,value:101}])).toThrow();
    expect(parseMilestones([row])).toHaveLength(1);
  });
});