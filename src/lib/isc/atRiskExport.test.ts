/**
 * Medicine Accountability — at-risk register export contract.
 *
 * Verifies the CSV / Excel payload carries the correct community-at-risk rows
 * and the correct CDD / FLHF contact fields, and that phone harvesting copes
 * with missing, malformed and multiple numbers.
 */
import { describe, it, expect } from "vitest";
import { parseLogistics } from "./medicineAccountability";
import { buildAtRiskCommunities } from "./atRiskCommunities";
import {
  AT_RISK_COLUMNS, NONE_RECORDED, NOT_CAPTURED, buildAtRiskExportRows, flattenAtRisk,
} from "./atRiskExport";

const checklist = (over: Record<string, unknown> = {}) => ({
  State: "Kano", LGA: "Dala", Ward: "Gwammaja", COMMUNITIES: "Yakasai",
  FLHF: "Gwammaja PHC",
  Status_of_MDA: "not_started",
  Does_CDI_CDD_have_sufficient_d: "No,_all_are_insufficient",
  Specify_the_medicine_s_are_NOT_SUFFICIENT: "Ivermectin",
  Independent_Monitor_s_Name: "Aisha Bello",
  _submission_time: "2026-08-20T09:00:00",
  ...over,
});

/** One logistics submission with a Level 3 (facility → CDD) repeat. */
const logisticsRaw = (over: {
  state?: string; lga?: string; ward?: string; community?: string;
  cdd?: string; cddPhone?: unknown; inCharge?: string; inChargePhone?: unknown;
  medicine?: string; qty?: number;
} = {}) => ({
  State: over.state ?? "Kano",
  LGA: over.lga ?? "Dala",
  Ward: over.ward ?? "Gwammaja",
  Health_Facility_Name: "Gwammaja PHC",
  Health_Facility_In_Charge_Name: over.inCharge ?? "Musa Danladi",
  ...(over.inChargePhone !== undefined ? { FLHF_In_Charge_Phone: over.inChargePhone } : {}),
  group_xm3rz84: [
    {
      Target_Community_Settlement: over.community ?? "Yakasai",
      CDD_Name: over.cdd ?? "Hauwa Idris",
      ...(over.cddPhone !== undefined ? { CDD_Phone_Number: over.cddPhone } : {}),
      group_je4ry53: [
        { Medicine_IssuedtoCDD: over.medicine ?? "ivermectin", Quantity_Issued_to_CDD: over.qty ?? 120 },
      ],
    },
  ],
});

const build = (checklistRows: any[], logisticsRows: any[]) =>
  flattenAtRisk(buildAtRiskCommunities(checklistRows, parseLogistics(logisticsRows), "both"));

describe("at-risk export — rows", () => {
  it("exports only communities that are blocked AND short of medicines", () => {
    const rows = build(
      [
        checklist(),
        checklist({ COMMUNITIES: "Kofar Mazugal", Status_of_MDA: "ongoing" }),
        checklist({ COMMUNITIES: "Dandago", Does_CDI_CDD_have_sufficient_d: "Yes,_all_are_sufficient" }),
        checklist({ COMMUNITIES: "Madigawa", Status_of_MDA: "halted" }),
      ],
      [logisticsRaw()],
    );
    expect(rows.map((r) => r.community).sort()).toEqual(["Madigawa", "Yakasai"]);
  });

  it("projects every declared column into the export payload", () => {
    const out = buildAtRiskExportRows(build([checklist()], [logisticsRaw()]));
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(AT_RISK_COLUMNS.map((c) => c.key).sort());
  });

  it("carries CDD and FLHF contact fields plus the medicines issued", () => {
    const [row] = buildAtRiskExportRows(
      build([checklist()], [logisticsRaw({ cddPhone: "08031234567", inChargePhone: "08099998888" })]),
    );
    expect(row.community).toBe("Yakasai");
    expect(row.ward).toBe("Gwammaja");
    expect(row.lga).toBe("Dala");
    expect(row.state).toBe("Kano");
    expect(row.cddList).toBe("Hauwa Idris");
    expect(row.cddPhoneList).toBe("08031234567");
    expect(row.inCharge).toBe("Musa Danladi");
    expect(row.inChargePhone).toBe("08099998888");
    expect(String(row.medicinesIssued)).toContain("120");
    expect(row.totalIssued).toBe(120);
    expect(row.statusLabel).toBe("Not Started");
  });

  it("marks communities with no Level 3 issue at all", () => {
    const [row] = buildAtRiskExportRows(build([checklist({ COMMUNITIES: "Ghost Village" })], [logisticsRaw()]));
    expect(row.medicinesIssued).toBe(NONE_RECORDED);
    expect(row.totalIssued).toBe(0);
    expect(row.cddList).toBe("—");
    expect(row.cddPhoneList).toBe(NOT_CAPTURED);
  });

  it("sums repeated issues of the same medicine into one export cell", () => {
    const [row] = buildAtRiskExportRows(
      build([checklist()], [logisticsRaw({ qty: 100 }), logisticsRaw({ qty: 40, cdd: "Sadiya Umar" })]),
    );
    expect(row.totalIssued).toBe(140);
    expect(String(row.medicinesIssued).split(";")).toHaveLength(1);
    expect(row.cddList).toBe("Hauwa Idris; Sadiya Umar");
  });
});

describe("phone harvesting resilience", () => {
  it("reports 'Not captured' when no phone field exists", () => {
    const [row] = buildAtRiskExportRows(build([checklist()], [logisticsRaw()]));
    expect(row.cddPhoneList).toBe(NOT_CAPTURED);
    expect(row.inChargePhone).toBe(NOT_CAPTURED);
  });

  it.each([
    ["empty string", ""],
    ["null", null],
    ["too short", "123"],
    ["non-numeric", "not-a-number"],
    ["object", { nested: "0803" }],
  ])("ignores a malformed CDD phone (%s) without breaking the row", (_label, value) => {
    const rows = build([checklist()], [logisticsRaw({ cddPhone: value as unknown })]);
    expect(rows).toHaveLength(1);
    const [row] = buildAtRiskExportRows(rows);
    expect(row.cddPhoneList).toBe(NOT_CAPTURED);
    expect(row.community).toBe("Yakasai");
  });

  it("normalises formatted numbers and keeps multiple distinct CDD phones", () => {
    const rows = build(
      [checklist()],
      [
        logisticsRaw({ cddPhone: "+234 (803) 123-4567" }),
        logisticsRaw({ cdd: "Sadiya Umar", cddPhone: "0805 000 1111" }),
        logisticsRaw({ cdd: "Hauwa Idris", cddPhone: "+234 (803) 123-4567" }),
      ],
    );
    const [row] = buildAtRiskExportRows(rows);
    expect(row.cddPhoneList).toBe("+2348031234567; 08050001111");
  });

  it("never throws on deeply malformed logistics submissions", () => {
    expect(() =>
      build([checklist()], [
        null,
        {},
        { group_xm3rz84: null },
        { group_xm3rz84: [{ Target_Community_Settlement: "Yakasai", group_je4ry53: [{}] }] },
      ] as any[]),
    ).not.toThrow();
  });
});
