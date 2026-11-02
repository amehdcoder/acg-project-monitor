import { describe, expect, it } from "vitest";
import { buildSurveyWorkbook, readSurveyWorkbook } from "../milestoneWorkbook";
import { routineMilestones } from "../routineMilestones";
import { emptyCsom, type EyeReportRow } from "../definition";

describe("WHO evidence workbook", () => {
  it("round-trips measured State evidence without inventing values in the template", async () => {
    const wb = buildSurveyWorkbook("Jigawa");
    const ws = wb.getWorksheet("Survey evidence");
    if (!ws) throw new Error("Missing evidence sheet");
    expect(ws.getCell("E2").value).toBeNull();
    ws.getRow(2).values = ["ecsc", "Jigawa", "State", "2026-10-01", 45, 20, "2020-01-01", "Representative State survey, denominator 1000"];
    const result = await readSurveyWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer);
    expect(result).toHaveLength(1); expect(result[0].value).toBe(45); expect(result[0].lga).toBe("State");
  });
  it("rejects missing evidence and invalid coverage on spreadsheet import", async () => {
    const wb = buildSurveyWorkbook("Jigawa");
    await expect(readSurveyWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer)).rejects.toThrow();
    const ws = wb.getWorksheet("Survey evidence"); if (!ws) throw new Error("Missing sheet");
    ws.getRow(2).values = ["ecsc", "Jigawa", "State", "2026-10-01", 101, 20, "2020-01-01", "Survey"];
    await expect(readSurveyWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer)).rejects.toThrow("0–100");
  });
});

describe("routine report scorecard evidence", () => {
  it("sums real service counts and weights outcomes by measured eyes, not facility percentages", () => {
    const a = emptyCsom(), b = emptyCsom();
    a.followup.presenting = { good: 1, borderline: 0, poor: 0 };
    b.followup.presenting = { good: 1, borderline: 3, poor: 5 };
    const rows = [{ id: "a", facility_name: "A", report_date: "2026-10-01", summary: { surgery: { cataract: { m: 3, f: 2 } }, screen: { tt: { m: 2, f: 1 } } }, csom: a }, { id: "b", facility_name: "B", report_date: "2026-10-02", summary: { surgery: { cataract: { m: 4, f: 1 } } }, csom: b }] as EyeReportRow[];
    const r = routineMilestones(rows);
    expect(r.cataract).toBe(10); expect(r.tt).toBe(3); expect(r.goodFollowup).toBe(20); expect(r.poorFollowup).toBe(50); expect(r.measuredFollowup).toBe(10);
  });
  it("does not claim an outcome percentage without measured outcomes", () => {
    expect(routineMilestones([]).goodFollowup).toBeNull();
  });
});