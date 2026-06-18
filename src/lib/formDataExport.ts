// Generic, beautifully-formatted Excel export for ANY form's collected data.
// Mirrors the visual language of the Bloomberg Validation "Collected Data"
// workbook: navy title banner, coloured group band, frozen headers, zebra
// striping, status pills and auto-filter. One worksheet per form so a single
// download captures the entire app's submissions in a clean, analysis-ready
// shape.

import ExcelJS from "exceljs";
import { getFieldLabel, type QuestionLabelMap } from "@/lib/formLabelUtils";

const NAVY = "FF0C2340";
const BLUE = "FF2563EB";
const TEAL = "FF14B8A6";
const WHITE = "FFFFFFFF";

export interface ExportSubmission {
  id: string;
  form_id: string;
  form_name?: string;
  data: Record<string, any>;
  status: string;
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number } | null;
  within_geofence?: boolean | null;
  created_at: string;
  submitted_at?: string | null;
  synced_at?: string | null;
  isPending?: boolean;
}

const STATUS_FILL: Record<string, string> = {
  sent: "FFDCFCE7",
  synced: "FFDBEAFE",
  finalized: "FFEDE9FE",
  draft: "FFF1F5F9",
  pending: "FFFEF9C3",
};
const STATUS_FG: Record<string, string> = {
  sent: "FF15803D",
  synced: "FF1D4ED8",
  finalized: "FF6D28D9",
  draft: "FF475569",
  pending: "FF854D0E",
};

const isGPS = (v: any) =>
  v && typeof v === "object" && !Array.isArray(v) && ("lat" in v || "latitude" in v);

const formatCell = (v: any): string | number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (isGPS(v)) {
    const lat = v.lat ?? v.latitude;
    const lng = v.lng ?? v.longitude;
    return lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "";
  }
  if (Array.isArray(v)) return v.map((x) => formatCell(x)).filter((x) => x !== null).join("; ");
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, val]) => `${k}: ${formatCell(val) ?? ""}`)
      .join("; ");
  }
  // Prettify snake_case option codes for readability.
  return String(v).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const statusLabel = (s: ExportSubmission): string => {
  if (s.isPending) return "Pending";
  if (s.status === "sent") return "Submitted";
  if (s.synced_at) return "Synced";
  return s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : "—";
};

const statusKey = (s: ExportSubmission): string => {
  if (s.isPending) return "pending";
  if (s.status === "sent") return "sent";
  if (s.synced_at) return "synced";
  return s.status || "draft";
};

