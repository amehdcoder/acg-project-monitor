import { describe, it, expect } from "vitest";
import { discoverFields, autoMap, mirrorRecord } from "./fieldMapping";

describe("fieldMapping", () => {
  it("flattens nested sample JSON", () => {
    const f = discoverFields('{"patient":{"name":"Ada"},"mobile":"080"}');
    expect(f.map((x) => x.key)).toEqual(["patient.name", "mobile"]);
  });
  it("auto-detects synonyms one-to-one", () => {
    const m = autoMap(discoverFields("mobile\ngender\ndistrict"), [
      { key: "phone", label: "Phone number" }, { key: "sex", label: "Sex" }, { key: "lga", label: "LGA" }]);
    expect(Object.fromEntries(m.map((x) => [x.external, x.internal]))).toEqual({ mobile: "phone", gender: "sex", district: "lga" });
  });
  it("keeps manual choices over auto detection", () => {
    const m = autoMap([{ key: "mobile", label: "mobile" }], [{ key: "phone", label: "Phone" }, { key: "alt", label: "Alt" }],
      [{ external: "mobile", internal: "alt", confidence: 1, auto: false }]);
    expect(m).toEqual([{ external: "mobile", internal: "alt", confidence: 1, auto: false }]);
  });
  it("mirrors a sample into Amehnities keys", () => {
    expect(mirrorRecord('{"mobile":"080"}', [{ external: "mobile", internal: "phone", confidence: 1, auto: true }])).toEqual({ phone: "080" });
  });
});
