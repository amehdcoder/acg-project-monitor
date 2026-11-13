import { describe, expect, it } from "vitest";
import { projectRoleAccess, projectAccessIds, scopedProjectAccess, type MicroplanProjectAccess } from "../projectRoles";

const projects: MicroplanProjectAccess[] = [
  { project_id: "givewell", project_name: "GIveWell", access_level: "dashboard" },
  { project_id: "bmz", project_name: "BMZ", access_level: "entry" },
];

describe("project-specific microplanning roles", () => {
  it("collectors receive entry access, not the full dashboard", () => {
    expect(projectRoleAccess("collector")).toBe("entry");
  });
  it("an explicit dashboard role receives dashboard access", () => {
    expect(projectRoleAccess("dashboard")).toBe("dashboard");
  });
  it("a dashboard role never expands to another project", () => {
    expect(projectAccessIds(projects, "dashboard")).toEqual(["givewell"]);
    expect(scopedProjectAccess(projects, "bmz")).toBe("entry");
    expect(scopedProjectAccess(projects, "unassigned")).toBe("none");
  });
  it("removing an explicit role does not invent another permission", () => {
    expect(projectRoleAccess(null)).toBe("none");
  });
});