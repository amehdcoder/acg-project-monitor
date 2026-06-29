/**
 * High-fidelity, multi-page PDF export of a live dashboard DOM node.
 * ────────────────────────────────────────────────────────────────────────
 * Renders the dashboard container to a single high-resolution canvas, then
 * slices that canvas across A4 pages so nothing overlaps and no content is
 * clipped between page breaks. A branded navy header band is drawn on every
 * page for a professional, program-ready report.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const NAVY = "#0c2340";

export interface DashboardPdfOptions {
  title: string;
  subtitle?: string;
  /** File name without extension. */
  fileName?: string;
}

const sanitize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "dashboard";

export async function exportDashboardPdf(
  node: HTMLElement,
  opts: DashboardPdfOptions,
): Promise<void> {
  // Render the whole dashboard to one big canvas at 2× for crisp text.
  const canvas = await html2canvas(node, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    scale: Math.min(2, window.devicePixelRatio > 1 ? 2 : 1.5),
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    // Skip elements explicitly marked as non-exportable (e.g. interactive-only controls).
    ignoreElements: (el) => el.getAttribute?.("data-pdf-exclude") === "true",
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Layout: branded header band on each page, content below it.
  const margin = 24;
  const headerH = 54;
  const contentTop = headerH + 14;
  const contentW = pageW - margin * 2;
  const contentH = pageH - contentTop - margin;

  // Scale factor mapping canvas px → pdf pt for the chosen content width.
  const scale = contentW / canvas.width;
  // How many source-canvas px fit in one page's content area.
  const pageSliceHpx = Math.floor(contentH / scale);
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageSliceHpx));

  const drawHeader = (pageNo: number) => {
    pdf.setFillColor(NAVY);
    pdf.rect(0, 0, pageW, headerH, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold").setFontSize(14);
    pdf.text(opts.title, margin, 26);
    pdf.setFont("helvetica", "normal").setFontSize(8.5);
    const meta = `${opts.subtitle ? opts.subtitle + "  •  " : ""}Generated ${new Date().toLocaleString()}`;
    pdf.text(meta, margin, 42);
    pdf.setFontSize(8);
    pdf.text(`Page ${pageNo} of ${totalPages}`, pageW - margin, 42, { align: "right" });
  };

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    drawHeader(page + 1);

    const sliceY = page * pageSliceHpx;
    const sliceH = Math.min(pageSliceHpx, canvas.height - sliceY);
    if (sliceH <= 0) continue;

    // Copy this slice into a temp canvas so we can add it as its own image.
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const imgData = slice.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", margin, contentTop, contentW, sliceH * scale);
  }

  pdf.save(`${sanitize(opts.fileName || opts.title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
