// Renders the LBR integration specification into PDF, Word, PowerPoint, TXT and JSON.
import type { LbrApiSpec } from "./lbrApiSpec";
import amehnitiesLogo from "@/assets/logo-amehnities.png";
import fmohLogo from "@/assets/logo-fmoh.png";
import cbmLogo from "@/assets/cbm-logo.png";
import ecwaLogo from "@/assets/ecwa-logo.png";
import acgLogo from "@/assets/acg-logo.png";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";

export type SpecFormat = "pdf" | "docx" | "pptx" | "txt" | "json";
const NAVY = "0B2545", TEAL = "00897B", GOLD = "E0A100", INK = "1F2933", MUTED = "5B6770", BAND = "EEF3F8";
const hex = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number];

type Logo = { name: string; data: string; w: number; h: number };
const LOGO_SOURCES: [string, string][] = [
  ["Amehnities", amehnitiesLogo], ["Federal Ministry of Health", fmohLogo], ["CBM", cbmLogo],
  ["ECWA", ecwaLogo], ["ACG", acgLogo], ["Bloomberg Eye", bloombergLogo],
];
async function loadLogos(): Promise<Logo[]> {
  const out = await Promise.all(LOGO_SOURCES.map(async ([name, src]) => {
    try {
      const img = new Image(); img.src = src; await img.decode();
      const k = Math.min(1, 220 / img.naturalHeight);
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      return { name, data: c.toDataURL("image/png"), w: c.width, h: c.height };
    } catch { return null; }
  }));
  return out.filter(Boolean) as Logo[];
}

const fileBase = (s: LbrApiSpec) => `Amehnities_LBR_API_Integration_Spec_${s.generatedAt.slice(0, 10)}`;
const fmtDate = (iso: string) => new Date(iso).toUTCString().replace(" GMT", " UTC");

function fieldRows(fields: LbrApiSpec["coreFields"]) {
  return fields.map((f) => [f.key, f.label, f.type, f.required ? "Yes" : "No", f.options?.slice(0, 12).join(", ") || "—"]);
}

/** Section list shared by every rich format. */
export function specSections(s: LbrApiSpec) {
  return [
    { n: "1", title: "Purpose and scope", paras: s.overview },
    { n: "2", title: "Connection models", table: { head: ["Model", "Typical system", "How to connect"], rows: s.connectionModes.map((m) => [m.mode, m.use, m.how]) } },
    { n: "3", title: "Authentication", paras: [`Header: ${s.auth.header}`, `Key format: ${s.auth.keyFormat}`], bullets: s.auth.rules },
    { n: "4", title: "Scopes and component-level access", table: { head: ["Scope", "Grants"], rows: s.scopes.map((x) => [x.scope, x.grants]) }, bullets: s.componentAccess },
    { n: "5", title: "REST API endpoints", paras: [`Base URL: ${s.baseUrl}`, "All responses are JSON. Timestamps are ISO 8601 UTC. Pagination is keyset based: repeat the request with cursor=next_cursor until next_cursor is null."],
      table: { head: ["Method", "Path", "Scope", "Description"], rows: s.endpoints.map((e) => [e.method, e.path, e.scope, e.summary]) } },
    ...s.endpoints.map((e, i) => ({ n: `5.${i + 1}`, title: `${e.method} ${e.path}`, paras: [e.summary, `Required scope: ${e.scope}`, `Response: ${e.returns}`],
      table: e.params.length ? { head: ["Parameter", "In", "Type", "Required", "Description"], rows: e.params.map((p) => [p.name, p.in, p.type, p.required ? "Yes" : "No", p.description]) } : undefined,
      code: e.example })),
    { n: "6", title: "Programme components", paras: [`Module: ${s.moduleName}. Select components through component_key.`],
      table: { head: ["component_key", "Component", "Services"], rows: s.components.map((c) => [c.key, c.label, c.services.join("; ") || "—"]) } },
    { n: "7", title: "Data dictionary — beneficiary record", table: { head: ["Field", "Description", "Type", "Always present", "Allowed values"], rows: fieldRows(s.coreFields) } },
    { n: "7.1", title: "Profile fields (beneficiary.profile)", table: { head: ["Key", "Label", "Type", "Required", "Allowed values"], rows: fieldRows(s.profileFields) } },
    { n: "7.2", title: "Service record", table: { head: ["Field", "Description", "Type", "Always present", "Allowed values"], rows: fieldRows(s.serviceFields) } },
    { n: "7.3", title: "Component-specific service fields (service.data)", table: { head: ["Key", "Label", "Type", "Required", "Component"], rows: s.components.flatMap((c) => c.extraFields.map((f) => [f.key, f.label, f.type, f.required ? "Yes" : "No", c.key])) } },
    { n: "8", title: "Webhooks", paras: [`Amehnities sends HTTPS POST requests to the endpoint you register. Delivery service: ${s.webhookOrigin}/functions/v1/webhook-dispatch.`],
      table: { head: ["Header", "Meaning"], rows: s.webhook.headers.map((h) => [h.name, h.description]) }, code: s.webhook.envelope },
    { n: "8.1", title: "Webhook event catalogue", table: { head: ["Event", "When", "Payload fields"], rows: s.webhook.events.map((e) => [e.id, e.summary, Object.entries(e.payload).map(([k, v]) => `${k}: ${v}`).join(", ")]) } },
    { n: "8.2", title: "Signature verification", bullets: s.webhook.verification,
      code: `// Node.js\nconst crypto = require("crypto");\nconst expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");\nconst ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-amehnities-signature"]));` },
    { n: "8.3", title: "Delivery and retries", bullets: s.webhook.retries },
    { n: "9", title: "Errors", table: { head: ["HTTP", "Meaning", "Action"], rows: s.errors.map((e) => [String(e.status), e.meaning, e.action]) } },
    { n: "10", title: "Onboarding checklist", bullets: s.checklist },
  ] as { n: string; title: string; paras?: string[]; bullets?: string[]; table?: { head: string[]; rows: string[][] }; code?: string }[];
}

