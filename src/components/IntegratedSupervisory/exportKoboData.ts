/**
 * Styled XLSX + clean CSV export for the Kobo Data Explorer.
 * - Frozen header row (28px) in dark slate (#1E293B) with bold white text.
 * - Thin gray borders (#E2E8F0), wrapped middle-aligned cells.
 * - Auto column widths from max content length.
 * - All values are resolved to human labels via KoboLabelResolver.
 */
import ExcelJS from "exceljs";
import type { KoboLabelResolver } from "./koboLabelResolver";

export interface ExportColumn { key: string; label: string }

const resolveCell = (row: Record<string, unknown>, key: string, resolver: KoboLabelResolver | null): string => {
  const v = row[key];
  if (v == null || v === "") return "";
  if (resolver) return resolver.resolveValue(key, v);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export async function exportXlsx(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  resolver: KoboLabelResolver | null,
  filename = `Kobo_Data_Export_${new Date().toISOString().slice(0, 10)}.xlsx`,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  const ws = wb.addWorksheet("Raw Kobo Data", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = columns.map((c) => {
    const headerLen = c.label?.length ?? c.key.length;
    const maxCellLen = Math.min(
      60,
      rows.reduce((m, r) => Math.max(m, resolveCell(r, c.key, resolver).length), 0),
    );
    return { header: c.label, key: c.key, width: Math.max(headerLen + 4, maxCellLen + 4, 16) };
  });

  for (const r of rows) {
    const out: Record<string, string> = {};
    for (const c of columns) out[c.key] = resolveCell(r, c.key, resolver);
    ws.addRow(out);
  }

  const header = ws.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11, name: "Inter" };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E293B" } },
      bottom: { style: "thin", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF1E293B" } },
      right: { style: "thin", color: { argb: "FF1E293B" } },
    };
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.font = { name: "Inter", size: 10, color: { argb: "FF1F2937" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  resolver: KoboLabelResolver | null,
  filename = `Kobo_Data_Export_${new Date().toISOString().slice(0, 10)}.csv`,
) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => esc(resolveCell(r, c.key, resolver))).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
