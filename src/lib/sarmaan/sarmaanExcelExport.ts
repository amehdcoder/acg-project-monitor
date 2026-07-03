import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export interface SarmaanExportColumn {
  key: string;
  label: string;
  /** number columns get numeric formatting + totals */
  numeric?: boolean;
}

export interface SarmaanExportParams {
  formName: string;
  columns: SarmaanExportColumn[];
  rows: Record<string, any>[];
  /** Optional per-chapter counts for a summary sheet. */
  chapterCounts?: { chapter: string; count: number }[];
}

const NAVY = "FF0C2340";
const TEAL = "FF0891B2";
const HEADER_TEXT = "FFFFFFFF";
const STRIPE = "FFEEF5FB";
const BORDER = "FFCBD8E6";

const border = {
  top: { style: "thin" as const, color: { argb: BORDER } },
  bottom: { style: "thin" as const, color: { argb: BORDER } },
  left: { style: "thin" as const, color: { argb: BORDER } },
  right: { style: "thin" as const, color: { argb: BORDER } },
};

/**
 * Produce a beautifully formatted, colourful workbook of every SARMAAN
 * supervisory checklist submission (merged across all chapters).
 */
export async function exportSarmaanSubmissions({
  formName,
  columns,
  rows,
  chapterCounts,
}: SarmaanExportParams): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities · SARMAAN";
  wb.created = new Date();

  // ---------- Submissions sheet ----------
  const ws = wb.addWorksheet("Submissions", {
    views: [{ state: "frozen", ySplit: 3, xSplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  const colCount = columns.length;

  // Title band
  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell(1, 1);
  title.value = `${formName} — All Submissions`;
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: HEADER_TEXT } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 30;

  // Subtitle band
  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getCell(2, 1);
  sub.value = `${rows.length} submission(s) · exported ${new Date().toLocaleString()}`;
  sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: HEADER_TEXT } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  ws.getRow(2).height = 18;

  // Header row
  const headerRow = ws.getRow(3);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  headerRow.height = 34;

  // Data rows
  rows.forEach((r, ri) => {
    const row = ws.getRow(ri + 4);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const raw = r[c.key];
      if (c.numeric) {
        const n = Number(raw);
        cell.value = Number.isFinite(n) ? n : null;
        cell.numFmt = "#,##0";
        cell.alignment = { vertical: "top", horizontal: "right" };
      } else {
        cell.value = raw == null || raw === "" ? "" : String(raw);
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      }
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1A2733" } };
      cell.border = border;
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      }
    });
  });

  // Totals row for numeric columns
  if (rows.length) {
    const totalRow = ws.getRow(rows.length + 4);
    columns.forEach((c, ci) => {
      const cell = totalRow.getCell(ci + 1);
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14496E" } };
      cell.border = border;
      if (ci === 0) {
        cell.value = "TOTAL";
        cell.alignment = { horizontal: "left", indent: 1 };
      } else if (c.numeric) {
        const colLetter = ws.getColumn(ci + 1).letter;
        cell.value = { formula: `SUM(${colLetter}4:${colLetter}${rows.length + 3})` };
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      }
    });
  }

  // Column widths
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const headerLen = c.label.length;
    const sample = rows.slice(0, 60).reduce((m, r) => {
      const v = r[c.key] == null ? "" : String(r[c.key]);
      return Math.max(m, v.length);
    }, 0);
    col.width = Math.min(46, Math.max(12, Math.max(headerLen, sample) + 2));
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };

  // ---------- Chapter summary sheet ----------
  if (chapterCounts && chapterCounts.length) {
    const cs = wb.addWorksheet("Chapter Summary");
    cs.mergeCells(1, 1, 1, 2);
    const ct = cs.getCell(1, 1);
    ct.value = "Submissions by Chapter";
    ct.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
    ct.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ct.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cs.getRow(1).height = 26;

    ["Chapter", "Submissions"].forEach((h, i) => {
      const cell = cs.getCell(2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.border = border;
      cell.alignment = { horizontal: i === 0 ? "left" : "center" };
    });

    chapterCounts.forEach((cc, i) => {
      const row = cs.getRow(i + 3);
      const a = row.getCell(1);
      a.value = cc.chapter;
      a.border = border;
      if (i % 2 === 1) a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      const b = row.getCell(2);
      b.value = cc.count;
      b.numFmt = "#,##0";
      b.alignment = { horizontal: "center" };
      b.border = border;
      if (i % 2 === 1) b.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
    });
    cs.getColumn(1).width = 40;
    cs.getColumn(2).width = 16;
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `SARMAAN_Submissions_${stamp}.xlsx`,
  );
}
