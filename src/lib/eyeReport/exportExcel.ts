// WHO-style Excel exports for Eye Health facility reporting. Layouts follow the
// supplied "Summary of Eye Health Screening" annual template (43 columns) and
// the "Cataract Surgery Outcome Monitoring" (CSOM) sheet.
import ExcelJS from "exceljs";
import {
  AGE_BANDS, LENS_TYPES, MONTHS, SURGERY_ITEMS, aggregate, byMonth, normCsom, normSummary, pct, t, totals, vaTotal,
  type EyeCsom, type EyeReportRow, type EyeSummary, type MF,
} from "./definition";

const WHO_BLUE = "FF0A5C8E", WHO_DEEP = "FF073B5C", SKY = "FFE6F2FA", TEAL = "FF0F766E", MINT = "FFE7F6F3", GOLD = "FFF4B400", ROSE = "FFB91C1C";
const thin = { style: "thin" as const, color: { argb: "FFB8CCDB" } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

export interface ExportMeta { projectName?: string; facilityLabel: string; periodLabel: string; preparedBy?: string; confirmedBy?: string; filters?: string }

function fill(c: ExcelJS.Cell, argb: string, font = "FFFFFFFF", bold = true, size = 9) {
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  c.font = { bold, size, color: { argb: font }, name: "Arial" };
  c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  c.border = box;
}
function banner(ws: ExcelJS.Worksheet, row: number, cols: number, text: string, argb: string, size = 13, font = "FFFFFFFF") {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1); c.value = text;
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  c.font = { bold: true, size, color: { argb: font }, name: "Arial" };
  c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(row).height = size > 11 ? 26 : 18;
}
function merge(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, text: string, argb: string, font?: string) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  const c = ws.getCell(r1, c1); c.value = text; fill(c, argb, font);
}

/** 42 numeric cells for one month row, in template column order. */
function summaryCells(s: EyeSummary): number[] {
  const T = totals(s);
  const mft = (x: MF) => [x.m, x.f, t(x)];
  return [
    ...AGE_BANDS.flatMap((b) => mft(s.consult[b.key])), ...mft(T.consulted), ...mft(s.pwd),
    ...SURGERY_ITEMS.flatMap((i) => mft(s.surgery[i.key])),
    ...LENS_TYPES.flatMap((l) => [s.lenses[l.key].m, s.lenses[l.key].f]), ...mft(T.lenses),
    ...LENS_TYPES.flatMap((l) => [s.glasses[l.key].m, s.glasses[l.key].f]), ...mft(T.glasses),
  ];
}

