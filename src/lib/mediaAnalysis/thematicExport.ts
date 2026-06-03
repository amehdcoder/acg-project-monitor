import jsPDF from "jspdf";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import { saveAs } from "file-saver";

export interface Theme {
  name: string;
  description: string;
  prevalence: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  keywords: string[];
  quotes: string[];
}

export interface ThematicResult {
  overview: string;
  sentiment?: { positive: number; neutral: number; negative: number };
  themes: Theme[];
  insights: string[];
  recommendations: string[];
}

const PALETTE = ["#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#ca8a04", "#dc2626"];

/* ---------------- Canvas chart renderers ---------------- */

function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

/** Donut chart of sentiment distribution. Returns PNG data URL or null. */
export function renderSentimentChart(s?: { positive: number; neutral: number; negative: number }): string | null {
  if (!s) return null;
  const total = (s.positive || 0) + (s.neutral || 0) + (s.negative || 0);
  if (total <= 0) return null;
  const { c, ctx } = newCanvas(520, 280);
  const cx = 140, cy = 140, r = 100, inner = 56;
  const segs = [
    { label: "Positive", val: s.positive || 0, color: "#16a34a" },
    { label: "Neutral", val: s.neutral || 0, color: "#94a3b8" },
    { label: "Negative", val: s.negative || 0, color: "#dc2626" },
  ];
  let start = -Math.PI / 2;
  for (const seg of segs) {
    const angle = (seg.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    start += angle;
  }
  // inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  // legend
  ctx.textBaseline = "middle";
  ctx.font = "16px Helvetica, Arial, sans-serif";
  let ly = 92;
  for (const seg of segs) {
    ctx.fillStyle = seg.color;
    ctx.fillRect(300, ly - 8, 16, 16);
    ctx.fillStyle = "#1e293b";
    ctx.fillText(`${seg.label}  ${Math.round((seg.val / total) * 100)}%`, 324, ly);
    ly += 32;
  }
  return c.toDataURL("image/png");
}

/** Horizontal bar chart of theme prevalence. Returns PNG data URL or null. */
export function renderPrevalenceChart(themes: Theme[]): string | null {
  const list = (themes || []).filter(t => t.name).slice(0, 8);
  if (list.length === 0) return null;
  const rowH = 38, top = 24, left = 170, chartW = 300;
  const h = top + list.length * rowH + 20;
  const { c, ctx } = newCanvas(540, h);
  const max = Math.max(...list.map(t => t.prevalence || 0), 1);
  ctx.font = "14px Helvetica, Arial, sans-serif";
  ctx.textBaseline = "middle";
  list.forEach((t, i) => {
    const y = top + i * rowH + rowH / 2;
    const w = Math.max(((t.prevalence || 0) / max) * chartW, 2);
    // label
    ctx.fillStyle = "#334155";
    ctx.textAlign = "right";
    const name = t.name.length > 22 ? t.name.slice(0, 21) + "…" : t.name;
    ctx.fillText(name, left - 12, y);
    // bar
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(left, y - 11, w, 22);
    // value
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "left";
    ctx.fillText(String(t.prevalence || 0), left + w + 8, y);
  });
  return c.toDataURL("image/png");
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const sentColor = (s: string) =>
  s === "positive" ? "16a34a" : s === "negative" ? "dc2626" : s === "mixed" ? "ca8a04" : "64748b";

/* ---------------- PDF export ---------------- */

export function exportThematicPDF(t: ThematicResult, docCount: number, filename?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 48;
  const ensure = (need: number) => { if (y + need > H - 40) { doc.addPage(); y = 48; } };

  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(30, 41, 59);
  doc.text("Thematic Analysis Report", M, y); y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleString()}  •  ${docCount} document(s)  •  ${(t.themes || []).length} themes`, M, y);
  y += 24;

  // Overview
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(37, 99, 235);
  doc.text("Executive Overview", M, y); y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(40);
  const ovLines = doc.splitTextToSize(t.overview || "—", W - 2 * M);
  ensure(ovLines.length * 13);
  doc.text(ovLines, M, y); y += ovLines.length * 13 + 16;

  // Charts row
  const sChart = renderSentimentChart(t.sentiment);
  const pChart = renderPrevalenceChart(t.themes);
  if (sChart) {
    ensure(150);
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30, 41, 59);
    doc.text("Sentiment Distribution", M, y); y += 10;
    doc.addImage(sChart, "PNG", M, y, 240, 130); y += 142;
  }
  if (pChart) {
    ensure(160);
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30, 41, 59);
    doc.text("Theme Prevalence", M, y); y += 10;
    const pw = W - 2 * M;
    const ph = pw * (pChart ? 0.5 : 0.5);
    doc.addImage(pChart, "PNG", M, y, pw, Math.min(ph, 220)); y += Math.min(ph, 220) + 16;
  }

  // Themes
  ensure(30);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(37, 99, 235);
  doc.text("Themes", M, y); y += 18;
  (t.themes || []).forEach((th, i) => {
    ensure(60);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(30, 41, 59);
    doc.text(`${i + 1}. ${th.name}`, M, y);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
    doc.text(`${th.prevalence} doc(s) • ${th.sentiment}`, W - M, y, { align: "right" });
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(60);
    const dl = doc.splitTextToSize(th.description || "", W - 2 * M);
    ensure(dl.length * 12);
    doc.text(dl, M, y); y += dl.length * 12 + 2;
    if (th.keywords?.length) {
      doc.setFontSize(9).setTextColor(37, 99, 235);
      const kl = doc.splitTextToSize("Keywords: " + th.keywords.join(", "), W - 2 * M);
      ensure(kl.length * 11);
      doc.text(kl, M, y); y += kl.length * 11 + 2;
    }
    (th.quotes || []).slice(0, 3).forEach(q => {
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(90);
      const ql = doc.splitTextToSize(`“${q}”`, W - 2 * M - 14);
      ensure(ql.length * 11);
      doc.text(ql, M + 14, y); y += ql.length * 11;
      doc.setFont("helvetica", "normal");
    });
    y += 10;
  });

  // Insights
  const bullets = (title: string, items: string[]) => {
    if (!items?.length) return;
    ensure(30);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(37, 99, 235);
    doc.text(title, M, y); y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(40);
    items.forEach(it => {
      const il = doc.splitTextToSize("•  " + it, W - 2 * M - 10);
      ensure(il.length * 13);
      doc.text(il, M + 6, y); y += il.length * 13 + 2;
    });
    y += 10;
  };
  bullets("Key Insights", t.insights || []);
  bullets("Recommendations", t.recommendations || []);

  doc.save(filename || `thematic-analysis-${Date.now()}.pdf`);
}

/* ---------------- Word (DOCX) export ---------------- */

export async function exportThematicDocx(t: ThematicResult, docCount: number, filename?: string) {
  const children: any[] = [];

  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Thematic Analysis Report", bold: true })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}  •  ${docCount} document(s)  •  ${(t.themes || []).length} themes`, color: "64748B", size: 18 })], spacing: { after: 200 } }));

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Executive Overview")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: t.overview || "—" })], spacing: { after: 200 } }));

  // Charts
  const sChart = renderSentimentChart(t.sentiment);
  if (sChart) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Sentiment Distribution")] }));
    children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlToUint8(sChart), transformation: { width: 360, height: 194 }, altText: { title: "Sentiment", description: "Sentiment distribution", name: "sentiment" } })], spacing: { after: 160 } }));
  }
  const pChart = renderPrevalenceChart(t.themes);
  if (pChart) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Theme Prevalence")] }));
    const themeCount = (t.themes || []).filter(x => x.name).slice(0, 8).length;
    const ph = Math.round(420 * ((24 + themeCount * 38 + 20) / 540));
    children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlToUint8(pChart), transformation: { width: 420, height: ph }, altText: { title: "Prevalence", description: "Theme prevalence", name: "prevalence" } })], spacing: { after: 200 } }));
  }

  // Themes table
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Themes")] }));
  (t.themes || []).forEach((th, i) => {
    children.push(new Paragraph({ spacing: { before: 160 }, children: [
      new TextRun({ text: `${i + 1}. ${th.name}  `, bold: true, size: 24 }),
      new TextRun({ text: `(${th.prevalence} doc(s) • ${th.sentiment})`, color: sentColor(th.sentiment), size: 18 }),
    ] }));
    if (th.description) children.push(new Paragraph({ children: [new TextRun({ text: th.description })] }));
    if (th.keywords?.length) children.push(new Paragraph({ children: [new TextRun({ text: "Keywords: ", bold: true, color: "2563EB" }), new TextRun({ text: th.keywords.join(", "), color: "2563EB" })] }));
    (th.quotes || []).slice(0, 4).forEach(q => {
      children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: `“${q}”`, italics: true, color: "475569" })] }));
    });
  });

  const bullets = (title: string, items: string[]) => {
    if (!items?.length) return;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }));
    items.forEach(it => children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: it })] })));
  };
  bullets("Key Insights", t.insights || []);
  bullets("Recommendations", t.recommendations || []);

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: "1E293B" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: "334155" }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 1 } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename || `thematic-analysis-${Date.now()}.docx`);
}