function buildSheet(
  wb: ExcelJS.Workbook,
  formName: string,
  rows: ExportSubmission[],
  labels?: QuestionLabelMap,
) {
  // Union of all data field keys across this form's submissions, preserving
  // first-seen order so the layout is stable and complete.
  const fieldKeys: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r) => {
    Object.keys(r.data || {}).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        fieldKeys.push(k);
      }
    });
  });

  const META = [
    { header: "#", width: 5 },
    { header: "Status", width: 13 },
    { header: "Date Submitted", width: 20 },
    { header: "Within Geofence", width: 15 },
  ];
  const fieldCols = fieldKeys.map((k) => ({
    header: getFieldLabel(k, labels) || k,
    width: 22,
    key: k,
  }));
  const totalCols = META.length + fieldCols.length;

  const safeName = (formName || "Form").replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Form";
  let sheetName = safeName;
  let n = 2;
  while (wb.worksheets.some((w) => w.name === sheetName)) sheetName = `${safeName.slice(0, 25)} ${n++}`;

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 3 }],
    properties: { defaultRowHeight: 16 },
  });

  // Row 1: title banner
  ws.mergeCells(1, 1, 1, totalCols);
  const title = ws.getCell(1, 1);
  title.value = `${formName}   •   ${rows.length.toLocaleString()} submissions   •   Generated ${new Date().toLocaleString()}`;
  title.font = { bold: true, size: 13, color: { argb: WHITE } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 28;

  // Row 2: group band (Record / Form Responses)
  ws.mergeCells(2, 1, 2, META.length);
  const g1 = ws.getCell(2, 1);
  g1.value = "Record";
  if (fieldCols.length) {
    ws.mergeCells(2, META.length + 1, 2, totalCols);
    const g2 = ws.getCell(2, META.length + 1);
    g2.value = "Form Responses";
    g2.font = { bold: true, size: 10, color: { argb: WHITE } };
    g2.alignment = { vertical: "middle", horizontal: "center" };
    g2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  }
  g1.font = { bold: true, size: 10, color: { argb: WHITE } };
  g1.alignment = { vertical: "middle", horizontal: "center" };
  g1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(2).height = 20;

  // Row 3: column headers
  const headerRow = ws.getRow(3);
  const allCols = [...META, ...fieldCols];
  allCols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = {
      bottom: { style: "medium", color: { argb: i < META.length ? NAVY : TEAL } },
      right: { style: "hair", color: { argb: "FFCBD5E1" } },
    };
    ws.getColumn(i + 1).width = c.width;
  });
  headerRow.height = 30;

  rows.forEach((sub, idx) => {
    const data: any[] = [
      idx + 1,
      statusLabel(sub),
      sub.submitted_at
        ? new Date(sub.submitted_at).toLocaleString()
        : sub.created_at
          ? new Date(sub.created_at).toLocaleString()
          : "—",
      sub.within_geofence === true ? "Yes" : sub.within_geofence === false ? "No" : "—",
    ];
    fieldKeys.forEach((k) => data.push(formatCell(sub.data?.[k])));

    const row = ws.addRow(data);
    row.height = 16;
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF7F9FC";
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { size: 9, color: { argb: "FF1F2937" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber <= META.length ? "left" : "left",
        wrapText: colNumber > META.length,
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = {
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });

    // Status pill
    const sk = statusKey(sub);
    const stCell = row.getCell(2);
    if (STATUS_FILL[sk]) {
      stCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[sk] } };
      stCell.font = { size: 9, bold: true, color: { argb: STATUS_FG[sk] } };
    }
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };
}

/**
 * Export the provided submissions to a richly formatted Excel workbook,
 * grouping each form onto its own worksheet. Returns the number of rows written.
 */
export async function exportFormDataToExcel(
  submissions: ExportSubmission[],
  labelMaps: Record<string, QuestionLabelMap> = {},
  fileLabel = "form-data",
): Promise<number> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  // Group by form.
  const byForm = new Map<string, ExportSubmission[]>();
  submissions.forEach((s) => {
    const key = s.form_id || s.form_name || "unknown";
    if (!byForm.has(key)) byForm.set(key, []);
    byForm.get(key)!.push(s);
  });

  if (byForm.size === 0) {
    const ws = wb.addWorksheet("No Data");
    ws.getCell(1, 1).value = "No submissions available to export.";
  } else {
    // Cover / index sheet.
    const cover = wb.addWorksheet("Summary", { properties: { defaultRowHeight: 18 } });
    cover.columns = [{ width: 40 }, { width: 18 }];
    cover.mergeCells(1, 1, 1, 2);
    const ct = cover.getCell(1, 1);
    ct.value = `Amehnities — Collected Form Data   •   Generated ${new Date().toLocaleString()}`;
    ct.font = { bold: true, size: 13, color: { argb: WHITE } };
    ct.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ct.alignment = { vertical: "middle", indent: 1 };
    cover.getRow(1).height = 28;
    const h = cover.getRow(3);
    h.getCell(1).value = "Form";
    h.getCell(2).value = "Submissions";
    [1, 2].forEach((c) => {
      const cell = h.getCell(c);
      cell.font = { bold: true, size: 10, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
      cell.border = { bottom: { style: "medium", color: { argb: BLUE } } };
    });

    let ri = 4;
    for (const [key, rows] of byForm) {
      const name = rows[0]?.form_name || "Unknown Form";
      buildSheet(wb, name, rows, labelMaps[key] || labelMaps[rows[0]?.form_id]);
      const r = cover.getRow(ri++);
      r.getCell(1).value = name;
      r.getCell(1).font = { size: 10 };
      r.getCell(2).value = rows.length;
      r.getCell(2).font = { size: 10, bold: true };
      r.getCell(2).alignment = { horizontal: "center" };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `${fileLabel}-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return submissions.length;
}