export function specToText(s: LbrApiSpec): string {
  const L: string[] = ["AMEHNITIES", s.title, s.subtitle, `Document ${s.documentId} · v${s.version} · ${fmtDate(s.generatedAt)}`, `Project: ${s.projectName} · Module: ${s.moduleName}`, s.classification, "=".repeat(78)];
  for (const sec of specSections(s)) {
    L.push("", `${sec.n}. ${sec.title.toUpperCase()}`, "-".repeat(78));
    sec.paras?.forEach((p) => L.push(p));
    sec.bullets?.forEach((b) => L.push(`  - ${b}`));
    if (sec.table) { L.push(sec.table.head.join(" | ")); sec.table.rows.forEach((r) => L.push(r.join(" | "))); }
    if (sec.code) L.push("", ...sec.code.split("\n").map((c) => `    ${c}`));
  }
  L.push("", ...s.contacts);
  return L.join("\n");
}

async function toPdf(s: LbrApiSpec, logos: Logo[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16;
  // Cover
  doc.setFillColor(...hex(NAVY)); doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...hex(TEAL)); doc.rect(0, 0, 8, H, "F");
  doc.setFillColor(...hex(GOLD)); doc.rect(8, 0, 2, H, "F");
  doc.setFillColor(255, 255, 255); doc.roundedRect(M + 4, 24, W - 2 * M - 4, 40, 3, 3, "F");
  let x = M + 10; const lh = 22;
  const slot = (W - 2 * M - 16) / Math.max(logos.length, 1);
  logos.forEach((l) => { const w = Math.min(slot - 4, (l.w / l.h) * lh); doc.addImage(l.data, "PNG", x + (slot - w) / 2 - 2, 33, w, (w * l.h) / l.w > lh ? lh : (w * l.h) / l.w); x += slot; });
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("TECHNICAL INTEGRATION SPECIFICATION", M + 4, 92);
  doc.setFontSize(26); doc.text(doc.splitTextToSize("Longitudinal Beneficiary Records", W - 2 * M), M + 4, 108);
  doc.setFontSize(18); doc.setTextColor(...hex("9FD8D2")); doc.text("API & Webhook Integration Guide", M + 4, 122);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(220, 228, 236);
  doc.text(doc.splitTextToSize(s.subtitle, W - 2 * M), M + 4, 134);
  const meta = [["Document ID", s.documentId], ["Version", s.version], ["Issued", fmtDate(s.generatedAt)], ["Project", s.projectName], ["Module", s.moduleName], ["Classification", s.classification]];
  meta.forEach(([k, v], i) => { doc.setTextColor(...hex("9FD8D2")); doc.text(k.toUpperCase(), M + 4, 190 + i * 9); doc.setTextColor(255, 255, 255); doc.text(String(v), M + 48, 190 + i * 9); });
  doc.setFontSize(9); doc.setTextColor(180, 192, 204); doc.text("Amehnities · HANDS Nigeria Decision Support Platform · www.amehnities.org", M + 4, H - 14);

  // Body
  doc.addPage(); let y = 26;
  const ensure = (need: number) => { if (y + need > H - 20) { doc.addPage(); y = 26; } };
  for (const sec of specSections(s)) {
    const top = !sec.n.includes(".");
    ensure(top ? 22 : 16);
    if (top) { doc.setFillColor(...hex(TEAL)); doc.rect(M, y - 5, 3, 8, "F"); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(top ? 14 : 11.5); doc.setTextColor(...hex(NAVY));
    doc.text(`${sec.n}  ${sec.title}`, M + (top ? 6 : 0), y); y += top ? 8 : 6.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...hex(INK));
    for (const p of sec.paras || []) { const t = doc.splitTextToSize(p, W - 2 * M); ensure(t.length * 4.6); doc.text(t, M, y); y += t.length * 4.6 + 1.5; }
    for (const b of sec.bullets || []) { const t = doc.splitTextToSize(b, W - 2 * M - 6); ensure(t.length * 4.6); doc.setFillColor(...hex(GOLD)); doc.circle(M + 1.5, y - 1.3, 0.9, "F"); doc.text(t, M + 5, y); y += t.length * 4.6 + 1; }
    if (sec.table && sec.table.rows.length) {
      autoTable(doc, { startY: y + 1, head: [sec.table.head], body: sec.table.rows, margin: { left: M, right: M, top: 24, bottom: 18 },
        styles: { fontSize: 8, cellPadding: 1.8, textColor: hex(INK), lineColor: hex("D5DEE7"), lineWidth: 0.15, overflow: "linebreak" },
        headStyles: { fillColor: hex(NAVY), textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: hex(BAND) },
        columnStyles: { 0: { fontStyle: "bold", textColor: hex(NAVY) } } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    }
    if (sec.code) {
      doc.setFont("courier", "normal"); doc.setFontSize(7.8);
      const t = sec.code.split("\n").flatMap((l) => doc.splitTextToSize(l, W - 2 * M - 8));
      const h = t.length * 3.6 + 5; ensure(h);
      doc.setFillColor(...hex("0F1B2D")); doc.roundedRect(M, y - 1, W - 2 * M, h, 1.5, 1.5, "F");
      doc.setTextColor(...hex("C9F2EC")); doc.text(t, M + 4, y + 3.5); y += h + 4;
      doc.setFont("helvetica", "normal");
    }
    y += 3;
  }
  const n = doc.getNumberOfPages(); const small = logos[0];
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...hex(NAVY)); doc.rect(0, 0, W, 14, "F"); doc.setFillColor(...hex(TEAL)); doc.rect(0, 14, W, 1, "F");
    if (small) doc.addImage(small.data, "PNG", M, 3, (8 * small.w) / small.h, 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
    doc.text("LBR API & Webhook Integration Specification", W - M, 9, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...hex(MUTED));
    doc.text(`${s.documentId} · v${s.version} · ${s.classification}`, M, H - 8);
    doc.text(`Page ${i - 1} of ${n - 1}`, W - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}

async function toDocx(s: LbrApiSpec, logos: Logo[]): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer, AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle, PageNumber, PageBreak, LevelFormat } = d;
  const CW = 9026;
  const bytes = (u: string) => Uint8Array.from(atob(u.split(",")[1]), (c) => c.charCodeAt(0));
  const img = (l: Logo, h: number) => new ImageRun({ type: "png", data: bytes(l.data), transformation: { width: Math.round((h * l.w) / l.h), height: h }, altText: { title: l.name, description: `${l.name} logo`, name: l.name } });
  const border = { style: BorderStyle.SINGLE, size: 2, color: "D5DEE7" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const table = (head: string[], rows: string[][]) => {
    const w = Math.floor(CW / head.length); const widths = head.map((_, i) => (i === head.length - 1 ? CW - w * (head.length - 1) : w));
    const cell = (t: string, i: number, h: boolean, band: boolean) => new TableCell({ borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: h ? NAVY : band ? BAND : "FFFFFF", type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: h || i === 0, color: h ? "FFFFFF" : i === 0 ? NAVY : INK, size: 17, font: h ? "Arial" : i === 0 ? "Consolas" : "Arial" })] })] });
    return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths,
      rows: [new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true, false)) }), ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => cell(t, i, false, ri % 2 === 1)) }))] });
  };
  const body: InstanceType<typeof Paragraph | typeof Table>[] = [];
  for (const sec of specSections(s)) {
    const top = !sec.n.includes(".");
    body.push(new Paragraph({ heading: top ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun(`${sec.n}  ${sec.title}`)] }));
    sec.paras?.forEach((p) => body.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun(p)] })));
    sec.bullets?.forEach((b) => body.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun(b)] })));
    if (sec.table?.rows.length) { body.push(table(sec.table.head, sec.table.rows)); body.push(new Paragraph({ children: [] })); }
    if (sec.code) sec.code.split("\n").forEach((l) => body.push(new Paragraph({ shading: { fill: "0F1B2D", type: ShadingType.CLEAR }, children: [new TextRun({ text: l || " ", font: "Consolas", size: 16, color: "C9F2EC" })] })));
  }
  const cover = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 400 }, children: logos.flatMap((l, i) => [img(l, 48), new TextRun(i < logos.length - 1 ? "    " : "")]) }),
    new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: "TECHNICAL INTEGRATION SPECIFICATION", bold: true, color: TEAL, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: "Longitudinal Beneficiary Records", bold: true, color: NAVY, size: 56 })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "API & Webhook Integration Guide", color: TEAL, size: 36 })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } }, spacing: { after: 400 }, children: [new TextRun({ text: s.subtitle, color: MUTED, size: 24 })] }),
    table(["Item", "Detail"], [["Document ID", s.documentId], ["Version", s.version], ["Issued", fmtDate(s.generatedAt)], ["Project", s.projectName], ["Module", s.moduleName], ["Classification", s.classification]]),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const doc = new Document({
    creator: "Amehnities", title: s.title,
    styles: { default: { document: { run: { font: "Arial", size: 20, color: INK } } }, paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: NAVY, font: "Arial" }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0, border: { left: { style: BorderStyle.SINGLE, size: 24, color: TEAL, space: 8 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: TEAL, font: "Arial" }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
    ] },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1100, left: 1440, right: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 4 } }, children: [...(logos[0] ? [img(logos[0], 22)] : []), new TextRun({ text: "   LBR API & Webhook Integration Specification", bold: true, color: NAVY, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `${s.documentId} · v${s.version} · ${s.classification} · Page `, color: MUTED, size: 15 }), new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 15 })] })] }) },
      children: [...cover, ...body],
    }],
  });
  return Packer.toBlob(doc);
}

