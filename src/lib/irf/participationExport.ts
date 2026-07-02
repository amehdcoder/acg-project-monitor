// Downloadable exports (Excel / Word / PDF) for the SARMAAN ACSM participation
// tables — "Submitted" and "Not yet submitted". Each export is colourfully and
// professionally formatted with a branded navy header band.
import ExcelJS from "exceljs";
import jsPDF from "jspdf";

const NAVY = "0C2340";
const NAVY_HEX = "#0c2340";
const ACCENT = "0891B2";

export interface ParticipationTable {
  /** Sheet / section title. */
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  /** Accent colour for this table's header band (hex without #). */
  accent?: string;
}

const stamp = () => new Date().toISOString().slice(0, 10);
const sanitize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "participation";

/* ─────────────────────────  EXCEL  ───────────────────────── */
export async function exportParticipationExcel(tables: ParticipationTable[], fileName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — SARMAAN ACSM";
  wb.created = new Date();

  for (const t of tables) {
    const accent = t.accent || ACCENT;
    const ws = wb.addWorksheet(t.title.slice(0, 30), {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    const colCount = t.headers.length;

    // Title band
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = t.title;
    titleCell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY}` } };
    ws.getRow(1).height = 26;

    // Subtitle band
    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = t.subtitle || `Generated ${new Date().toLocaleString()}`;
    subCell.font = { italic: true, size: 10, color: { argb: "FF334155" } };
    subCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    ws.getRow(2).height = 18;

    // Header row
    const headerRow = ws.getRow(3);
    t.headers.forEach((h, i) => {
      const c = headerRow.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent}` } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
      c.border = { bottom: { style: "thin", color: { argb: "FFFFFFFF" } } };
    });
    headerRow.height = 22;

    // Data rows with zebra striping
    t.rows.forEach((r, ri) => {
      const row = ws.getRow(ri + 4);
      r.forEach((v, ci) => {
        const c = row.getCell(ci + 1);
        c.value = v as any;
        c.font = { size: 10, color: { argb: "FF1E293B" } };
        c.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : "center", wrapText: true };
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ri % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
        };
        c.border = {
          bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
          right: { style: "hair", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    // Column widths
    t.headers.forEach((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...t.rows.map((r) => String(r[i] ?? "").length),
      );
      ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 14), i === 0 ? 30 : 40);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${sanitize(fileName)}-${stamp()}.xlsx`);
}

/* ─────────────────────────  WORD  ───────────────────────── */
export function exportParticipationWord(tables: ParticipationTable[], fileName: string) {
  const esc = (s: any) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const sections = tables
    .map((t) => {
      const accent = `#${t.accent || ACCENT}`;
      const head = t.headers
        .map(
          (h) =>
            `<th style="background:${accent};color:#fff;padding:8px 10px;text-align:left;border:1px solid #fff;font-size:12px;">${esc(h)}</th>`,
        )
        .join("");
      const body = t.rows
        .map(
          (r, ri) =>
            `<tr style="background:${ri % 2 === 0 ? "#f8fafc" : "#ffffff"};">` +
            r
              .map(
                (v) =>
                  `<td style="padding:6px 10px;border:1px solid #e2e8f0;font-size:11px;color:#1e293b;">${esc(v)}</td>`,
              )
              .join("") +
            `</tr>`,
        )
        .join("");
      return `
        <h2 style="color:${NAVY_HEX};font-family:Arial,sans-serif;margin:18px 0 4px;">${esc(t.title)}</h2>
        <p style="color:#64748b;font-family:Arial,sans-serif;font-size:11px;margin:0 0 8px;">${esc(t.subtitle || `Generated ${new Date().toLocaleString()}`)}</p>
        <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>`;
    })
    .join("<br/>");

  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>SARMAAN ACSM Participation</title></head><body>
    <h1 style="color:${NAVY_HEX};font-family:Arial,sans-serif;">SARMAAN ACSM — Data Participation Report</h1>
    ${sections}
  </body></html>`;

  triggerDownload(new Blob(["\ufeff", html], { type: "application/msword" }), `${sanitize(fileName)}-${stamp()}.doc`);
}

/* ─────────────────────────  PDF  ───────────────────────── */
export function exportParticipationPdf(tables: ParticipationTable[], fileName: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;

  let first = true;
  for (const t of tables) {
    if (!first) pdf.addPage();
    first = false;
    const accent = hexToRgb(t.accent || ACCENT);

    // Branded header band
    pdf.setFillColor(12, 35, 64);
    pdf.rect(0, 0, pageW, 46, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold").setFontSize(14);
    pdf.text(t.title, margin, 22);
    pdf.setFont("helvetica", "normal").setFontSize(8.5);
    pdf.text(t.subtitle || `Generated ${new Date().toLocaleString()}`, margin, 37);

    const cols = t.headers.length;
    const usableW = pageW - margin * 2;
    // First column wider (names / forms).
    const firstW = usableW * 0.32;
    const otherW = (usableW - firstW) / Math.max(cols - 1, 1);
    const colW = (i: number) => (i === 0 ? firstW : otherW);
    const colX = (i: number) => margin + (i === 0 ? 0 : firstW + otherW * (i - 1));

    let y = 62;
    const drawHead = () => {
      pdf.setFillColor(accent[0], accent[1], accent[2]);
      pdf.rect(margin, y, usableW, 20, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold").setFontSize(8.5);
      t.headers.forEach((h, i) => {
        pdf.text(String(h), colX(i) + 4, y + 13, { maxWidth: colW(i) - 8 });
      });
      y += 20;
    };
    drawHead();

    pdf.setFont("helvetica", "normal").setFontSize(8);
    t.rows.forEach((r, ri) => {
      // Estimate row height from wrapped text
      const lineCounts = r.map((v, i) => pdf.splitTextToSize(String(v ?? ""), colW(i) - 8).length);
      const rowH = Math.max(16, Math.max(...lineCounts) * 9 + 6);
      if (y + rowH > pageH - margin) {
        pdf.addPage();
        y = margin;
        drawHead();
        pdf.setFont("helvetica", "normal").setFontSize(8);
      }
      pdf.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 250 : 255, ri % 2 === 0 ? 252 : 255);
      pdf.rect(margin, y, usableW, rowH, "F");
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y + rowH, margin + usableW, y + rowH);
      pdf.setTextColor(30, 41, 59);
      r.forEach((v, i) => {
        const lines = pdf.splitTextToSize(String(v ?? ""), colW(i) - 8);
        pdf.text(lines, colX(i) + 4, y + 11);
      });
      y += rowH;
    });
  }

  pdf.save(`${sanitize(fileName)}-${stamp()}.pdf`);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
