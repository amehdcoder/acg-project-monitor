import { describe, expect, it } from "vitest";
import { buildLogframeWorkbook, parseLogframeWorkbook } from "./logframeExcel";
import { defaultLogframe, flatIndicators } from "./logframe";

describe("Programme Report Excel template", () => {
  it("round-trips the full framework and period values", async () => {
    const lf = defaultLogframe();
    lf.objectives[0].statement = "Edited narrative";
    const code = lf.objectives[0].results[0].indicators[0].code;
    const wb = await buildLogframeWorkbook(lf, { period: "Oct 2026", reportYear: "2", notes: "n", drafts: { [code]: { value: "5", disaggregation: { Sex: JSON.stringify({ Male: 3, Female: 2 }) }, risk: "r", overTargetComment: "" } } });
    const buf = await wb.xlsx.writeBuffer();
    const out = await parseLogframeWorkbook(buf as ArrayBuffer);
    expect(out.logframe.objectives[0].statement).toBe("Edited narrative");
    expect(flatIndicators(out.logframe.objectives).length).toBe(flatIndicators(lf.objectives).length);
    expect(out.state.reportYear).toBe("2");
    expect(out.state.drafts[code].value).toBe("5");
    expect(JSON.parse(out.state.drafts[code].disaggregation.Sex)).toEqual({ Male: 3, Female: 2 });
  });

  it("applies Specific Objective titles and narratives edited on the Cover sheet", async () => {
    const lf = defaultLogframe();
    const wb = await buildLogframeWorkbook(lf, { period: "Oct 2026", reportYear: "1", notes: "", drafts: {} });
    const cover = wb.getWorksheet("Cover")!;
    // Legend block starts after the 7 meta rows + "Objectives" heading.
    const firstObjRow = 5 + 7 + 2 + 1;
    cover.getCell(firstObjRow, 2).value = "Edited Objective One";
    cover.getCell(firstObjRow, 3).value = "Edited objective narrative";
    const buf = await wb.xlsx.writeBuffer();
    const out = await parseLogframeWorkbook(buf as ArrayBuffer);
    expect(out.logframe.objectives[0].title).toBe("Edited Objective One");
    expect(out.logframe.objectives[0].statement).toBe("Edited objective narrative");
    // Untouched objectives keep their original text.
    expect(out.logframe.objectives[1].title).toBe(lf.objectives[1].title);
  });
});