async function toPptx(s: LbrApiSpec, logos: Logo[]): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const p = new PptxGenJS(); p.layout = "LAYOUT_WIDE"; p.title = s.title; p.company = "Amehnities";
  const W = 13.33;
  const brand = (sl: ReturnType<typeof p.addSlide>, title: string, n: string) => {
    sl.background = { color: "FFFFFF" };
    sl.addShape("rect", { x: 0, y: 0, w: W, h: 0.9, fill: { color: NAVY } });
    sl.addShape("rect", { x: 0, y: 0.9, w: W, h: 0.06, fill: { color: TEAL } });
    sl.addText(`${n}`, { x: 0.45, y: 0.17, w: 0.9, h: 0.56, fontSize: 20, bold: true, color: GOLD, fontFace: "Georgia" });
    sl.addText(title, { x: 1.2, y: 0.17, w: 9.6, h: 0.56, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Georgia" });
    if (logos[0]) sl.addImage({ data: logos[0].data, x: W - 1.6, y: 0.16, w: (0.58 * logos[0].w) / logos[0].h, h: 0.58 });
    sl.addText(`${s.documentId} · ${s.classification}`, { x: 0.45, y: 7.08, w: 9, h: 0.3, fontSize: 10, color: MUTED });
  };
  const cover = p.addSlide(); cover.background = { color: NAVY };
  cover.addShape("rect", { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: TEAL } });
  cover.addShape("roundRect", { x: 0.7, y: 0.5, w: W - 1.4, h: 1.3, fill: { color: "FFFFFF" }, rectRadius: 0.1 });
  const slot = (W - 1.8) / Math.max(logos.length, 1);
  logos.forEach((l, i) => { const h = 0.85, w = Math.min(slot - 0.3, (h * l.w) / l.h); cover.addImage({ data: l.data, x: 0.9 + i * slot + (slot - w) / 2, y: 0.72, w, h: (w * l.h) / l.w }); });
  cover.addText("TECHNICAL INTEGRATION SPECIFICATION", { x: 0.7, y: 2.4, w: 11, h: 0.4, fontSize: 16, bold: true, color: "9FD8D2" });
  cover.addText("Longitudinal Beneficiary Records", { x: 0.7, y: 2.9, w: 12, h: 0.9, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Georgia" });
  cover.addText("API & Webhook Integration Guide", { x: 0.7, y: 3.8, w: 12, h: 0.6, fontSize: 26, color: GOLD, fontFace: "Georgia" });
  cover.addText(`${s.projectName} · ${s.moduleName}\nIssued ${fmtDate(s.generatedAt)} · v${s.version}\n${s.classification}`, { x: 0.7, y: 5.2, w: 12, h: 1.3, fontSize: 16, color: "DCE4EC" });
  for (const sec of specSections(s)) {
    if (sec.table && sec.table.rows.length > 9) {
      for (let i = 0; i < sec.table.rows.length; i += 9) {
        const sl = p.addSlide(); brand(sl, `${sec.title}${i ? " (cont.)" : ""}`, sec.n);
        sl.addTable([sec.table.head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } })), ...sec.table.rows.slice(i, i + 9).map((r, ri) => r.map((t) => ({ text: t.slice(0, 220), options: { fill: { color: ri % 2 ? BAND : "FFFFFF" } } })))],
          { x: 0.45, y: 1.2, w: W - 0.9, fontSize: 11, color: INK, border: { type: "solid", pt: 0.5, color: "D5DEE7" }, valign: "middle", autoPage: false });
      }
      continue;
    }
    const sl = p.addSlide(); brand(sl, sec.title, sec.n);
    let y = 1.2;
    const lines = [...(sec.paras || []).map((t) => ({ text: t, options: { breakLine: true } })), ...(sec.bullets || []).map((t) => ({ text: t, options: { bullet: { code: "25A0" }, breakLine: true } }))];
    if (lines.length) { const h = Math.min(2.6, 0.42 * lines.length + 0.3); sl.addText(lines, { x: 0.45, y, w: W - 0.9, h, fontSize: lines.length > 5 ? 14 : 17, color: INK, valign: "top", paraSpaceAfter: 4 }); y += h + 0.15; }
    if (sec.table?.rows.length) {
      sl.addTable([sec.table.head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } })), ...sec.table.rows.map((r, ri) => r.map((t) => ({ text: t.slice(0, 260), options: { fill: { color: ri % 2 ? BAND : "FFFFFF" } } })))],
        { x: 0.45, y, w: W - 0.9, fontSize: 11, color: INK, border: { type: "solid", pt: 0.5, color: "D5DEE7" }, autoPage: false }); y += 0.4 * (sec.table.rows.length + 1);
    }
    if (sec.code && y < 6.2) sl.addText(sec.code, { x: 0.45, y: Math.max(y, 1.2), w: W - 0.9, h: Math.min(6.9 - y, 0.28 * sec.code.split("\n").length + 0.3), fontFace: "Consolas", fontSize: 11, color: "C9F2EC", fill: { color: "0F1B2D" }, valign: "top" });
  }
  return (await p.write({ outputType: "blob" })) as Blob;
}

export async function buildSpecFile(s: LbrApiSpec, format: SpecFormat): Promise<{ blob: Blob; filename: string }> {
  const base = fileBase(s);
  if (format === "json") return { blob: new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }), filename: `${base}.json` };
  if (format === "txt") return { blob: new Blob([specToText(s)], { type: "text/plain;charset=utf-8" }), filename: `${base}.txt` };
  const logos = await loadLogos();
  if (format === "pdf") return { blob: await toPdf(s, logos), filename: `${base}.pdf` };
  if (format === "docx") return { blob: await toDocx(s, logos), filename: `${base}.docx` };
  return { blob: await toPptx(s, logos), filename: `${base}.pptx` };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
