import { describe, it, expect } from "vitest";
import { buildAccessPermissions, ALL_PAGE_KEYS } from "./addUsersAccess";

const all = { components: [], pages: [], beneficiaryIds: [] };

describe("add users access", () => {
  it("view only cannot record", () => {
    const p = buildAccessPermissions("view", all);
    expect(p.view_records).toBe(true);
    expect(p.edit_records).toBeUndefined();
    expect(p.record_services).toBeUndefined();
  });
  it("view & record can see and record", () => {
    const p = buildAccessPermissions("view_record", all);
    expect(p.view_records && p.edit_records && p.record_services).toBe(true);
  });
  it("record only cannot browse records or dashboards", () => {
    const p = buildAccessPermissions("record", all);
    expect(p.view_records).toBeUndefined();
    expect(p.record_services).toBe(true);
    expect(p.hidden_views).toContain("dashboard");
  });
  it("limits to chosen components, tabs and records", () => {
    const p = buildAccessPermissions("view", { components: ["mmdp"], pages: ["records"], beneficiaryIds: ["b1"] });
    expect(p.components).toEqual(["mmdp"]);
    expect(p.hidden_views).toHaveLength(ALL_PAGE_KEYS.length - 1);
    expect(p.hidden_views).not.toContain("records");
    expect(p.beneficiary_ids).toEqual(["b1"]);
  });
});
