import { describe, expect, it } from "vitest";
import { isTrachomaTarget, trachomaChildrenTotals } from "../trachomaChildren";
describe("Trachoma children population KPI", () => {
  it("appears only for valid Trachoma target selections", () => {
    expect(isTrachomaTarget(["trachoma_6m_6y", "trachoma_7_14y"])).toBe(true);
    expect(isTrachomaTarget(["trachoma_15_plus"])).toBe(true);
    for (const fields of [[], ["children_5_14"], ["total_population"], ["children_5_14", "trachoma_7_14y"], ["unknown"]]) expect(isTrachomaTarget(fields)).toBe(false);
  });
  it("sums only independent male/female 1–9 counts from the supplied scope", () => {
    const rows = [{ trachoma_1_9_male: 70, trachoma_1_9_female: 80, trachoma_6m_6y: 500 }, { trachoma_1_9_male: 10, trachoma_1_9_female: 20 }];
    expect(trachomaChildrenTotals(rows)).toMatchObject({ male: 80, female: 100, total: 180, complete: 2, communities: 2 });
    expect(trachomaChildrenTotals(rows.slice(1)).total).toBe(30);
    expect(trachomaChildrenTotals([{ ...rows[0], trachoma_1_9_male: 90 }]).total).toBe(170);
  });
  it("distinguishes missing evidence from recorded zero and partial evidence", () => {
    expect(trachomaChildrenTotals([{ trachoma_6m_6y: 500 }])).toMatchObject({ anyRecorded: false, complete: 0, total: 0 });
    expect(trachomaChildrenTotals([{ trachoma_1_9_male: 0, trachoma_1_9_female: 0 }])).toMatchObject({ anyRecorded: true, complete: 1, total: 0 });
    expect(trachomaChildrenTotals([{ trachoma_1_9_male: 7 }, { trachoma_1_9_female: -1 }])).toMatchObject({ total: 7, complete: 0, maleRecorded: 1, femaleRecorded: 0 });
  });
});