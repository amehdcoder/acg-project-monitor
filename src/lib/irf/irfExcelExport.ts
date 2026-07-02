// Beautiful, colourful Excel export for the SARMAAN ACSM Indicator Tracking
// dashboard. Mirrors the visual language of the Bloomberg Validation workbook:
//   • Navy title banner per sheet
//   • Coloured section (group) band above the question headers
//   • Frozen headers, zebra striping, auto-filter
//   • Questions as columns, submissions as rows, grouped under sections
//   • Auto-sized ROW HEIGHT so long narrative answers show fully
//   • One worksheet per activity form (with the submitter's name captured)
//   • A final "All Submissions by Date" sheet merging every form chronologically
//
// Uses ExcelJS (already a project dependency).

import ExcelJS from "exceljs";
import { IRF_CATEGORY_FORMS, type IrfCategoryForm } from "@/lib/irf/categoryForms";
import type { IrfReport } from "@/lib/irf/definition";
import { normalizeIrfRows, computeIrfReach } from "@/lib/irf/normalize";

const NAVY = "FF0C2340";
const WHITE = "FFFFFFFF";
const SLATE = "FF334155";

/** Convert a stored value into a clean, human-readable cell string. */
function fmt(v: any): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => fmt(x)).filter((x) => x != null).join("; ");
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, val]) => `${k}: ${fmt(val) ?? ""}`)
      .join("; ");
  }
  const s = String(v);
  // Prettify snake_case option codes but leave sentences/dates intact.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  return s;
}

/** Estimate wrapped row height (in points) for a set of cell values. */
function estimateRowHeight(values: (string | number | null)[], widths: number[]): number {
  let maxLines = 1;
  values.forEach((v, i) => {
    if (v == null) return;
    const text = String(v);
    const charsPerLine = Math.max(8, (widths[i] || 20) * 1.05);
    const hardLines = text.split(/\r?\n/);
    let lines = 0;
    hardLines.forEach((line) => { lines += Math.max(1, Math.ceil(line.length / charsPerLine)); });
    maxLines = Math.max(maxLines, lines);
  });
  return Math.min(240, 16 + (maxLines - 1) * 13);
}

function styleTitle(ws: ExcelJS.Worksheet, totalCols: number, text: string, color: string) {
  ws.mergeCells(1, 1, 1, totalCols);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 13, color: { argb: WHITE } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  ws.getRow(1).height = 28;
}

interface Column {
  header: string;
  key: string;
  width: number;
  group: string;
  groupColor: string;
  meta?: boolean;
}

function hexToArgb(hex: string): string {
  const h = hex.replace("#", "");
  return `FF${h.toUpperCase()}`;
}

/** Lighten a hex accent for the group band vs header. */
function bandFill(hex: string): string {
  return hexToArgb(hex);
}

