import ExcelJS from "exceljs";
import { MILESTONES, parseMilestones } from "./milestones";

const palette = { blue: "FF0A5C8E", teal: "FF0F766E", sky: "FFE6F2FA", mint: "FFE7F6F3", gold: "FFF4B400", ink: "FF073B5C", paper: "FFFFFFFF", violet: "FF7446B8", rose: "FFBC4565" };
const fields = ["indicator", "state", "lga", "date", "value", "baseline", "baseline_date", "source"];

export function buildSurveyWorkbook(state: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.title = "WHO 2030 Roadmap · State Survey Evidence";
  const cover = wb.addWorksheet("State roadmap", { properties: { tabColor: { argb: palette.teal } }, views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: "A1:H23" } });
  for (let col = 1; col <= 8; col++) cover.getColumn(col).width = 15;
  const band = (row: number, end: number, text: string, color: string, size = 14) => {
    cover.mergeCells(row, 1, end, 8);
    const c = cover.getCell(row, 1); c.value = text;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c.font = { name: "Arial", size, bold: true, color: { argb: palette.paper } };
    c.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    for (let r = row; r <= end; r++) cover.getRow(r).height = 24;
  };
  band(1, 3, "WHO 2030 ROADMAP\nSTATE SURVEY EVIDENCE", palette.blue, 24);
  band(4, 5, `${state.toUpperCase()} · EYE HEALTH & TRACHOMA`, palette.teal, 16);
  const accents = [palette.teal, palette.violet, palette.rose, palette.blue, palette.teal];
  MILESTONES.forEach((m, i) => band(7 + i * 2, 8 + i * 2, `${m.key.toUpperCase()}  |  ${m.title}\n${m.detail}`, accents[i], 12));
  band(18, 19, "01  Read first     →     02  Complete Survey evidence     →     03  Import into the scorecard", palette.blue, 12);
  cover.mergeCells("A21:H23"); cover.getCell("A21").value = "AMEHNITIES · STATE EVIDENCE WORKBOOK\nWHO-aligned design, not an official WHO survey instrument. Blank measurement cells are intentional. Use verified representative survey evidence; never substitute routine service counts.";
  cover.getCell("A21").font = { name: "Arial", size: 11, color: { argb: palette.ink } }; cover.getCell("A21").alignment = { wrapText: true, vertical: "middle" };
  const guide = wb.addWorksheet("Read first");
  guide.getColumn(1).width = 35; guide.getColumn(2).width = 100;
  guide.mergeCells("A1:B1"); guide.getCell("A1").value = "WHO 2030 · EYE HEALTH EVIDENCE";
  guide.addRow(["Prepared for", state]);
  guide.addRow(["Purpose", "Amehnities template aligned with WHO targets; not an official WHO survey instrument or certification."]);
  guide.addRow(["Complete", "Fill the Survey evidence sheet. Leave unused rows blank. Import the completed .xlsx into the scorecard."]);
  guide.addRow(["Population & scope", "Use representative surveys with matched populations. Set lga to State only for a representative State estimate; never average LGA percentages."]);
  guide.addRow(["Dates", "Use YYYY-MM-DD text. eCSC/eREC require documented 2020 baselines. No future survey dates."]);
  guide.addRow(["Measurements", "value and baseline: percentages (0–100), or verified remaining people for backlog. Enter numeric cells, not % formatted fractions."]);
  guide.addRow(["Source", "Include report title, publisher, sample/population denominator, measurement method and source link/reference. No patient identities."]);
  guide.addRow(["Forecast", "Requires at least 3 recent, same-scope observations spanning 180 days; latest within one year. Thresholds are not elimination certification."]);
  guide.addRow(["Routine services", "Operations, glasses dispensed and TT screening visits cannot establish population coverage, TT prevalence or verified backlog clearance."]);
  for (const m of MILESTONES) guide.addRow([m.key, `${m.title}: ${m.detail}. Source: ${m.source}`]);
  const sheet = wb.addWorksheet("Survey evidence", { properties: { tabColor: { argb: palette.gold } }, views: [{ state: "frozen", ySplit: 1, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, printTitlesRow: "1:1" } });
  sheet.addRow(fields);
  [18, 24, 24, 18, 16, 16, 18, 80].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.autoFilter = "A1:H101";
  for (let i = 0; i < 100; i++) {
    sheet.addRow(i < 5 ? [MILESTONES[i].key, state, "State"] : []);
    const r = i + 2;
    sheet.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, formulae: ['"ecsc,erec,tt,tf,backlog"'], showErrorMessage: true, error: "Choose a listed indicator." };
    for (const c of [4, 7]) sheet.getCell(r, c).numFmt = "@";
    for (const c of [5, 6]) sheet.getCell(r, c).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true, showErrorMessage: true, error: "Enter a non-negative number." };
    for (let c = 1; c <= 8; c++) sheet.getCell(r, c).value ??= null;
  }
  for (const ws of [guide, sheet]) {
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      row.height = ws === guide ? (n === 1 ? 34 : 56) : 30;
      for (let col = 1; col <= (ws === guide ? 2 : 8); col++) {
        const cell = row.getCell(col);
        const header = n === 1;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: header ? palette.blue : n % 2 ? palette.sky : palette.mint } };
        cell.font = { name: "Arial", size: header ? 13 : 11, bold: header || (ws === guide && col === 1), color: { argb: header ? palette.paper : palette.ink } };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: palette.paper } } };
      }
    });
  }
  for (let r = 2; r <= 101; r++) for (const col of [5, 6]) {
    const c = sheet.getCell(r, col); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r % 2 ? "FFFFE9A3" : "FFFFF3CD" } };
    c.numFmt = "0.0";
  }
  fields.forEach((field, i) => { sheet.getCell(1, i + 1).note = `${field}: keep this heading unchanged for import. See Read first for measurement definitions.`; });
  return wb;
}

export async function prepareSurveyWorkbook(state: string) {
  const bytes = await buildSurveyWorkbook(state).xlsx.writeBuffer();
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadSurveyWorkbook(blob: Blob, state: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `who-2030-survey-evidence-${state}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function readSurveyWorkbook(bytes: ArrayBuffer) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet("Survey evidence");
  if (!ws) throw new Error("Use the Survey evidence sheet in the downloaded template.");
  const rows: Record<string, unknown>[] = [];
  const value = (cell: ExcelJS.Cell) => {
    if (cell.type === ExcelJS.ValueType.Formula) throw new Error("Use measured numeric values, not formulas.");
    return cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.value;
  };
  if (fields.some((f, i) => ws.getCell(1, i + 1).value !== f)) throw new Error("Do not change the template's column headings.");
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r = Object.fromEntries(fields.map((f, i) => [f, value(row.getCell(i + 1))]));
    // Pre-labelled blank entries are not evidence.
    if ([r.date, r.value, r.baseline, r.baseline_date, r.source].every(v => v === null || v === undefined || v === "")) return;
    rows.push(r);
  });
  return parseMilestones(rows);
}