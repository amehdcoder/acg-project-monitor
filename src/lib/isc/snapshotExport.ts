/**
 * Dashboard snapshot export (PNG / PDF).
 *
 * Renders a live DOM node to canvas and downloads it as a high-DPI image or a
 * correctly-oriented, single-page PDF sized to the dashboard itself so nothing
 * is cropped.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard";

async function render(node: HTMLElement) {
  return html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: Math.min(2, window.devicePixelRatio || 1) * 1.5,
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

export async function exportSnapshotPNG(node: HTMLElement, title: string) {
  const canvas = await render(node);
  const a = document.createElement("a");
  a.download = `${slug(title)}-${new Date().toISOString().slice(0, 10)}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export async function exportSnapshotPDF(node: HTMLElement, title: string, subtitle?: string) {
  const canvas = await render(node);
  const w = canvas.width;
  const h = canvas.height;
  const headerH = 90;

  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h + headerH],
    compress: true,
  });

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, w, h + headerH, "F");
  pdf.setTextColor(32, 33, 36);
  pdf.setFontSize(28);
  pdf.text(title, 24, 42);
  pdf.setFontSize(14);
  pdf.setTextColor(95, 99, 104);
  pdf.text(subtitle ?? `Exported ${new Date().toLocaleString()}`, 24, 68);

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, headerH, w, h);
  pdf.save(`${slug(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