function buildFormSheet(
  wb: ExcelJS.Workbook,
  form: IrfCategoryForm,
  rows: IrfReport[],
  submitterNames: Record<string, string>,
) {
  const accent = hexToArgb(form.color);

  // Meta columns (record identity) then question columns grouped by activity.
  const metaCols: Column[] = [
    { header: "#", key: "__idx", width: 5, group: "Record", groupColor: SLATE, meta: true },
    { header: "Submitted By", key: "__submitter", width: 26, group: "Record", groupColor: SLATE, meta: true },
    { header: "Reporting Level", key: "reporting_level", width: 14, group: "Record", groupColor: SLATE, meta: true },
    { header: "State", key: "state", width: 16, group: "Record", groupColor: SLATE, meta: true },
    { header: "LGA", key: "lga", width: 16, group: "Record", groupColor: SLATE, meta: true },
    { header: "Ward", key: "ward", width: 16, group: "Record", groupColor: SLATE, meta: true },
    { header: "Submitted On", key: "__created", width: 20, group: "Record", groupColor: SLATE, meta: true },
  ];

  const questionCols: Column[] = [];
  form.groups.forEach((g) => {
    g.fields.forEach((f) => {
      const long = f.type === "longtext";
      questionCols.push({
        header: f.label,
        key: f.key,
        width: long ? 44 : 22,
        group: g.activity,
        groupColor: form.color,
      });
    });
  });

  const cols = [...metaCols, ...questionCols];
  const totalCols = cols.length;
  const widths = cols.map((c) => c.width);

  const safe = (form.short || "Form").replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Form";
  let name = safe;
  let n = 2;
  while (wb.worksheets.some((w) => w.name === name)) name = `${safe.slice(0, 25)} ${n++}`;

  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
    properties: { defaultRowHeight: 16 },
  });

  styleTitle(ws, totalCols, `${form.name}   •   ${rows.length.toLocaleString()} submission(s)`, NAVY);

  // Row 2: group band (merge consecutive same-group columns).
  let start = 1;
  for (let i = 1; i <= totalCols; i++) {
    const cur = cols[i - 1];
    const next = cols[i];
    if (!next || next.group !== cur.group) {
      if (i > start) ws.mergeCells(2, start, 2, i);
      const cell = ws.getCell(2, start);
      cell.value = cur.group;
      cell.font = { bold: true, size: 10, color: { argb: WHITE } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandFill(cur.groupColor.startsWith("#") ? cur.groupColor : `#${cur.groupColor.slice(2)}`) } };
      start = i + 1;
    }
  }
  ws.getRow(2).height = 20;

  // Row 3: question headers.
  const headerRow = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = {
      bottom: { style: "medium", color: { argb: c.meta ? NAVY : accent } },
      right: { style: "hair", color: { argb: "FFCBD5E1" } },
    };
    ws.getColumn(i + 1).width = c.width;
  });
  headerRow.height = 34;

  rows.forEach((r, idx) => {
    const values: (string | number | null)[] = cols.map((c) => {
      if (c.key === "__idx") return idx + 1;
      if (c.key === "__submitter") return submitterNames[(r as any).created_by] || (r as any).focal_person_name || "—";
      if (c.key === "__created") {
        const at = (r as any).created_at;
        return at ? new Date(at).toLocaleString() : "—";
      }
      return fmt((r as any)[c.key]);
    });

    const row = ws.addRow(values);
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF7F9FC";
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isMeta = cols[colNumber - 1]?.meta;
      cell.font = { size: 9, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = {
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
      if (colNumber === 2) cell.font = { size: 9, bold: true, color: { argb: hexToArgb(form.color) } };
      if (isMeta && colNumber === 1) cell.alignment = { vertical: "top", horizontal: "center" };
    });
    row.height = estimateRowHeight(values, widths);
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };
}

function buildMergedByDateSheet(
  wb: ExcelJS.Workbook,
  rows: IrfReport[],
  submitterNames: Record<string, string>,
) {
  const cols = [
    { header: "Date", width: 14 },
    { header: "Activity Form", width: 22 },
    { header: "Submitted By", width: 26 },
    { header: "Reporting Level", width: 14 },
    { header: "State", width: 16 },
    { header: "LGA", width: 16 },
    { header: "Ward", width: 16 },
    { header: "Outcome / Acceptance", width: 18 },
    { header: "People Reached", width: 14 },
    { header: "Key Narrative", width: 60 },
  ];
  const widths = cols.map((c) => c.width);
  const totalCols = cols.length;

  const ws = wb.addWorksheet("All Submissions by Date", {
    views: [{ state: "frozen", ySplit: 3 }],
    properties: { defaultRowHeight: 16 },
  });

  styleTitle(ws, totalCols, `All Submissions Merged by Date   •   ${rows.length.toLocaleString()} record(s)`, NAVY);

  ws.mergeCells(2, 1, 2, totalCols);
  const band = ws.getCell(2, 1);
  band.value = "Chronological cross-form register";
  band.font = { bold: true, size: 10, color: { argb: WHITE } };
  band.alignment = { vertical: "middle", horizontal: "center" };
  band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a4a6e" } };
  ws.getRow(2).height = 20;

  const headerRow = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = { bottom: { style: "medium", color: { argb: NAVY } }, right: { style: "hair", color: { argb: "FFCBD5E1" } } };
    ws.getColumn(i + 1).width = c.width;
  });
  headerRow.height = 30;

  const formShort = (id: string) => IRF_CATEGORY_FORMS.find((f) => f.id === id)?.short || (id === "other" ? "Legacy / Other" : id || "—");
  const formColor = (id: string) => IRF_CATEGORY_FORMS.find((f) => f.id === id)?.color || "#64748b";

  const dateOf = (r: any) => r.visit_date || r.reporting_month || (r.created_at ? String(r.created_at).slice(0, 10) : "");
  const sorted = [...rows].sort((a: any, b: any) => String(dateOf(b)).localeCompare(String(dateOf(a))));

  const num = (v: any) => (v == null || v === "" ? 0 : Number(v) || 0);

  sorted.forEach((r: any, idx) => {
    const reached = computeIrfReach(r);
    const narrative = [r.purpose, r.commitments, r.key_messages, r.issues, r.issues_raised, r.narrative]
      .map((x) => (x ? String(x) : "")).filter(Boolean).join(" — ");
    const values: (string | number | null)[] = [
      dateOf(r) || "—",
      formShort(r.form_category),
      submitterNames[r.created_by] || r.focal_person_name || "—",
      fmt(r.reporting_level),
      r.state || "—",
      r.lga || "—",
      r.ward || "—",
      r.outcome_level || "—",
      reached || null,
      narrative || null,
    ];
    const row = ws.addRow(values);
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF7F9FC";
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { size: 9, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = { right: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (colNumber === 2) cell.font = { size: 9, bold: true, color: { argb: hexToArgb(formColor(r.form_category)) } };
    });
    row.height = estimateRowHeight(values, widths);
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };
}

