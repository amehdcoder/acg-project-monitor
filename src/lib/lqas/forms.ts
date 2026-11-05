// Paper forms (PDF) and KoboCollect XLSForm for LQAS field teams.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { decisionRule, EU_LEVELS, type EuLevel, type EuPlan } from "./lqas";

const WHO_BLUE: [number, number, number] = [0, 114, 188];
const WHO_DARK: [number, number, number] = [0, 59, 105];
const AMBER: [number, number, number] = [230, 145, 30];
const RED: [number, number, number] = [196, 40, 40];
const GREEN: [number, number, number] = [30, 140, 80];

export interface FormContext { projectName: string; level: EuLevel; target: number; sample: number; indicator: string }

function header(doc: jsPDF, title: string, subtitle: string, ctx: FormContext, color = WHO_BLUE) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...color); doc.rect(0, 0, w, 22, "F");
  doc.setFillColor(...WHO_DARK); doc.rect(0, 22, w, 2, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(title, 10, 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`${ctx.projectName} · ${subtitle}`, 10, 17);
  doc.text(`LQAS · n=${ctx.sample} · target ${Math.round(ctx.target * 100)}% · d=${decisionRule(ctx.sample, ctx.target)}`, w - 10, 10, { align: "right" });
  doc.setTextColor(30, 30, 30);
}

function footer(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setFontSize(7); doc.setTextColor(110, 110, 110);
    doc.text("Lot Quality Assurance Sampling — WHO/ESPEN-aligned field tool · Enter in KoboCollect after collection", 10, h - 6);
    doc.text(`Page ${i} of ${n}`, w - 10, h - 6, { align: "right" });
  }
}

function idBlock(doc: jsPDF, eu: EuPlan, ctx: FormContext, y: number) {
  const levelLabel = EU_LEVELS.find((l) => l.id === ctx.level)?.label ?? ctx.level;
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: WHO_DARK },
    head: [["Evaluation Unit", "Level", "State", "LGA", "Team no.", "Date", "Supervisor"]],
    body: [[eu.name, levelLabel, eu.state, eu.lga, "", "____/____/______", ""]],
  });
  return (doc as any).lastAutoTable.finalY + 4;
}

/** Household tally sheet (one per EU) — 19 sampling points, one respondent each. */
function tallySheet(doc: jsPDF, eu: EuPlan, ctx: FormContext, secure: boolean) {
  header(doc, secure ? "LQAS Household Tally Sheet — Security-Restricted Area" : "LQAS Household Tally Sheet", eu.key, ctx, secure ? RED : WHO_BLUE);
  let y = idBlock(doc, eu, ctx, 28);
  doc.setFontSize(8.5);
  doc.text(`Indicator: ${ctx.indicator}. Select a random household at each sampling point; ask about ONE eligible person. Tick Y if covered, N if not.`, 10, y, { maxWidth: 190 });
  y += 8;
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 7 },
    headStyles: { fillColor: secure ? RED : WHO_BLUE },
    head: [["#", "Ward", "Community (sampling point)", "Respondent age", "Sex M/F", "Received? Y / N", "Reason if N (code)"]],
    body: eu.sample.map((s) => [s.slot, s.ward, s.community + (s.insecure ? "  (!)" : ""), "", "", "Y  /  N", ""]),
    didParseCell: (d) => { if (d.section === "body" && eu.sample[d.row.index]?.insecure) d.cell.styles.fillColor = [253, 236, 234]; },
  });
  y = (doc as any).lastAutoTable.finalY + 4;
  const d = decisionRule(ctx.sample, ctx.target);
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 9, cellPadding: 2 },
    head: [["Total Y (covered)", "Decision rule (d)", "Decision", "Reason codes"]],
    headStyles: { fillColor: WHO_DARK },
    body: [["", String(d), `PASS if Y ≥ ${d}   ·   MOP-UP if Y < ${d}`, "1 Absent · 2 Refused · 3 Not aware · 4 Side-effects fear · 5 Ineligible/sick · 6 Not visited · 7 Other"]],
  });
  if (secure) {
    y = (doc as any).lastAutoTable.finalY + 4;
    doc.setFillColor(253, 236, 234); doc.rect(10, y, 190, 22, "F");
    doc.setFontSize(8); doc.setTextColor(...RED); doc.setFont("helvetica", "bold");
    doc.text("SECURITY PROTOCOL", 12, y + 5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
    doc.text([
      "Do not record names, phone numbers or GPS. Keep this sheet folded and out of sight while moving.",
      "If a sampling point marked (!) is inaccessible, replace it with the nearest accessible community in the same ward and note it below.",
      "Collect only in daylight with local escort/community leader clearance. Abort if the situation changes.",
    ], 12, y + 10);
  }
}

