// Renders the LBR integration specification into PDF, Word, PowerPoint, TXT and JSON.
import type { LbrApiSpec } from "./lbrApiSpec";
import type { SchemaEntity, SchemaProp } from "./lbrApiSchema";
import amehnitiesLogo from "@/assets/logo-amehnities.png";
import fmohLogo from "@/assets/logo-fmoh.png";
import cbmLogo from "@/assets/cbm-logo.png";
import ecwaLogo from "@/assets/ecwa-logo.png";
import acgLogo from "@/assets/acg-logo.png";

export type SpecFormat = "pdf" | "docx" | "pptx" | "txt" | "json";
const NAVY = "0B2545", TEAL = "00897B", GOLD = "E0A100", INK = "1F2933", MUTED = "5B6770", BAND = "EEF3F8";
const hex = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number];

type Logo = { name: string; data: string; w: number; h: number };
const LOGO_SOURCES: [string, string][] = [
  ["Amehnities", amehnitiesLogo], ["Federal Ministry of Health", fmohLogo], ["CBM", cbmLogo],
  ["ECWA", ecwaLogo], ["ACG", acgLogo],
];
let logoCache: Promise<Logo[]> | null = null;
export function loadLogos(): Promise<Logo[]> { return (logoCache ??= loadLogosNow()); }
async function loadLogosNow(): Promise<Logo[]> {
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

const fileBase = (s: LbrApiSpec) => `Amehnities_LBR_API_Integration_Spec_${s.selection.mode === "all" ? "All_Components" : s.selection.componentKeys.join("_").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}_${s.generatedAt.slice(0, 10)}`;
const scopeText = (s: LbrApiSpec) => s.selection.mode === "all" ? "All components" : s.selection.labels.join(", ");
const fmtDate = (iso: string) => new Date(iso).toUTCString().replace(" GMT", " UTC");

export const typeText = (p: SchemaProp) => `${p.type}${p.format ? ` <${p.format}>` : ""}${p.enum?.length && p.type !== "array" ? " (enum)" : p.type === "array" ? "[]" : ""}`;

function fieldRows(fields: LbrApiSpec["coreFields"]) {
  return fields.map((f) => [f.key, f.label, f.type, f.required ? "Yes" : "No", f.options?.join(", ") || "—"]);
}

/** Section list shared by every rich format. */
export function specSections(s: LbrApiSpec) {
  return [
    { n: "1", title: "Purpose and scope", paras: s.overview },
    { n: "1.1", title: "Endpoints for this selection", paras: [`Components: ${scopeText(s)}`], table: { head: ["Purpose", "Method", "URL"], rows: s.endpointsForSelection.map((e) => [e.purpose, e.method, e.url]) } },
    { n: "2", title: "Connection models", table: { head: ["Model", "Typical system", "How to connect"], rows: s.connectionModes.map((m) => [m.mode, m.use, m.how]) } },
    { n: "3", title: "Authentication", paras: [`Header: ${s.auth.header}`, `Key format: ${s.auth.keyFormat}`], bullets: s.auth.rules },
    { n: "4", title: "Scopes and component-level access", table: { head: ["Scope", "Grants"], rows: s.scopes.map((x) => [x.scope, x.grants]) }, bullets: s.componentAccess },
    { n: "5", title: "REST API endpoints", paras: [`Base URL: ${s.baseUrl}`, "GET requests pull data from Amehnities; POST requests push data into Amehnities (JSON body, Content-Type: application/json). All responses are JSON. Timestamps are ISO 8601 UTC. Pagination is keyset based: repeat the request with cursor=next_cursor until next_cursor is null."],
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
    { n: "7.4", title: "Data schema — entity model", paras: [`Standard: ${s.schema.standard}.`, "Each card is one object exchanged with Amehnities. A filled marker and bold name indicate a required field; types follow JSON Schema."], entities: s.schema.entities,
      table: { head: ["From", "To", "Cardinality", "Join / embedding"], rows: s.schema.relations.map((r) => [r.from, r.to, r.cardinality, r.via]) } },
    ...s.schema.entities.map((e, i) => ({ n: `7.4.${i + 1}`, title: `Schema: ${e.title}`, paras: [e.description],
      table: { head: ["Property", "Type", "Required", "Description", "Allowed values"], rows: e.props.length ? e.props.map((p) => [p.name, typeText(p), p.required ? "Yes" : "No", p.description, p.enum?.join(", ") || "—"]) : [["—", "object", "No", "No additional fields configured", "—"]] } })),
    { n: "7.5", title: "JSON Schema (Draft 2020-12)", paras: [`Canonical machine-readable schema for this selection. Validate payloads before POSTing; $id: ${String(s.schema.jsonSchema.$id)}.`], code: JSON.stringify(s.schema.jsonSchema, null, 2) },
    { n: "8", title: "Webhooks", paras: [`Amehnities sends HTTPS POST requests to the endpoint you register. Delivery service: ${s.webhookOrigin}/functions/v1/webhook-dispatch.`, ...(s.selection.mode === "all" ? [] : [`For this selection, subscribe to service.recorded and keep only events whose component_key is ${s.selection.componentKeys.join(", ")}.`])],
      table: { head: ["Header", "Meaning"], rows: s.webhook.headers.map((h) => [h.name, h.description]) }, code: s.webhook.envelope },
    { n: "8.1", title: "Webhook event catalogue", table: { head: ["Event", "When", "Payload fields"], rows: s.webhook.events.map((e) => [e.id, e.summary, Object.entries(e.payload).map(([k, v]) => `${k}: ${v}`).join(", ")]) } },
    { n: "8.2", title: "Signature verification", bullets: s.webhook.verification,
      code: `// Node.js\nconst crypto = require("crypto");\nconst expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");\nconst ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-amehnities-signature"]));` },
    { n: "8.3", title: "Delivery and retries", bullets: s.webhook.retries },
    { n: "9", title: "Errors", table: { head: ["HTTP", "Meaning", "Action"], rows: s.errors.map((e) => [String(e.status), e.meaning, e.action]) } },
    { n: "10", title: "Onboarding checklist", bullets: s.checklist },
  ] as { n: string; title: string; paras?: string[]; bullets?: string[]; table?: { head: string[]; rows: string[][] }; code?: string; entities?: SchemaEntity[] }[];
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
  doc.setFillColor(255, 255, 255); doc.roundedRect(M + 4, 20, W - 2 * M - 4, 52, 3, 3, "F");
  const [lead, ...partners] = logos;
  if (lead) { const h = 20, w = Math.min(70, (lead.w / lead.h) * h); doc.addImage(lead.data, "PNG", (W - w) / 2 + 2, 25, w, (w * lead.h) / lead.w); }
  doc.setDrawColor(...hex("D5DEE7")); doc.setLineWidth(0.3); doc.line(M + 14, 49, W - M - 10, 49);
  if (partners.length) { const ph = 14, slot = (W - 2 * M - 24) / partners.length; partners.forEach((l, i) => { const w = Math.min(slot - 8, (l.w / l.h) * ph); const h = (w * l.h) / l.w; doc.addImage(l.data, "PNG", M + 14 + i * slot + (slot - w) / 2, 53 + (ph - h) / 2, w, h); }); }
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("TECHNICAL INTEGRATION SPECIFICATION", M + 4, 92);
  doc.setFontSize(26); doc.text(doc.splitTextToSize("Longitudinal Beneficiary Records", W - 2 * M), M + 4, 108);
  doc.setFontSize(18); doc.setTextColor(...hex("9FD8D2")); doc.text("API & Webhook Integration Guide", M + 4, 122);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(220, 228, 236);
  doc.text(doc.splitTextToSize(s.subtitle, W - 2 * M), M + 4, 134);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...hex("F5C84B")); doc.text(doc.splitTextToSize(`Components covered: ${scopeText(s)}`, W - 2 * M - 4), M + 4, 146); doc.setFont("helvetica", "normal");
  const meta = [["Document ID", s.documentId], ["Version", s.version], ["Issued", fmtDate(s.generatedAt)], ["Project", s.projectName], ["Module", s.moduleName], ["Classification", s.classification]];
  let my = 186; meta.forEach(([k, v]) => { const t = doc.splitTextToSize(String(v), W - M - 52 - M); doc.setTextColor(...hex("9FD8D2")); doc.text(k.toUpperCase(), M + 4, my); doc.setTextColor(255, 255, 255); doc.text(t, M + 48, my); my += Math.max(1, t.length) * 5 + 4; });
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
    if (sec.entities?.length) {
      const ACC = { navy: NAVY, teal: TEAL, gold: GOLD } as const;
      const gap = 5, cw = (W - 2 * M - gap) / 2, rh = 4.4, MAXR = 9;
      for (let i = 0; i < sec.entities.length; i += 2) {
        const pair = sec.entities.slice(i, i + 2);
        const rows = (e: SchemaEntity) => Math.min(e.props.length, MAXR) + (e.props.length > MAXR ? 1 : 0) || 1;
        const ch = 15 + Math.max(...pair.map(rows)) * rh + 3;
        ensure(ch + 4);
        pair.forEach((e, j) => {
          const x = M + j * (cw + gap), acc = hex(ACC[e.accent]);
          doc.setFillColor(...hex("E3E9F0")); doc.roundedRect(x + 0.8, y + 0.8, cw, ch, 2, 2, "F");
          doc.setFillColor(255, 255, 255); doc.setDrawColor(...acc); doc.setLineWidth(0.4); doc.roundedRect(x, y, cw, ch, 2, 2, "FD");
          doc.setFillColor(...acc); doc.roundedRect(x, y, cw, 9, 2, 2, "F"); doc.rect(x, y + 5, cw, 4, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(e.accent === "gold" ? 20 : 255, e.accent === "gold" ? 30 : 255, e.accent === "gold" ? 50 : 255);
          doc.text(doc.splitTextToSize(e.title, cw - 6)[0], x + 3, y + 6);
          doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(...hex(MUTED));
          doc.text(doc.splitTextToSize(e.description, cw - 6)[0], x + 3, y + 13);
          let ry = y + 17.5;
          const list = e.props.slice(0, MAXR);
          if (!list.length) { doc.setFont("helvetica", "normal"); doc.text("No additional fields configured", x + 3, ry); }
          list.forEach((p, k) => {
            if (k % 2) { doc.setFillColor(...hex(BAND)); doc.rect(x + 0.5, ry - 3.1, cw - 1, rh, "F"); }
            doc.setFont("courier", "bold"); doc.setFontSize(7.2); doc.setTextColor(...hex(p.required ? NAVY : INK));
            doc.setDrawColor(...acc); doc.setFillColor(...(p.required ? acc : hex("FFFFFF"))); doc.circle(x + 3.6, ry - 1.1, 0.9, "FD");
            doc.text(p.name.slice(0, 30), x + 6, ry);
            doc.setFont("courier", "normal"); doc.setTextColor(...hex(TEAL)); doc.text(typeText(p).slice(0, 22), x + cw - 3, ry, { align: "right" });
            ry += rh;
          });
          if (e.props.length > MAXR) { doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(...hex(MUTED)); doc.text(`+ ${e.props.length - MAXR} more — see full table below`, x + 3, ry); }
        });
        y += ch + 5;
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...hex(INK));
    }
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
      for (let i = 0; i < t.length;) {
        ensure(12); const fit = Math.max(1, Math.floor((H - 20 - y - 5) / 3.6)); const chunk = t.slice(i, i + fit); i += chunk.length;
        const h = chunk.length * 3.6 + 5;
        doc.setFillColor(...hex("0F1B2D")); doc.roundedRect(M, y - 1, W - 2 * M, h, 1.5, 1.5, "F");
        doc.setTextColor(...hex("C9F2EC")); doc.text(chunk, M + 4, y + 3.5); y += h + 4;
      }
      doc.setFont("helvetica", "normal");
    }
    y += 3;
  }
  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...hex(NAVY)); doc.rect(0, 0, W, 14, "F"); doc.setFillColor(...hex(TEAL)); doc.rect(0, 14, W, 1, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
    doc.text("AMEHNITIES", M, 9);
    doc.text("LBR API & Webhook Integration Specification", W - M, 9, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...hex(MUTED));
    doc.text(`${s.documentId} · v${s.version} · ${scopeText(s)}`.slice(0, 110), M, H - 8);
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
    const weights = head.map((h) => /description|how|url|payload|grants|action|services|label|purpose|detail|allowed/i.test(h) ? 2.2 : /method|in$|required|http|always/i.test(h) ? 0.7 : 1);
    const tot = weights.reduce((a, b) => a + b, 0); const widths = weights.map((x) => Math.floor((CW * x) / tot)); widths[widths.length - 1] += CW - widths.reduce((a, b) => a + b, 0);
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
    ...(logos[0] ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 200 }, children: [img(logos[0], 70)] })] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D5DEE7", space: 8 } }, spacing: { after: 300 }, children: logos.slice(1).flatMap((l, i, a) => [img(l, 40), new TextRun(i < a.length - 1 ? "        " : "")]) }),
    new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: "TECHNICAL INTEGRATION SPECIFICATION", bold: true, color: TEAL, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: "Longitudinal Beneficiary Records", bold: true, color: NAVY, size: 56 })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "API & Webhook Integration Guide", color: TEAL, size: 36 })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } }, spacing: { after: 400 }, children: [new TextRun({ text: s.subtitle, color: MUTED, size: 24 })] }),
    table(["Item", "Detail"], [["Document ID", s.documentId], ["Version", s.version], ["Issued", fmtDate(s.generatedAt)], ["Project", s.projectName], ["Module", s.moduleName], ["Components covered", scopeText(s)], ["Classification", s.classification]]),
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
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 4 } }, children: [new TextRun({ text: "AMEHNITIES  ", bold: true, color: TEAL, size: 16 }), new TextRun({ text: "LBR API & Webhook Integration Specification", bold: true, color: NAVY, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `${s.documentId} · v${s.version} · Page `, color: MUTED, size: 15 }), new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 15 })] })] }) },
      children: [...cover, ...body],
    }],
  });
  return Packer.toBlob(doc);
}

