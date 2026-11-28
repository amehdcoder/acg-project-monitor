import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { specialCollectionCodes, specialFormId, isCollectionForm } from "./projectFormCatalogue";
const access = (patch = {}) => ({ admin: false, owner: false, adhoc: false, restricted: false, assigned: new Set<string>(), disabled: new Set<string>(), bmz: new Set<string>(), microplan: new Set<string>(), eye: new Set<string>(), irf: new Set<string>(), ...patch });
describe("project collection download catalogue", () => {
  it("includes special and standard recording tools, never dashboards", () => {
    const codes = specialCollectionCodes("p1", access());
    expect(codes).toContain("seeclear_form"); expect(codes).toContain("attendance"); expect(codes).toContain("wg_ss"); expect(codes.some(c => c.endsWith("_dash"))).toBe(false);
    expect(isCollectionForm({ name: "Custom special collection", settings: { specialStudio: true, dashboardEnabled: true } })).toBe(true);
    expect(isCollectionForm({ name: "Monitoring Dashboard" })).toBe(false);
  });
  it("adhoc and restricted users receive only explicitly assigned collectors", () => {
    for (const patch of [{ adhoc: true }, { restricted: true }]) {
      expect(specialCollectionCodes("p1", access({ ...patch, assigned: new Set(["seeclear_form", "seeclear_dash"]) }))).toEqual(["seeclear_form"]);
    }
  });
  it("disabling an assigned form removes it from downloads", () => {
    expect(specialCollectionCodes("p1", access({ adhoc: true, assigned: new Set(["wg_ss"]), disabled: new Set(["wg_ss"]) }))).toEqual([]);
  });
  it("Eye reporting requires the project report grant, not dashboard access", () => {
    expect(specialCollectionCodes("p1", access({ eye: new Set(["p1"]) }))).toContain("eye_daily");
    expect(specialCollectionCodes("p2", access({ eye: new Set(["p1"]) }))).not.toContain("eye_patient_wg");
  });
  it("BMZ, Microplanning and category reporting retain concrete project scope", () => {
    const granted = access({ bmz: new Set(["p1"]), microplan: new Set(["p1"]), irf: new Set(["p1"]) });
    for (const code of ["bmz_form", "microplan_entry", "irf_form"]) { expect(specialCollectionCodes("p1", granted)).toContain(code); expect(specialCollectionCodes("p2", granted)).not.toContain(code); }
    expect(specialFormId("p1", "wg_ss")).not.toBe(specialFormId("p2", "wg_ss"));
  });
});