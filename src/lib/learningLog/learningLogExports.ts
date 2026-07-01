// Beautiful, colourful multi-format exports (Excel, PDF, PPTX) for the Learning Log.
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import pptxgen from "pptxgenjs";
import type { LearningLogEntry, FeatureStatus } from "@/lib/learningLog/catalog";

const BRAND = {
  navy: "0C2340",
  navyLight: "1A4A6E",
  ice: "CADCFC",
  white: "FFFFFF",
};

const STATUS_HEX: Record<FeatureStatus, string> = {
  Operational: "10B981",
  Monitoring: "F59E0B",
  Resolved: "0EA5E9",
  "In Progress": "8B5CF6",
};

const COLUMNS: { key: keyof LearningLogEntry | "author"; header: string; width: number }[] = [
  { key: "feature", header: "Feature", width: 26 },
  { key: "category", header: "Category", width: 20 },
  { key: "description", header: "Description", width: 42 },
  { key: "fieldIssue", header: "Field Issue Identified", width: 46 },
  { key: "resolution", header: "How It Was Resolved", width: 46 },
  { key: "status", header: "Status", width: 16 },
  { key: "author", header: "Recorded By", width: 22 },
];

export interface ExportEntry extends LearningLogEntry {
  author?: string;
}

const cellText = (v: unknown) => (v == null || v === "" ? "—" : String(v));

