import { describe, it, expect } from "vitest";
import { createFacilityNormalizer } from "../facilityNames";
const r = (facility_name: string, lga = "Dutse") => ({ project_id: "p", state: "Jigawa", lga, facility_name });
describe("automatic facility spelling merge", () => {
  it("merges an LGA-suffixed name with the plain name", () => {
    const rows = [r("Rasheed shekoni federal university teaching hospital Dutse"), r("Rasheed shekoni federal university teaching hospital")];
    const n = createFacilityNormalizer(rows);
    expect(new Set(rows.map(x => n(x).facility_name)).size).toBe(1);
  });
  it("merges small typos and case variants", () => {
    const rows = [r("Kazaure General hospital", "Kazaure"), r("Kazaure Generl Hospital", "Kazaure"), r("KAZAURE GENERAL HOSPITAL", "Kazaure")];
    const n = createFacilityNormalizer(rows);
    expect(new Set(rows.map(x => n(x).facility_name)).size).toBe(1);
  });
  it("keeps numbered and other-LGA facilities separate", () => {
    const rows = [r("Primary Health Centre 1"), r("Primary Health Centre 2"), r("Dutse General Hospital"), r("Dutse General Hospital", "Ringim")];
    const n = createFacilityNormalizer(rows);
    expect(new Set(rows.map(x => `${x.lga}|${n(x).facility_name}`)).size).toBe(4);
  });
});