/**
 * Export SARMAAN ACSM reports to a richly formatted Excel workbook.
 * One sheet per activity form + a merged-by-date sheet + a summary cover.
 */
export async function exportIrfToExcel(
  reports: IrfReport[],
  submitterNames: Record<string, string>,
  fileLabel = "sarmaan-acsm-indicator-report",
): Promise<number> {
  const rows = normalizeIrfRows(reports);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — SARMAAN ACSM";
  wb.created = new Date();

  // Cover / summary sheet.
  const cover = wb.addWorksheet("Summary", { properties: { defaultRowHeight: 18 } });
  cover.columns = [{ width: 42 }, { width: 18 }, { width: 14 }];
  cover.mergeCells(1, 1, 1, 3);
  const ct = cover.getCell(1, 1);
  ct.value = `SARMAAN ACSM Indicator Report   •   Generated ${new Date().toLocaleString()}`;
  ct.font = { bold: true, size: 13, color: { argb: WHITE } };
  ct.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ct.alignment = { vertical: "middle", indent: 1 };
  cover.getRow(1).height = 28;

  const h = cover.getRow(3);
  ["Activity Form", "Submissions", "Colour"].forEach((label, i) => {
    const cell = h.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = { bottom: { style: "medium", color: { argb: NAVY } } };
  });

  // Group rows by category form.
  const byCat = new Map<string, IrfReport[]>();
  rows.forEach((r) => {
    const cat = (r as any).form_category || "other";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  });

  let ri = 4;
  IRF_CATEGORY_FORMS.forEach((form) => {
    const catRows = byCat.get(form.id) || [];
    if (!catRows.length) return;
    buildFormSheet(wb, form, catRows, submitterNames);
    const r = cover.getRow(ri++);
    r.getCell(1).value = form.name;
    r.getCell(1).font = { size: 10 };
    r.getCell(2).value = catRows.length;
    r.getCell(2).font = { size: 10, bold: true };
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(form.color) } };
  });

  // Legacy / other rows that don't map to a category form.
  const other = byCat.get("other");
  if (other && other.length) {
    const legacyForm: IrfCategoryForm = {
      id: "other", name: "Legacy / Other Reports", short: "Legacy", description: "", icon: "FileText", color: "#64748b",
      groups: [{ activity: "Report", fields: [
        { key: "narrative", label: "Narrative", type: "longtext" },
        { key: "outcome_level", label: "Outcome", type: "select" },
      ] }],
    };
    buildFormSheet(wb, legacyForm, other, submitterNames);
    const r = cover.getRow(ri++);
    r.getCell(1).value = legacyForm.name;
    r.getCell(1).font = { size: 10 };
    r.getCell(2).value = other.length;
    r.getCell(2).font = { size: 10, bold: true };
    r.getCell(2).alignment = { horizontal: "center" };
  }

  buildMergedByDateSheet(wb, rows, submitterNames);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `${fileLabel}-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
