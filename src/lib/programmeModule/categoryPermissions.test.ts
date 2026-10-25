import { describe, expect, it } from "vitest";
import { resolveCategoryPermissions } from "./categoryPermissions";

describe("saved category enforcement", () => {
  it("revokes stale individual action grants when the category denies them", () => {
    const p = resolveCategoryPermissions({ access_category: "clinician", record_services: true }, { clinician: { view_records: true, record_services: false, hidden_views: ["risk"], hidden_sections: ["care"] } });
    expect(p.record_services).toBe(false);
    expect(p.hidden_views).toEqual(["risk"]);
    expect(p.hidden_sections).toEqual(["care"]);
  });
  it("keeps assigned component scope, not stale category actions", () => {
    const p = resolveCategoryPermissions({ access_category: "team_member", components: ["eye"], edit_records: true }, { team_member: { view_records: true } });
    expect(p.components).toEqual(["eye"]);
    expect(p.edit_records).toBeUndefined();
  });
  it("reset uses category defaults instead of previously copied permissions", () => {
    const p = resolveCategoryPermissions({ access_category: "team_member", manage_team: true }, {});
    expect(p.manage_team).toBeUndefined();
    expect(p.view_records).toBe(true);
  });
  it("does not alter users without an assigned category", () => {
    expect(resolveCategoryPermissions({ edit_records: true }, {})).toEqual({ edit_records: true });
  });
});