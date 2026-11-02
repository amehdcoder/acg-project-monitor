import { describe, expect, it } from "vitest";
import { buildSurveyWorkbook, readSurveyWorkbook, surveyGeography } from "../milestoneWorkbook";
import { routineMilestones } from "../routineMilestones";
import { emptyCsom, type EyeReportRow } from "../definition";

describe("WHO evidence workbook", () => {
  const geography = [{ state: "Jigawa", lga: "Dutse" }, { state: "Jigawa", lga: "Hadejia" }, { state: "Kano", lga: "Dala" }, { state: "Jigawa", lga: "Dutse" }];
  it("lists only received submission locations and cascades LGAs by State", async () => {
    expect(surveyGeography(geography)).toEqual([{ state: "Jigawa", lgas: ["Dutse", "Hadejia"] }, { state: "Kano", lgas: ["Dala"] }]);
    const wb = buildSurveyWorkbook("Jigawa", geography);
    const ws = wb.getWorksheet("Survey evidence"), lists = wb.getWorksheet("Geography lists");
    if (!ws || !lists) throw new Error("Missing sheets");
    expect(ws.getCell("B2").dataValidation.formulae).toEqual(["SurveyStates"]);
    expect(ws.getCell("C3").dataValidation.formulae?.[0]).toContain("MATCH(B3,SurveyStates,0)");
    expect(lists.getCell("C3").value).toBe("Dutse");
    expect(lists.getCell("D3").value).toBe("Dala");
    const bytes = await wb.xlsx.writeBuffer();
    const ExcelJS = (await import("exceljs")).default;
    const restored = new ExcelJS.Workbook(); await restored.xlsx.load(bytes);
    expect(restored.definedNames.getRanges("SurveyStates").ranges).toEqual(["'Geography lists'!$A$2:$A$3"]);
    expect(restored.getWorksheet("Survey evidence")?.getCell("C2").dataValidation.formulae?.[0]).toContain("MATCH(B2,SurveyStates,0)");
  });
  it("does not offer invented States when there are no submissions", () => {
    const wb = buildSurveyWorkbook("Jigawa");
    expect(wb.getWorksheet("Survey evidence")?.getCell("B2").value).toBe("");
    expect(wb.getWorksheet("Survey evidence")?.getCell("B2").dataValidation.formulae).toEqual(["SurveyEmpty"]);
  });
  it("imports Excel dates and legacy headings alongside new readable headings", async () => {
    for (const legacy of [false, true]) {
      const wb = buildSurveyWorkbook("Jigawa", geography);
      const ws = wb.getWorksheet("Survey evidence"); if (!ws) throw new Error("Missing sheet");
      if (legacy) ws.getRow(1).values = ["indicator", "state", "lga", "date", "value", "baseline", "baseline_date", "source"];
      ws.getRow(2).values = ["ecsc", "Jigawa", "State", new Date("2026-10-01T00:00:00Z"), 45, 20, new Date("2020-01-01T00:00:00Z"), "Representative State survey"];
      const result = await readSurveyWorkbook(await wb.xlsx.writeBuffer() as ArrayBuffer);
      expect(result[0].date).toBe("2026-10-01"); expect(result[0].baseline_date).toBe("2020-01-01");
    }
  });
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