function timestamp() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------- EXCEL ------------------------------- */
export async function exportLearningLogExcel(entries: ExportEntry[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  const ws = wb.addWorksheet("Learning Log", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const lastCol = COLUMNS.length;
  const lastColLetter = String.fromCharCode(64 + lastCol);

  // Title banner
  ws.mergeCells(`A1:${lastColLetter}1`);
  const title = ws.getCell("A1");
  title.value = "Learning Log — Feature Reliability Journey";
  title.font = { name: "Arial", size: 18, bold: true, color: { argb: `FF${BRAND.white}` } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND.navy}` } };
  ws.getRow(1).height = 34;

  // Subtitle
  ws.mergeCells(`A2:${lastColLetter}2`);
  const sub = ws.getCell("A2");
  sub.value = `Generated ${new Date().toLocaleString()} · ${entries.length} feature(s)`;
  sub.font = { name: "Arial", size: 10, italic: true, color: { argb: `FF${BRAND.white}` } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND.navyLight}` } };
  ws.getRow(2).height = 20;

  ws.getRow(3).height = 6;

  // Header row (row 4)
  const headerRow = ws.getRow(4);
  COLUMNS.forEach((col, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = col.header;
    c.font = { name: "Arial", size: 11, bold: true, color: { argb: `FF${BRAND.white}` } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND.navyLight}` } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FFBBBBBB" } } };
    ws.getColumn(i + 1).width = col.width;
  });
  headerRow.height = 24;

  // Data rows
  entries.forEach((e, idx) => {
    const row = ws.getRow(5 + idx);
    COLUMNS.forEach((col, i) => {
      const c = row.getCell(i + 1);
      const raw = col.key === "author" ? e.author : (e as any)[col.key];
      c.value = cellText(raw);
      c.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
      c.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      c.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
      if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FB" } };
      if (col.key === "status") {
        const hex = STATUS_HEX[e.status] || "6B7280";
        c.font = { name: "Arial", size: 10, bold: true, color: { argb: `FF${BRAND.white}` } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } };
        c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
    });
    // Auto row height estimate
    const longest = Math.max(
      cellText(e.description).length,
      cellText(e.fieldIssue).length,
      cellText(e.resolution).length,
    );
    row.height = Math.min(160, Math.max(30, Math.ceil(longest / 46) * 14 + 8));
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Learning-Log-${timestamp()}.xlsx`);
}

/* -------------------------------- PDF -------------------------------- */
export function exportLearningLogPdf(entries: ExportEntry[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Title banner
  doc.setFillColor(12, 35, 64);
  doc.rect(0, 0, pageW, 60, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Learning Log — Feature Reliability Journey", 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}  ·  ${entries.length} feature(s)`, 40, 48);

  autoTable(doc, {
    startY: 74,
    head: [["Feature", "Category", "Description", "Field Issue", "Resolution", "Status", "Recorded By"]],
    body: entries.map((e) => [
      cellText(e.feature),
      cellText(e.category),
      cellText(e.description),
      cellText(e.fieldIssue),
      cellText(e.resolution),
      cellText(e.status),
      cellText(e.author),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, valign: "top", overflow: "linebreak", lineColor: [229, 231, 235] },
    headStyles: { fillColor: [26, 74, 110], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [243, 246, 251] },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold" },
      1: { cellWidth: 70 },
      2: { cellWidth: 150 },
      3: { cellWidth: 160 },
      4: { cellWidth: 160 },
      5: { cellWidth: 60, halign: "center" },
      6: { cellWidth: 72 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const st = entries[data.row.index]?.status as FeatureStatus;
        const hex = STATUS_HEX[st];
        if (hex) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          data.cell.styles.fillColor = [r, g, b];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Amehnities · HANDS Nigeria", 40, h - 16);
    },
  });

  doc.save(`Learning-Log-${timestamp()}.pdf`);
}

/* -------------------------------- PPTX ------------------------------- */
export async function exportLearningLogPptx(entries: ExportEntry[]) {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.author = "Amehnities";

  const hex = (h: string) => h.replace("#", "");

  // Title slide
  const title = pptx.addSlide();
  title.background = { color: BRAND.navy };
  title.addText("Learning Log", { x: 0.7, y: 2.4, w: 12, h: 1, fontSize: 54, bold: true, color: "FFFFFF", fontFace: "Arial" });
  title.addText("Feature Reliability Journey — field issues, resolutions & current status", {
    x: 0.7, y: 3.5, w: 12, h: 0.6, fontSize: 20, color: hex(BRAND.ice), fontFace: "Arial",
  });
  title.addText(`Generated ${new Date().toLocaleDateString()}  ·  ${entries.length} feature(s)`, {
    x: 0.7, y: 6.4, w: 12, h: 0.4, fontSize: 13, italic: true, color: "9FB3C8", fontFace: "Arial",
  });

  // Summary slide with status counts
  const counts: Record<string, number> = {};
  entries.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });
  const summary = pptx.addSlide();
  summary.background = { color: "F4F7FB" };
  summary.addText("Status Overview", { x: 0.6, y: 0.4, w: 12, h: 0.7, fontSize: 30, bold: true, color: BRAND.navy, fontFace: "Arial" });
  const statuses: FeatureStatus[] = ["Operational", "Monitoring", "Resolved", "In Progress"];
  statuses.forEach((st, i) => {
    const x = 0.6 + i * 3.1;
    summary.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 2.8, h: 2, fill: { color: STATUS_HEX[st] }, rectRadius: 0.12, line: { color: STATUS_HEX[st] } });
    summary.addText(String(counts[st] || 0), { x, y: 1.8, w: 2.8, h: 1, fontSize: 48, bold: true, color: "FFFFFF", align: "center", fontFace: "Arial" });
    summary.addText(st, { x, y: 2.9, w: 2.8, h: 0.5, fontSize: 16, color: "FFFFFF", align: "center", fontFace: "Arial" });
  });

  // One card slide per feature
  entries.forEach((e) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    // Header band
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.4, fill: { color: BRAND.navy } });
    s.addText(e.feature, { x: 0.6, y: 0.25, w: 9.5, h: 0.7, fontSize: 26, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s.addText(e.category, { x: 0.6, y: 0.92, w: 9.5, h: 0.35, fontSize: 13, color: hex(BRAND.ice), fontFace: "Arial" });
    // Status pill
    s.addShape(pptx.ShapeType.roundRect, { x: 10.6, y: 0.45, w: 2.1, h: 0.55, fill: { color: STATUS_HEX[e.status] || "6B7280" }, rectRadius: 0.25, line: { color: STATUS_HEX[e.status] || "6B7280" } });
    s.addText(e.status, { x: 10.6, y: 0.45, w: 2.1, h: 0.55, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Arial" });

    s.addText(cellText(e.description), { x: 0.6, y: 1.7, w: 12.1, h: 0.9, fontSize: 15, color: "334155", fontFace: "Arial" });

    // Issue box
    s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 2.8, w: 5.9, h: 3.8, fill: { color: "FEF3C7" }, line: { color: "F59E0B", width: 1 }, rectRadius: 0.08 });
    s.addText("⚠  Field issue identified", { x: 0.85, y: 3.0, w: 5.4, h: 0.5, fontSize: 15, bold: true, color: "92400E", fontFace: "Arial" });
    s.addText(cellText(e.fieldIssue), { x: 0.85, y: 3.55, w: 5.4, h: 2.9, fontSize: 13, color: "334155", fontFace: "Arial", valign: "top" });

    // Resolution box
    s.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 2.8, w: 5.9, h: 3.8, fill: { color: "D1FAE5" }, line: { color: "10B981", width: 1 }, rectRadius: 0.08 });
    s.addText("✓  How it was resolved", { x: 7.05, y: 3.0, w: 5.4, h: 0.5, fontSize: 15, bold: true, color: "065F46", fontFace: "Arial" });
    s.addText(cellText(e.resolution), { x: 7.05, y: 3.55, w: 5.4, h: 2.9, fontSize: 13, color: "334155", fontFace: "Arial", valign: "top" });

    if (e.author) {
      s.addText(`Recorded by ${e.author}`, { x: 0.6, y: 6.8, w: 12, h: 0.4, fontSize: 11, italic: true, color: "94A3B8", fontFace: "Arial" });
    }
  });

  await pptx.writeFile({ fileName: `Learning-Log-${timestamp()}.pptx` });
}