function buildSummarySheet(wb: ExcelJS.Workbook, rows: { label: string; s: EyeSummary }[], meta: ExportMeta, total: EyeSummary) {
  const ws = wb.addWorksheet("Annual Summary", { views: [{ state: "frozen", xSplit: 1, ySplit: 9 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 } });
  const C = 43;
  banner(ws, 1, C, "STATE MINISTRY OF HEALTH · PRIMARY EYE CARE · DEPARTMENT OF PUBLIC HEALTH", WHO_DEEP, 13);
  banner(ws, 2, C, "SUMMARY OF EYE HEALTH SCREENING AND OTHER MEDICATIONS CONDUCTED BY THE CLINICS", WHO_BLUE, 12);
  ws.mergeCells(3, 1, 3, C);
  const m = ws.getCell(3, 1);
  m.value = `FACILITY: ${meta.facilityLabel}     ·     PERIOD: ${meta.periodLabel}     ·     ${meta.projectName ?? ""}${meta.filters ? `     ·     ${meta.filters}` : ""}`;
  m.font = { size: 9, bold: true, color: { argb: WHO_DEEP }, name: "Arial" }; m.alignment = { horizontal: "center" };
  m.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SKY } };
  ws.getRow(4).height = 6;

  const r = 5; // header rows 5..9
  merge(ws, r, 1, r + 4, 1, "MONTHS", WHO_DEEP);
  merge(ws, r, 2, r, 16, "CONSULTATIONS", WHO_BLUE);
  merge(ws, r, 17, r, 25, "SURGERIES", TEAL);
  merge(ws, r, 26, r, 34, "REFRACTION", "FF7C3AED");
  merge(ws, r, 35, r, 43, "GLASSES", "FFC2410C");
  const groups = [
    [2, "0–4 YRS"], [5, "5–14 YRS"], [8, "15+ YRS"], [11, "Total No. of Persons Consulted"], [14, "Total No. of Persons with Disability"],
    [17, "Cataract Operated"], [20, "Glaucoma Operated"], [23, "Patients Need Minor Surgery"],
  ] as const;
  for (const [c, label] of groups) merge(ws, r + 1, c, r + 3, c + 2, label, c < 17 ? "FF1D7FB8" : "FF14A098");
  merge(ws, r + 1, 26, r + 1, 34, "Lenses", "FF8B5CF6");
  merge(ws, r + 1, 35, r + 1, 43, "Near, Distance and Bifocal Glasses Dispensed", "FFEA580C");
  for (const [start, col] of [[26, "FFA78BFA"], [35, "FFFB923C"]] as const) {
    ["DV", "NV", "BF"].forEach((k, i) => merge(ws, r + 2, start + i * 2, r + 3, start + i * 2 + 1, k, col));
    merge(ws, r + 2, start + 6, r + 3, start + 8, "TOTAL", col);
  }
  const sexRow: string[] = [];
  for (let i = 0; i < 8; i++) sexRow.push("M", "F", "T");
  for (let k = 0; k < 2; k++) sexRow.push("M", "F", "M", "F", "M", "F", "M", "F", "T");
  sexRow.forEach((v, i) => { const c = ws.getCell(r + 4, i + 2); c.value = v; fill(c, v === "T" ? GOLD : "FF334155", v === "T" ? "FF1F2937" : "FFFFFFFF"); });

  let row = r + 5;
  for (const [i, x] of rows.entries()) {
    const cells = [x.label.toUpperCase(), ...summaryCells(x.s)];
    cells.forEach((v, ci) => {
      const c = ws.getCell(row, ci + 1); c.value = v as any; c.border = box;
      c.font = { size: 9, name: "Arial", bold: ci === 0 || sexRow[ci - 1] === "T", color: { argb: ci === 0 ? WHO_DEEP : "FF1E293B" } };
      c.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle", indent: ci === 0 ? 1 : 0 };
      const isT = ci > 0 && sexRow[ci - 1] === "T";
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isT ? "FFFFF8E1" : i % 2 ? "FFF6FAFD" : "FFFFFFFF" } };
    });
    row++;
  }
  ["TOTAL", ...summaryCells(total)].forEach((v, ci) => { const c = ws.getCell(row, ci + 1); c.value = v as any; fill(c, WHO_DEEP, "FFFFFFFF", true, 10); });
  ws.getRow(row).height = 22;
  row += 2;
  ws.getCell(row, 1).value = `PREPARED BY: ${meta.preparedBy ?? "______________________________"}`;
  ws.getCell(row, 20).value = `CONFIRMED BY: ${meta.confirmedBy ?? "______________________________"}`;
  ws.getCell(row + 1, 1).value = `Generated ${new Date().toLocaleString("en-GB")} · Amehnities`;
  [ws.getCell(row, 1), ws.getCell(row, 20)].forEach((c) => (c.font = { bold: true, size: 10, name: "Arial", color: { argb: WHO_DEEP } }));
  ws.getCell(row + 1, 1).font = { italic: true, size: 8, color: { argb: "FF64748B" } };
  ws.getColumn(1).width = 16;
  for (let c = 2; c <= C; c++) ws.getColumn(c).width = 6.2;
  [5, 6, 7, 8].forEach((rr) => (ws.getRow(rr).height = 22));
}