function replacementLog(doc: jsPDF, eu: EuPlan, ctx: FormContext) {
  header(doc, "Sampling Point Replacement & Access Log", eu.key, ctx, AMBER);
  const y = idBlock(doc, eu, ctx, 28);
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 8.5, minCellHeight: 9 }, headStyles: { fillColor: AMBER },
    head: [["Slot #", "Planned community", "Reason not reached", "Replacement community", "Same ward? Y/N", "Approved by"]],
    body: eu.sample.filter((s) => s.insecure).concat(Array.from({ length: 4 }, () => ({ slot: 0, community: "", ward: "", flhf: "", insecure: false })))
      .map((s) => [s.slot || "", s.community, "", "", "", ""]),
  });
}

function summarySheet(doc: jsPDF, plans: EuPlan[], ctx: FormContext) {
  header(doc, "LQAS Supervisor Summary & Decision Sheet", `${plans.length} Evaluation Units`, ctx, GREEN);
  const d = decisionRule(ctx.sample, ctx.target);
  autoTable(doc, {
    startY: 28, theme: "grid", styles: { fontSize: 8, minCellHeight: 7 }, headStyles: { fillColor: GREEN },
    head: [["Evaluation Unit", "LGA", "Communities", "Population", "Sampled", "Covered (Y)", `Pass (≥${d})`, "Mop-up?", "Security"]],
    body: plans.map((p) => [p.name, p.lga, p.communities, p.population.toLocaleString(), ctx.sample, "", "", "", p.securityMode ? "Restricted" : "Cleared"]),
    didParseCell: (c) => { if (c.section === "body" && c.column.index === 8 && plans[c.row.index]?.securityMode) c.cell.styles.textColor = RED; },
  });
}

export function buildPaperPack(plans: EuPlan[], ctx: FormContext, opts: { securityOnly?: boolean } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const list = opts.securityOnly ? plans.filter((p) => p.securityMode) : plans;
  summarySheet(doc, list, ctx);
  for (const eu of list) {
    doc.addPage(); tallySheet(doc, eu, ctx, opts.securityOnly || eu.securityMode);
    if (eu.securityMode) { doc.addPage(); replacementLog(doc, eu, ctx); }
  }
  footer(doc);
  return doc.output("blob");
}

/** KoboCollect form for transcribing paper tally sheets. Submissions reach the
 * app through the existing Kobo webhook (form id contains "lqas"). */
export function buildLqasXlsForm(ctx: FormContext) {
  const H = ["type", "name", "label", "required", "constraint", "constraint_message", "relevant", "calculation", "choice_filter", "appearance"];
  const row = (o: Record<string, string>) => H.map((h) => o[h] ?? "");
  const survey = [H,
    row({ type: "start", name: "start" }), row({ type: "end", name: "end" }),
    row({ type: "select_one level", name: "eu_level", label: "Evaluation Unit level", required: "yes" }),
    row({ type: "text", name: "eu_name", label: "Evaluation Unit name (as printed on the paper form)", required: "yes" }),
    row({ type: "text", name: "state", label: "State", required: "yes" }),
    row({ type: "text", name: "lga", label: "LGA", required: "yes" }),
    row({ type: "text", name: "ward", label: "Ward" }),
    row({ type: "text", name: "flhf_name", label: "Health facility (FLHF)" }),
    row({ type: "text", name: "community_name", label: "Community" }),
    row({ type: "text", name: "team", label: "Team number", required: "yes" }),
    row({ type: "date", name: "collection_date", label: "Date on paper form", required: "yes" }),
    row({ type: "select_one yn", name: "security_mode", label: "Collected under security-restricted protocol?", required: "yes" }),
    row({ type: "begin_repeat", name: "lqas_respondents", label: "Respondent (copy each row of the tally sheet)", appearance: "field-list" }),
    row({ type: "integer", name: "slot", label: "Slot #", constraint: `. >= 1 and . <= ${ctx.sample}` }),
    row({ type: "select_one yn", name: "received", label: ctx.indicator, required: "yes" }),
    row({ type: "select_one reason", name: "reason", label: "Reason not covered", relevant: "${received} = 'no'" }),
    row({ type: "end_repeat", name: "lqas_respondents" }),
    row({ type: "calculate", name: "sampled", calculation: "count(${lqas_respondents})" }),
    row({ type: "calculate", name: "covered", calculation: "count-selected(${received})" }),
    row({ type: "note", name: "check", label: `Sampled: \${sampled}. Expected ${ctx.sample}.` }),
  ];
  const choices: string[][] = [["list_name", "name", "label", "level"]];
  EU_LEVELS.forEach((l) => choices.push(["level", l.id, l.label, ""]));
  choices.push(["yn", "yes", "Yes", ""], ["yn", "no", "No", ""]);
  ["Absent", "Refused", "Not aware", "Fear of side-effects", "Ineligible/sick", "Not visited", "Other"].forEach((r, i) => choices.push(["reason", String(i + 1), r, ""]));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = ctx.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(survey), "survey");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(choices), "choices");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["form_title", "form_id", "version"], [`${ctx.projectName} — LQAS Entry`, `${slug}_lqas_${stamp}`, stamp]]), "settings");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
