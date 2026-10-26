import { describe, it, expect } from "vitest";
import { computeEyeIndicators } from "../eyeIndicators";
import shared from "../../../../supabase/functions/_shared/eyeIndicators.ts?raw";
import local from "../eyeIndicators.ts?raw";

const val = (out: { indicator_key: string; value: number }[], k: string) => out.find((v) => v.indicator_key === k)!.value;
describe("eye DHIS2 indicators", () => {
  it("sums consultations by sex and counts distinct facilities", () => {
    const out = computeEyeIndicators([
      { facility_name: "PHC A", summary: { consult: { a0_14: { m: 2, f: 3 }, a40: { m: 1, f: 0 } } }, csom: null },
      { facility_name: "phc a ", summary: { consult: { a15_39: { m: 0, f: 4 } } }, csom: null },
    ]);
    expect(val(out, "eye_daily:consulted")).toBe(10);
    expect(val(out, "eye_daily:consulted:female")).toBe(7);
    expect(val(out, "eye_daily:facilities_reporting")).toBe(1);
    expect(val(out, "eye_daily:reports_submitted")).toBe(2);
  });
  it("reports zero pinhole as zero without affecting presenting outcomes", () => {
    const out = computeEyeIndicators([{ summary: {}, csom: { surgeries: 4, discharge: { presenting: { good: 3, borderline: 1, poor: 0 }, pinhole: { good: 0, borderline: 0, poor: 0 } } } }]);
    expect(val(out, "eye_daily:discharge_presenting_good")).toBe(3);
    expect(val(out, "eye_daily:discharge_pinhole_poor")).toBe(0);
  });
  it("server mirror is identical", () => { expect(shared).toBe(local); });
});