function buildCsomSheet(wb: ExcelJS.Workbook, c: EyeCsom, s: EyeSummary, meta: ExportMeta) {
  const ws = wb.addWorksheet("CSOM", { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, paperSize: 9 } });
  [30, 13, 11, 13, 11].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  banner(ws, 1, 5, "CATARACT SURGERY OUTCOME MONITORING", TEAL, 14);
  ws.mergeCells(2, 1, 2, 5);
  ws.getCell(2, 1).value = `${meta.facilityLabel} · ${meta.periodLabel}`;
  ws.getCell(2, 1).font = { bold: true, size: 9, color: { argb: TEAL } }; ws.getCell(2, 1).alignment = { horizontal: "center" };
  banner(ws, 4, 5, "SECTION 1", "FF115E59", 10);
  const kv = (r: number, k: string, v: string, accent: string) => {
    ws.mergeCells(r, 1, r, 3); ws.mergeCells(r, 4, r, 5);
    const a = ws.getCell(r, 1); a.value = k; a.font = { bold: true, size: 10 }; a.border = box; a.alignment = { indent: 1, vertical: "middle" };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MINT } };
    const b = ws.getCell(r, 4); b.value = v; b.font = { bold: true, size: 12, color: { argb: accent } }; b.alignment = { horizontal: "center", vertical: "middle" }; b.border = box;
    ws.getRow(r).height = 20;
  };
  kv(5, "Total cataract surgeries", String(c.surgeries), WHO_DEEP);
  kv(6, "% of surgeries done after Biometry:", `${pct(c.biometry, c.surgeries)}%  (${c.biometry})`, TEAL);
  kv(7, "% of Surgeries with IOL:", `${pct(c.iol, c.surgeries)}%  (${c.iol})`, TEAL);

  const vaTable = (start: number, section: string, title: string, colB: string, a: EyeCsom["discharge"]["presenting"], b: EyeCsom["discharge"]["presenting"]) => {
    banner(ws, start, 5, `${section}: ${title}`, "FF115E59", 10);
    merge(ws, start + 1, 1, start + 2, 1, "Outcome", WHO_DEEP);
    merge(ws, start + 1, 2, start + 1, 5, "Visual Acuity", WHO_BLUE);
    merge(ws, start + 2, 2, start + 2, 3, "Presenting", "FF1D7FB8");
    merge(ws, start + 2, 4, start + 2, 5, colB, "FF14A098");
    ["", "No.", "%", "No.", "%"].forEach((v, i) => { if (i) { const cell = ws.getCell(start + 3, i + 1); cell.value = v; fill(cell, "FF334155"); } });
    fill(ws.getCell(start + 3, 1), "FF334155");
    const ta = vaTotal(a), tb = vaTotal(b);
    const rows: [string, number, number, string][] = [
      ["Good (6/6 – 6/12)", a.good, b.good, "FFDCFCE7"], ["Borderline (6/18 – 6/60)", a.borderline, b.borderline, "FFFEF3C7"], ["Poor (< 6/60)", a.poor, b.poor, "FFFEE2E2"],
    ];
    rows.forEach(([lab, x, y, bg], i) => {
      const rr = start + 4 + i;
      [lab, x, `${pct(x, ta)}%`, y, `${pct(y, tb)}%`].forEach((v, ci) => {
        const cell = ws.getCell(rr, ci + 1); cell.value = v; cell.border = box;
        cell.font = { size: 10, bold: ci === 0, color: { argb: i === 2 && ci > 0 ? ROSE : "FF1E293B" } };
        cell.alignment = { horizontal: ci ? "center" : "left", indent: ci ? 0 : 1 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      });
    });
    ["Total", ta, ta ? "100%" : "0%", tb, tb ? "100%" : "0%"].forEach((v, ci) => { const cell = ws.getCell(start + 7, ci + 1); cell.value = v; fill(cell, WHO_DEEP, "FFFFFFFF", true, 10); });
  };
  vaTable(9, "SECTION 2", "At discharge", "With Pinhole", c.discharge.presenting, c.discharge.pinhole);
  vaTable(18, "SECTION 3", "Follow up (≥ 4 weeks)", "With Pinhole or *BCVA", c.followup.presenting, c.followup.bcva);
  banner(ws, 27, 5, "REFRACTION", "FF7C3AED", 10);
  const L = totals(s).lenses;
  kv(28, "Lenses Male:", String(L.m), "FF7C3AED");
  kv(29, "Lenses Female:", String(L.f), "FF7C3AED");
  ws.getCell(31, 1).value = "*BCVA = Best Corrected Visual Acuity. WHO recommends ≥ 80% good outcome at follow-up and < 5% poor.";
  ws.getCell(31, 1).font = { italic: true, size: 8, color: { argb: "FF64748B" } };
}

