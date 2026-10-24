import { describe, expect, it } from "vitest";
import { memberComponentFilter, memberDashboardAllowed } from "./projectTeam";

describe("project team component and dashboard grants", () => {
  it("allows every dashboard when none are selected", () => {
    expect(memberDashboardAllowed({} as any, "graduation")).toBe(true);
  });
  it("limits dashboards to the selected ones", () => {
    const p = { dashboards: ["dashboard", "facility"] } as any;
    expect(memberDashboardAllowed(p, "facility")).toBe(true);
    expect(memberDashboardAllowed(p, "graduation")).toBe(false);
  });
  it("limits components to the selected ones", () => {
    const f = memberComponentFilter({ components: ["eye_health"] } as any)!;
    expect(f({ key: "eye_health" })).toBe(true);
    expect(f({ key: "livelihood" })).toBe(false);
    expect(memberComponentFilter({} as any)).toBeUndefined();
  });
});
