// NTD Treatment Data Cleaner — Excel import & export (per MDA type).
import * as XLSX from "xlsx";
import { MdaConfig, SYSTEM_COLUMNS } from "./schemas";
import { RowResult } from "./engine";

export interface ImportResult {
  rows: Record<string, any>[];
  matchedSheet: string | null;
  detectedColumns: string[];
  missingColumns: string[];
  extraColumns: string[];
  batchId: string;
  fileName: string;
}

export function newBatchId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
  return `Batch_${stamp}_${Math.floor(Math.random() * 900 + 100)}`;
}

// Parse an uploaded workbook for the selected MDA config.
export async function importWorkbook(file: File, config: MdaConfig): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  // Prefer the sheet matching the MDA type; else first sheet
  const matched =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === config.sheet.toLowerCase()) ||
    wb.SheetNames.find((n) => n.trim().toLowerCase().includes(config.id.toLowerCase())) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[matched];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: true });
  // Drop fully-empty rows
  const rows = json.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  const detected = rows.length ? Object.keys(rows[0]) : XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as any || [];
  const expected = config.columns.map((c) => c.key);
  const missing = expected.filter((e) => !detected.includes(e));
  const extra = (detected as string[]).filter((d) => !expected.includes(d) && !SYSTEM_COLUMNS.includes(d));
  return {
    rows,
    matchedSheet: matched,
    detectedColumns: detected as string[],
    missingColumns: missing,
    extraColumns: extra,
    batchId: newBatchId(),
    fileName: file.name,
  };
}

function autoWidths(headers: string[]): { wch: number }[] {
  return headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));
}

// Export a blank template for the selected MDA type.
export function exportTemplate(config: MdaConfig) {
  const headers = config.columns.map((c) => c.key);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = autoWidths(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheet.slice(0, 31));
  XLSX.writeFile(wb, `${config.id}_TEMPLATE.xlsx`);
}

// Export the cleaned dataset with system/audit columns appended.
export function exportCleaned(config: MdaConfig, rows: RowResult[], batchId: string, reviewer: string) {
  const dataHeaders = config.columns.map((c) => c.key);
  const headers = [...dataHeaders, ...SYSTEM_COLUMNS];
  const aoa: any[][] = [headers];
  rows.forEach((r, i) => {
    const log = r.issues
      .map((iss) => `${iss.col}: "${iss.original}"→"${r.values[iss.col]}" [${iss.category}]`)
      .join(" | ");
    const sys: Record<string, any> = {
      Row_ID: `${batchId}-R${i + 1}`,
      Import_Batch_ID: batchId,
      Validation_Status: r.status,
      Error_Count: r.issues.filter((x) => x.severity === "critical" || x.severity === "high").length,
      Warning_Count: r.issues.filter((x) => x.severity === "warning").length,
      Cleaning_Log: log,
      Original_Row_Hash: simpleHash(JSON.stringify(r.original)),
      Cleaned_Row_Hash: simpleHash(JSON.stringify(r.values)),
      Reviewer_Name: reviewer || "",
      Reviewer_Comment: "",
    };
    aoa.push([...dataHeaders.map((h) => r.values[h] ?? ""), ...SYSTEM_COLUMNS.map((h) => sys[h] ?? "")]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = autoWidths(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheet.slice(0, 31));
  XLSX.writeFile(wb, `${config.id}_CLEANED_${batchId}.xlsx`);
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
