import { describe, expect, it } from "vitest";
import { initialAppTab, requiredWorkspace } from "./appLanding";

describe("app landing rules", () => {
  it("defaults all unrestricted users to Forms regardless of their previous tab", () => {
    for (const previousTab of ["records", "dashboard", "microplanning"]) {
      sessionStorage.setItem("amehnities:active-tab", previousTab);
      expect(initialAppTab(null)).toBe("forms");
    }
    sessionStorage.removeItem("amehnities:active-tab");
    expect(requiredWorkspace(false, false)).toBeNull();
  });

  it("retains intentionally opened tab links", () => {
    expect(initialAppTab("records")).toBe("records");
  });

  it("opens the required full-screen Records workspace", () => {
    expect(requiredWorkspace(false, true)).toBe("records");
  });

  it("opens required full-screen Microplanning even when Records is also available", () => {
    expect(requiredWorkspace(true, false)).toBe("geo");
    expect(requiredWorkspace(true, true)).toBe("geo");
  });
});