function dailySheet(wb: ExcelJS.Workbook, rows: EyeReportRow[]) {
  const ws = wb.addWorksheet("Daily Reports", { views: [{ state: "frozen", ySplit: 2, xSplit: 3 }] });
  const head = ["Date", "Facility", "LGA", "Consulted M", "Consulted F", "Consulted T", "0–4", "5–14", "15+", "PWD", "Cataract", "Glaucoma", "Minor surg.", "Lenses", "Glasses", "CSOM surg.", "% Biometry", "% IOL", "Discharge good %", "Follow-up good %", "Prepared by", "Confirmed by", "Notes"];
  banner(ws, 1, head.length, "INDIVIDUAL DAILY FACILITY REPORTS", WHO_BLUE, 12);
  head.forEach((h, i) => { const c = ws.getCell(2, i + 1); c.value = h; fill(c, WHO_DEEP); });
  ws.getRow(2).height = 30;
  [...rows].sort((a, b) => b.report_date.localeCompare(a.report_date)).forEach((r, i) => {
    const s = normSummary(r.summary), c = normCsom(r.csom), T = totals(s);
    const vals = [r.report_date, r.facility_name, r.lga ?? "", T.consulted.m, T.consulted.f, t(T.consulted), t(s.consult.a0_4), t(s.consult.a5_14), t(s.consult.a15), t(s.pwd),
      t(s.surgery.cataract), t(s.surgery.glaucoma), t(s.surgery.minor), t(T.lenses), t(T.glasses),
      c?.surgeries ?? "", c ? `${pct(c.biometry, c.surgeries)}%` : "", c ? `${pct(c.iol, c.surgeries)}%` : "",
      c ? `${pct(c.discharge.presenting.good, vaTotal(c.discharge.presenting))}%` : "", c ? `${pct(c.followup.presenting.good, vaTotal(c.followup.presenting))}%` : "",
      r.prepared_by ?? r.collector_label ?? "", r.confirmed_by ?? "", r.notes ?? ""];
    vals.forEach((v, ci) => {
      const cell = ws.getCell(i + 3, ci + 1); cell.value = v as any; cell.border = box;
      cell.font = { size: 9, bold: ci === 5 };
      cell.alignment = { horizontal: ci < 3 || ci > 19 ? "left" : "center", wrapText: ci === 22 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ci === 5 ? "FFFFF8E1" : i % 2 ? "FFF6FAFD" : "FFFFFFFF" } };
    });
  });
  head.forEach((h, i) => (ws.getColumn(i + 1).width = i === 1 ? 26 : i === 22 ? 36 : Math.max(10, h.length + 2)));
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: head.length } };
}

async function save(wb: ExcelJS.Workbook, name: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Aggregated monthly/annual workbook in the supplied template layouts, plus the daily list. */
export async function exportAggregated(rows: EyeReportRow[], meta: ExportMeta) {
  const wb = new ExcelJS.Workbook(); wb.creator = "Amehnities"; wb.created = new Date();
  const months = byMonth(rows);
  const all = aggregate(rows);
  buildSummarySheet(wb, MONTHS.map((m, i) => ({ label: m, s: months[i].summary })), meta, all.summary);
  buildCsomSheet(wb, all.csom, all.summary, meta);
  dailySheet(wb, rows);
  await save(wb, `eye-health-summary-csom-${slug(meta.periodLabel)}.xlsx`);
}

/** One daily report formatted as a WHO-style report card (summary + CSOM). */
export async function exportDailyReport(r: EyeReportRow, projectName?: string) {
  const wb = new ExcelJS.Workbook(); wb.creator = "Amehnities";
  const s = normSummary(r.summary);
  const meta: ExportMeta = { projectName, facilityLabel: r.facility_name, periodLabel: new Date(`${r.report_date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), preparedBy: r.prepared_by ?? r.collector_label ?? undefined, confirmedBy: r.confirmed_by ?? undefined };
  buildSummarySheet(wb, [{ label: r.report_date, s }], meta, s);
  const c = normCsom(r.csom);
  if (c) buildCsomSheet(wb, c, s, meta);
  if (r.notes) { const ws = wb.addWorksheet("Notes"); banner(ws, 1, 6, "NOTES & OBSERVATIONS", WHO_BLUE, 12); ws.mergeCells(2, 1, 8, 6); ws.getCell(2, 1).value = r.notes; ws.getCell(2, 1).alignment = { wrapText: true, vertical: "top" }; ws.getColumn(1).width = 20; }
  await save(wb, `eye-daily-report-${slug(r.facility_name)}-${r.report_date}.xlsx`);
}
