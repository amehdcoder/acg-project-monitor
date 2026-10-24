import { describe, expect, it } from "vitest";
import { FACILITY_WORKSPACE_VIEWS, facilityRowVisible, facilityCanWrite, isFacilityClinicalComponent } from "./facilityScope";

describe("facility focal-person boundaries", () => {
  it("allows only the specified facility workflows and Field guide", () => {
    expect([...FACILITY_WORKSPACE_VIEWS].sort()).toEqual(["casesearch", "facility", "followups", "guide", "households", "overview", "people", "records"]);
  });
  it("includes only eye, NTD and mental health components", () => {
    expect(["eye_health", "mmdp_ntd", "mental_health", "livelihood", "wash"].filter((key) => isFacilityClinicalComponent({ key }))).toEqual(["eye_health", "mmdp_ntd", "mental_health"]);
  });
  it("excludes unassigned facilities and unplaced beneficiaries", () => {
    const levels = { assigned: "record" as const };
    expect(facilityRowVisible("assigned", levels)).toBe(true);
    expect(facilityRowVisible("other", levels)).toBe(false);
    expect(facilityRowVisible(null, levels)).toBe(false);
  });
  it("preserves read-only versus record/manage access", () => {
    expect(facilityCanWrite({ assigned: "view" })).toBe(false);
    expect(facilityCanWrite({ assigned: "record" })).toBe(true);
    expect(facilityCanWrite({ assigned: "manage" })).toBe(true);
  });
});