import { describe, it, expect } from "vitest";
import { inbound, outbound, cleanMaps } from "./connectionTransform";

const maps = [
  { external: "patient.name", internal: "full_name" }, { external: "uid", internal: "case_id" },
  { external: "mobile", internal: "profile.phone" }, { external: "visit_date", internal: "service.service_date" },
  { external: "va_right", internal: "service.data.va_right" },
];
describe("connectionTransform", () => {
  it("translates an incoming record into person, profile and service", () => {
    const r = inbound({ patient: { name: "Aisha" }, uid: "C-1", mobile: "080", visit_date: "2026-11-20", va_right: "6/9" }, maps);
    expect(r.beneficiary).toEqual({ full_name: "Aisha", case_id: "C-1", profile: { phone: "080" } });
    expect(r.service).toEqual({ service_date: "2026-11-20", data: { va_right: "6/9" } });
  });
  it("translates an outgoing record into the other app's field names", () => {
    expect(outbound({ full_name: "Aisha", case_id: "C-1", profile: { phone: "080" } }, { service_date: "2026-11-20", data: { va_right: "6/9" } }, maps))
      .toEqual({ patient: { name: "Aisha" }, uid: "C-1", mobile: "080", visit_date: "2026-11-20", va_right: "6/9" });
  });
  it("rejects unsafe mapping paths", () => {
    expect(cleanMaps([{ external: "__proto__.x", internal: "full_name" }, { external: "a", internal: "b" }]).length).toBe(1);
    expect(outbound({ full_name: "x" }, null, [{ external: "__proto__.polluted", internal: "full_name" }])).toEqual({});
  });
});

import { inbound as inb2, cleanMaps as cm2 } from "./connectionTransform";
import { it as it2, expect as ex2 } from "vitest";
it2("keeps Kobo/ODK group paths like respondent/name", () => {
  const maps = cm2([{ external: "respondent/name", internal: "full_name" }]);
  ex2(maps).toHaveLength(1);
  ex2(JSON.stringify(inb2({ "respondent/name": "Amina" }, maps))).toContain("Amina");
});

it2("reads DHIS2 attribute lists by display name", () => {
  const maps = cm2([{ external: "attributes.First name", internal: "full_name" }]);
  ex2(JSON.stringify(inb2({ attributes: [{ displayName: "First name", value: "John" }] }, maps))).toContain("John");
});
