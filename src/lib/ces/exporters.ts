import jsPDF from "jspdf";

export function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) {
    const blob = new Blob([""], { type: "text/csv" });
    triggerDownload(blob, filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadGeoJSON(featureCollection: any, filename: string) {
  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: "application/geo+json" });
  triggerDownload(blob, filename);
}

export function generateCESReportPDF(opts: {
  surveyName: string;
  community: string;
  lga: string;
  state: string;
  date: string;
  inferredCoveragePct: number;
  ci95: [number, number];
  ci99: [number, number];
  designEffect: number;
  totalSampled: number;
  totalTreated: number;
  segmentsCount: number;
  statusBreakdown: Record<string, number>;
  filename?: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("Coverage Evaluation Survey (CES) Report", 40, y); y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(opts.surveyName, 40, y); y += 14;
  doc.text(`${opts.community}, ${opts.lga}, ${opts.state} — ${opts.date}`, 40, y); y += 20;

  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Inferred Coverage", 40, y); y += 16;
  doc.setFontSize(28).setTextColor(22, 163, 74);
  doc.text(`${opts.inferredCoveragePct.toFixed(1)}%`, 40, y); y += 10;
  doc.setTextColor(0).setFontSize(10).setFont("helvetica", "normal");
  doc.text(
    `95% CI: [${opts.ci95[0].toFixed(1)}%, ${opts.ci95[1].toFixed(1)}%]   |   99% CI: [${opts.ci99[0].toFixed(1)}%, ${opts.ci99[1].toFixed(1)}%]`,
    40, y + 16,
  ); y += 32;
  doc.text(`Design Effect: ${opts.designEffect.toFixed(2)}   |   Segments: ${opts.segmentsCount}   |   Sampled HH: ${opts.totalSampled}   |   Treated: ${opts.totalTreated}`, 40, y); y += 24;

  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Status Breakdown", 40, y); y += 14;
  doc.setFont("helvetica", "normal").setFontSize(10);
  for (const [k, v] of Object.entries(opts.statusBreakdown)) {
    doc.text(`${k}: ${v}`, 50, y); y += 12;
  }

  y = doc.internal.pageSize.getHeight() - 60;
  doc.setFontSize(8).setTextColor(100);
  doc.text(
    "Sampling: Equal-area k-means segmentation of estimated household centroids; one segment randomly selected per CES round; design-based weighted estimator with finite population correction; CIs from normal approximation. Methodology aligns with WHO CES guidance.",
    40, y, { maxWidth: W - 80 },
  );

  doc.save(opts.filename || `ces-report-${Date.now()}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