async function toPptx(s: LbrApiSpec, logos: Logo[]): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const p = new PptxGenJS(); p.layout = "LAYOUT_WIDE"; p.title = s.title; p.company = "Amehnities";
  const W = 13.33, X = 0.45, CWI = W - 0.9, TOP = 1.2, BOTTOM = 6.9;
  const brand = (title: string, n: string) => {
    const sl = p.addSlide(); sl.background = { color: "FFFFFF" };
    sl.addShape("rect", { x: 0, y: 0, w: W, h: 0.9, fill: { color: NAVY } });
    sl.addShape("rect", { x: 0, y: 0.9, w: W, h: 0.06, fill: { color: TEAL } });
    sl.addText(n, { x: X, y: 0.17, w: 0.9, h: 0.56, fontSize: 20, bold: true, color: GOLD, fontFace: "Georgia" });
    sl.addText(title, { x: 1.3, y: 0.12, w: 9.4, h: 0.66, fontSize: title.length > 48 ? 17 : 22, bold: true, color: "FFFFFF", fontFace: "Georgia", fit: "shrink", valign: "middle" });
    sl.addText("AMEHNITIES", { x: W - 2.4, y: 0.25, w: 2, h: 0.4, fontSize: 12, bold: true, color: "9FD8D2", align: "right" });
    sl.addText(`${s.documentId} · ${scopeText(s)}`.slice(0, 120), { x: X, y: 7.08, w: 11, h: 0.3, fontSize: 10, color: MUTED });
    return sl;
  };
  // Estimate wrapped lines: ~ chars per inch at given font size.
  const lines = (t: string, wIn: number, pt: number) => t.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil((l.length * pt * 0.0075) / wIn)), 0);
  const cover = p.addSlide(); cover.background = { color: NAVY };
  cover.addShape("rect", { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: TEAL } });
  cover.addShape("roundRect", { x: 0.7, y: 0.4, w: W - 1.4, h: 1.9, fill: { color: "FFFFFF" }, rectRadius: 0.1 });
  const [lead, ...partners] = logos;
  if (lead) { const h = 0.9, w = Math.min(3.2, (h * lead.w) / lead.h); cover.addImage({ data: lead.data, x: (W - w) / 2, y: 0.5, w, h: (w * lead.h) / lead.w }); }
  cover.addShape("line", { x: 1.5, y: 1.5, w: W - 3, h: 0, line: { color: "D5DEE7", width: 0.75 } });
  const slot = (W - 3) / Math.max(partners.length, 1);
  partners.forEach((l, i) => { const h = 0.6, w = Math.min(slot - 0.4, (h * l.w) / l.h); const hh = (w * l.h) / l.w; cover.addImage({ data: l.data, x: 1.5 + i * slot + (slot - w) / 2, y: 1.6 + (h - hh) / 2, w, h: hh }); });
  cover.addText("TECHNICAL INTEGRATION SPECIFICATION", { x: 0.7, y: 2.6, w: 11, h: 0.4, fontSize: 16, bold: true, color: "9FD8D2" });
  cover.addText("Longitudinal Beneficiary Records", { x: 0.7, y: 3.0, w: 12, h: 0.9, fontSize: 42, bold: true, color: "FFFFFF", fontFace: "Georgia" });
  cover.addText("API & Webhook Integration Guide", { x: 0.7, y: 3.9, w: 12, h: 0.6, fontSize: 24, color: GOLD, fontFace: "Georgia" });
  cover.addText(`Components covered: ${scopeText(s)}\n${s.projectName} · ${s.moduleName}\nIssued ${fmtDate(s.generatedAt)} · v${s.version}`, { x: 0.7, y: 4.8, w: 12, h: 1.9, fontSize: 15, color: "DCE4EC", valign: "top", fit: "shrink" });

  for (const sec of specSections(s)) {
    let sl = brand(sec.title, sec.n); let y = TOP;
    const items = [...(sec.paras || []).map((t) => ({ t, bullet: false })), ...(sec.bullets || []).map((t) => ({ t, bullet: true }))];
    for (const it of items) {
      const pt = 14, h = lines(it.t, CWI - 0.4, pt) * 0.27 + 0.12;
      if (y + h > BOTTOM) { sl = brand(`${sec.title} (cont.)`, sec.n); y = TOP; }
      sl.addText(it.t, { x: X, y, w: CWI, h, fontSize: pt, color: INK, valign: "top", bullet: it.bullet ? { code: "25A0" } : undefined, margin: 2 });
      y += h + 0.04;
    }
    if (sec.table?.rows.length) {
      const head = sec.table.head; const weights = head.map((h) => /description|how|url|payload|grants|action|services|label|purpose|allowed/i.test(h) ? 2.4 : /method|in$|required|http|always/i.test(h) ? 0.7 : 1);
      const tot = weights.reduce((a, b) => a + b, 0); const colW = weights.map((x) => (CWI * x) / tot);
      const pt = 10; const rowH = (r: string[]) => Math.max(...r.map((t, i) => lines(t, colW[i] - 0.12, pt))) * 0.2 + 0.14;
      const headRow = head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } }));
      let chunk: string[][] = []; let cy = y + 0.36;
      const flush = () => { if (!chunk.length) return; sl.addTable([headRow, ...chunk.map((r, ri) => r.map((t) => ({ text: t, options: { fill: { color: ri % 2 ? BAND : "FFFFFF" } } })))], { x: X, y, w: CWI, colW, fontSize: pt, color: INK, border: { type: "solid", pt: 0.5, color: "D5DEE7" }, valign: "top", margin: 0.05 }); chunk = []; };
      for (const r of sec.table.rows) {
        const h = rowH(r);
        if (cy + h > BOTTOM && chunk.length) { flush(); sl = brand(`${sec.title} (cont.)`, sec.n); y = TOP; cy = y + 0.36; }
        chunk.push(r); cy += h;
      }
      flush(); y = cy + 0.15;
    }
    if (sec.code) {
      const codeLines = sec.code.split("\n").flatMap((l) => { const per = Math.floor(CWI / (10 * 0.0085)); const out: string[] = []; for (let i = 0; i < Math.max(l.length, 1); i += per) out.push(l.slice(i, i + per)); return out; });
      let i = 0;
      while (i < codeLines.length) {
        if (BOTTOM - y < 0.8) { sl = brand(`${sec.title} (cont.)`, sec.n); y = TOP; }
        const fit = Math.max(1, Math.floor((BOTTOM - y - 0.2) / 0.19)); const part = codeLines.slice(i, i + fit); i += part.length;
        const h = part.length * 0.19 + 0.2;
        sl.addText(part.join("\n"), { x: X, y, w: CWI, h, fontFace: "Consolas", fontSize: 10, color: "C9F2EC", fill: { color: "0F1B2D" }, valign: "top", margin: 6 });
        y += h + 0.1;
      }
    }
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
