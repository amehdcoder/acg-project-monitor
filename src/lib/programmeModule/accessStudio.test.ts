import { describe, it, expect } from "vitest";
import { pageAllowed, toggleList } from "./accessStudio";
import { viewAsPermissions } from "./viewAs";

describe("access studio", () => {
  it("hides a page once switched off and shows it again when switched on", () => {
    const hidden = toggleList([], "report", false);
    expect(pageAllowed({ hidden_views: hidden }, "report")).toBe(false);
    expect(pageAllowed({ hidden_views: toggleList(hidden, "report", true) }, "report")).toBe(true);
  });
  it("saved category access replaces the built-in default in View as", () => {
    const p = viewAsPermissions({ role: "clinician", components: [] }, { view_records: true });
    expect(p.confirm_cases).toBeUndefined();
  });
  it("safeguarding officer only sees safeguarding", () => {
    const p = viewAsPermissions({ role: "safeguarding_officer", components: [] });
    expect(p).toEqual({ view_safeguarding: true });
  });
});
