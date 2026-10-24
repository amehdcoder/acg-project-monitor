import { describe, it, expect } from "vitest";
import { viewAsPermissions, viewAsRecordVisible } from "./viewAs";

describe("view as", () => {
  it("team member is read-only for chosen components", () => {
    const p = viewAsPermissions({ role: "team_member", components: ["eye"] });
    expect(p.edit_records).toBeUndefined();
    expect(p.components).toEqual(["eye"]);
  });
  it("clinician confirms cases as a health worker", () => {
    const p = viewAsPermissions({ role: "clinician", components: [] });
    expect(p.confirm_cases).toBe(true);
    expect(p.health_worker).toBe("Clinician");
  });
  it("narrows records by state and facility", () => {
    const v = { role: "records_officer" as const, components: [], state: "Kano", facilityId: "f1" };
    expect(viewAsRecordVisible(v, { state: "kano", facility_id: "f1" })).toBe(true);
    expect(viewAsRecordVisible(v, { state: "Jigawa", facility_id: "f1" })).toBe(false);
    expect(viewAsRecordVisible(v, { state: "Kano", facility_id: "f2" })).toBe(false);
  });
});
