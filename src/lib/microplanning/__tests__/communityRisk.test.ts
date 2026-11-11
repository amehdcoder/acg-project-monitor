import { describe, expect, it } from "vitest";
import { communityRisk } from "../communityRisk";

describe("community planning risk index", () => {
  const baseline = { security_clearance: "cleared", accessibility: "accessible", cdd_names: "Amina" };
  it("assigns security 0, 25 or 50 points", () => {
    expect(["cleared", "partial", "not_cleared"].map(security_clearance => communityRisk({ ...baseline, security_clearance }).score)).toEqual([0, 25, 50]);
  });
  it("assigns access 0, 15, 25 or 30 points", () => {
    expect(["accessible", "seasonal", "hard_to_reach", "inaccessible"].map(accessibility => communityRisk({ ...baseline, accessibility }).score)).toEqual([0, 15, 25, 30]);
  });
  it("assigns 20 points only for explicit CDD absence", () => {
    for (const cdd_names of ["none", "nil", "0", "no CDDs"]) expect(communityRisk({ ...baseline, cdd_names }).score).toBe(20);
    expect(communityRisk(baseline).score).toBe(0);
  });
  it("does not treat missing CDD names as confirmed absence", () => {
    for (const cdd_names of ["", "—", "-", "N/A", "unknown", "not recorded"]) {
      expect(communityRisk({ ...baseline, cdd_names })).toMatchObject({ score: null, minimum: 0, maximum: 20, band: "Incomplete" });
    }
  });
  it("flags unknown security and access without a false low score", () => {
    expect(communityRisk({})).toMatchObject({ score: null, minimum: 0, maximum: 100 });
    expect(communityRisk({ ...baseline, security_clearance: "unknown" })).toMatchObject({ score: null, maximum: 50 });
    expect(communityRisk({ ...baseline, accessibility: "unrecognised" })).toMatchObject({ score: null, maximum: 30 });
  });
  it("combines all three factors and applies the risk bands", () => {
    expect(communityRisk(baseline).band).toBe("Low");
    expect(communityRisk({ ...baseline, security_clearance: "partial" }).band).toBe("Moderate");
    expect(communityRisk({ ...baseline, security_clearance: "not_cleared" }).band).toBe("High");
    expect(communityRisk({ security_clearance: "not cleared", accessibility: "inaccessible", cdd_names: "none" })).toMatchObject({ score: 100, band: "Critical" });
    expect(communityRisk({ ...baseline, security_clearance: "not_cleared", accessibility: "hard_to_reach" })).toMatchObject({ score: 75, band: "Critical" });
  });
});