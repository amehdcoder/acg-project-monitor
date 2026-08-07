/**
 * MDA Lens export — a professional, colour-coded XLSX of the data a user is
 * scoped to (questions as columns, responses as rows).
 *
 * Layout
 *  • Title band with the report name + the exact State / LGA scope applied.
 *  • Frozen, dark-slate header row with bold white question labels.
 *  • Zebra rows, thin borders, wrapped text, auto column widths, autofilter.
 *  • Geography columns tinted so scope is instantly readable.
 */
import ExcelJS from "exceljs";

export interface LensColumn { key: string; label: string; geo?: boolean }

export interface LensSheet {
  name: string;
  columns: LensColumn[];
  rows: Record<string, unknown>[];
}

const cellText = (v: unknown): string => {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
};

const BRAND = "FF0F2A44";
const HEADER = "FF1E293B";
const GEO_HEADER = "FF0B5A6E";

export async function exportLensWorkbook(opts: {
  title: string;
  scopeLabel: string;
  sheets: LensSheet[];
  filename?: string;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities · MDA Lens";
  wb.created = new Date();

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 30) || "Data", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const colCount = Math.max(1, sheet.columns.length);

    // Title band
    ws.mergeCells(1, 1, 1, colCount);
    const t = ws.getCell(1, 1);
    t.value = opts.title;
    t.font = { name: "Inter", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 30;

    ws.mergeCells(2, 1, 2, colCount);
    const s = ws.getCell(2, 1);
    s.value = `${opts.scopeLabel}  ·  ${sheet.rows.length.toLocaleString()} records  ·  Generated ${new Date().toLocaleString()}`;
    s.font = { name: "Inter", size: 10, italic: true, color: { argb: "FF334155" } };
    s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 6;

    // Header row (row 4)
    const header = ws.getRow(4);
    sheet.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.geo ? GEO_HEADER : HEADER } };
      cell.font = { name: "Inter", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: HEADER } },
        bottom: { style: "thin", color: { argb: HEADER } },
        left: { style: "thin", color: { argb: HEADER } },
        right: { style: "thin", color: { argb: HEADER } },
      };
    });
    header.height = 32;

    // Data rows
    sheet.rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      sheet.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = cellText(r[c.key]);
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.font = { name: "Inter", size: 10, color: { argb: "FF1F2937" } };
        const zebra = ri % 2 === 1;
        const fill = c.geo ? (zebra ? "FFE0F2F7" : "FFF0FAFC") : zebra ? "FFF8FAFC" : "FFFFFFFF";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
      row.height = 20;
    });

    // Widths
    sheet.columns.forEach((c, i) => {
      const maxLen = sheet.rows.reduce((m, r) => Math.max(m, cellText(r[c.key]).length), 0);
      ws.getColumn(i + 1).width = Math.min(52, Math.max(16, c.label.length + 4, Math.min(48, maxLen + 4)));
    });

    if (sheet.rows.length) {
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colCount } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    opts.filename ||
    `${opts.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
