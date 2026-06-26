// Beautifully-formatted, one-click Excel export for the MDA Adaptive Insights
// Dashboard. Computes the same metrics the dashboard renders (overview KPIs +
// per-field insights) and writes them into a styled, analysis-ready workbook.
//
// Mirrors the app's export visual language: navy title banner, coloured header
// band, frozen headers, zebra striping and auto-filter — so the metrics are
// presentation-ready the moment they are downloaded.

import ExcelJS from "exceljs";

const NAVY = "FF0C2340";
const INDIGO = "FF6366F1";
const CYAN = "FF06B6D4";
const WHITE = "FFFFFFFF";
const ZEBRA = "FFF1F5F9";

interface QOption { label: string; value: string; }
interface FormQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: QOption[];
  questions?: FormQuestion[];
}
export interface DashSubmission {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  submitter?: string | null;
  submittedAt?: string | null;
  status?: string | null;
  data?: Record<string, any>;
}

const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const POSITIVE = new Set(["yes", "true", "1", "available", "present", "good", "done", "complete", "compliant", "adequate", "trained", "passed"]);
const NEGATIVE = new Set(["no", "false", "0", "none", "absent", "missing", "n/a", "na", "poor", "incomplete", "not done", "fail", "failed"]);
const NUMERIC = new Set(["number", "integer", "decimal", "calculate", "range"]);
const CHOICE = new Set(["select_one", "select_multiple", "rank", "acknowledge"]);
const MEDIA = new Set(["image", "audio", "video", "file", "signature", "geopoint", "geotrace", "geoshape"]);

const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const keyFor = (q: FormQuestion) => q.name || q.id;
const optLabel = (q: FormQuestion, val: string) =>
  stripTags(q.options?.find((o) => o.value === val || o.label === val)?.label) || val;

interface Section { label: string; questions: FormQuestion[]; }
function buildSections(questions: FormQuestion[]): Section[] {
  const sections: Section[] = [];
  const loose: FormQuestion[] = [];
  let idx = 0;
  for (const item of questions || []) {
    const isGroup = Array.isArray(item.questions) && !item.type;
    if (isGroup) {
      sections.push({ label: stripTags(item.label) || `Section ${++idx}`, questions: (item.questions || []).filter((q) => q && q.type) });
    } else if (item.type) loose.push(item);
  }
  if (loose.length) sections.unshift({ label: "General", questions: loose });
  return sections.filter((s) => s.questions.length);
}

export interface OverviewMetric { metric: string; value: string | number; }
export interface FieldMetric {
  section: string;
  field: string;
  type: string;
  responses: number;
  responseRate: number; // 0-100
  insight: string;
  topValue: string;
  numericAvg: number | "";
  numericMin: number | "";
  numericMax: number | "";
  numericSum: number | "";
}

export function computeDashboardMetrics(submissions: DashSubmission[], questions: FormQuestion[]) {
  const total = submissions.length;

  // ── Overview KPIs ──
  const supervisors = new Set<string>(), states = new Set<string>(), lgas = new Set<string>(), wards = new Set<string>();
  let finalized = 0;
  for (const s of submissions) {
    if (s.submitter) supervisors.add(String(s.submitter));
    const st = s.state || s.data?.state; if (st) states.add(norm(st));
    const lg = s.lga || s.data?.lga; if (lg) lgas.add(norm(lg));
    const wd = s.ward || s.data?.ward; if (wd) wards.add(`${norm(lg)}|${norm(wd)}`);
    if (["finalized", "sent", "submitted"].includes(norm(s.status))) finalized++;
  }
  const overview: OverviewMetric[] = [
    { metric: "Total Visits", value: total },
    { metric: "Unique Supervisors", value: supervisors.size },
    { metric: "States Covered", value: states.size },
    { metric: "LGAs Covered", value: lgas.size },
    { metric: "Wards Covered", value: wards.size },
    { metric: "Finalized %", value: total ? `${Math.round((finalized / total) * 100)}%` : "0%" },
  ];

  // ── Field metrics ──
  const fields: FieldMetric[] = [];
  for (const section of buildSections(questions)) {
    for (const q of section.questions) {
      const key = keyFor(q);
      const type = (q.type || "").toLowerCase();
      const values = submissions.map((s) => s.data?.[key]).filter((v) => v !== undefined && v !== null && v !== "");
      const answered = values.length;
      const base: FieldMetric = {
        section: section.label,
        field: stripTags(q.label) || key,
        type,
        responses: answered,
        responseRate: total ? Math.round((answered / total) * 100) : 0,
        insight: "",
        topValue: "",
        numericAvg: "", numericMin: "", numericMax: "", numericSum: "",
      };

      if (CHOICE.has(type)) {
        const counts = new Map<string, number>();
        for (const v of values) {
          const arr = Array.isArray(v) ? v : [v];
          for (const item of arr) {
            const lbl = optLabel(q, String(item));
            counts.set(lbl, (counts.get(lbl) || 0) + 1);
          }
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const binary = sorted.length > 0 && sorted.length <= 3 &&
          sorted.every(([n]) => POSITIVE.has(norm(n)) || NEGATIVE.has(norm(n)) || /partial|some|n\/?a/i.test(n));
        if (binary) {
          const pos = sorted.filter(([n]) => POSITIVE.has(norm(n))).reduce((a, [, c]) => a + c, 0);
          const pct = answered ? Math.round((pos / answered) * 100) : 0;
          base.insight = `${pct}% positive / compliant`;
          base.topValue = sorted.map(([n, c]) => `${n}: ${c}`).join(" • ");
        } else if (sorted.length) {
          const [topName, topCount] = sorted[0];
          const pct = answered ? Math.round((topCount / answered) * 100) : 0;
          base.insight = `Top: ${topName} (${pct}%)`;
          base.topValue = sorted.slice(0, 5).map(([n, c]) => `${n}: ${c}`).join(" • ");
        }
      } else if (NUMERIC.has(type)) {
        const nums = values.map(toNum).filter((n): n is number => n !== null);
        if (nums.length) {
          const sum = nums.reduce((a, b) => a + b, 0);
          const avg = sum / nums.length;
          base.numericSum = Math.round(sum * 100) / 100;
          base.numericAvg = Math.round(avg * 100) / 100;
          base.numericMin = Math.min(...nums);
          base.numericMax = Math.max(...nums);
          base.insight = `Avg ${base.numericAvg} • Sum ${base.numericSum}`;
        }
      } else if (MEDIA.has(type)) {
        base.insight = `${answered} of ${total} visits captured`;
      } else {
        base.insight = `${answered} responses recorded`;
      }
      fields.push(base);
    }
  }
  return { overview, fields };
}

function bandRow(ws: ExcelJS.Worksheet, row: number, span: number, text: string, fill: string, size = 11) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, color: { argb: WHITE }, size, name: "Arial" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = size + 12;
}

// ───── Bloomberg-style "Collected Data" sheet ─────
// One row per submission, every checklist field as a column, grouped by section
// with coloured group bands, frozen panes, zebra striping and auto-filter.
const GROUP_TONES = [
  "FF2563EB", "FF0E7490", "FF6D28D9", "FF14B8A6", "FFB45309",
  "FFDB2777", "FF0891B2", "FF7C3AED", "FF059669", "FFC2410C",
];

function cellValue(q: FormQuestion, raw: any): string | number {
  const type = (q.type || "").toLowerCase();
  if (raw === undefined || raw === null || raw === "") return "";
  if (MEDIA.has(type)) {
    if (type === "geopoint" || type === "geotrace" || type === "geoshape") return String(raw);
    return "Captured";
  }
  if (NUMERIC.has(type)) {
    const n = toNum(raw);
    return n === null ? String(raw) : n;
  }
  if (CHOICE.has(type)) {
    const arr = Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/).filter(Boolean);
    if (arr.length > 1 || type === "select_multiple") return arr.map((v) => optLabel(q, String(v))).join("; ");
    return optLabel(q, String(raw));
  }
  return stripTags(String(raw)) || String(raw);
}

function buildCollectedDataSheet(
  wb: ExcelJS.Workbook, submissions: DashSubmission[], questions: FormQuestion[], formName: string, projectName?: string,
) {
  const sections = buildSections(questions);
  type Col = { header: string; width: number; group: string; q?: FormQuestion };
  const cols: Col[] = [
    { header: "#", width: 5, group: "Record" },
    { header: "Status", width: 13, group: "Record" },
    { header: "Supervisor", width: 22, group: "Record" },
    { header: "Date Submitted", width: 18, group: "Record" },
    { header: "State", width: 16, group: "Location" },
    { header: "LGA", width: 16, group: "Location" },
    { header: "Ward", width: 18, group: "Location" },
  ];
  sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      const label = stripTags(q.label) || keyFor(q);
      cols.push({ header: label, width: Math.min(40, Math.max(14, label.length + 2)), group: sec.label, q });
    });
  });

  const groupColor: Record<string, string> = { Record: NAVY, Location: INDIGO };
  sections.forEach((s, i) => { groupColor[s.label] = GROUP_TONES[i % GROUP_TONES.length]; });

  const ws = wb.addWorksheet("Collected Data", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 3, showGridLines: false }],
    properties: { defaultRowHeight: 16 },
  });
  const totalCols = cols.length;

  // Row 1: Title banner
  ws.mergeCells(1, 1, 1, totalCols);
  const title = ws.getCell(1, 1);
  title.value = `${formName}${projectName ? `  •  ${projectName}` : ""}   •   ${submissions.length.toLocaleString()} submissions   •   Generated ${new Date().toLocaleString()}`;
  title.font = { bold: true, size: 13, color: { argb: WHITE }, name: "Arial" };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 28;

  // Row 2: Group band
  let ci = 1;
  while (ci <= totalCols) {
    const g = cols[ci - 1].group;
    let span = 1;
    while (ci + span <= totalCols && cols[ci - 1 + span].group === g) span++;
    if (span > 1) ws.mergeCells(2, ci, 2, ci + span - 1);
    const cell = ws.getCell(2, ci);
    cell.value = g;
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: "Arial" };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: groupColor[g] || NAVY } };
    cell.border = { right: { style: "thin", color: { argb: WHITE } } };
    ci += span;
  }
  ws.getRow(2).height = 20;

  // Row 3: Column headers
  const headerRow = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: NAVY }, name: "Arial" };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = {
      bottom: { style: "medium", color: { argb: groupColor[c.group] || NAVY } },
      right: { style: "hair", color: { argb: "FFCBD5E1" } },
    };
    ws.getColumn(i + 1).width = c.width;
  });
  headerRow.height = 30;

  const STATUS_FILL: Record<string, string> = { finalized: "FFDCFCE7", sent: "FFDCFCE7", submitted: "FFDCFCE7", draft: "FFFEF9C3" };
  const STATUS_FG: Record<string, string> = { finalized: "FF15803D", sent: "FF15803D", submitted: "FF15803D", draft: "FF854D0E" };

  submissions.forEach((s, idx) => {
    const row: any[] = [
      idx + 1,
      s.status ? s.status[0].toUpperCase() + s.status.slice(1) : "—",
      s.submitter || "—",
      s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—",
      s.state || s.data?.state || "—",
      s.lga || s.data?.lga || "—",
      s.ward || s.data?.ward || "—",
    ];
    sections.forEach((sec) => sec.questions.forEach((q) => row.push(cellValue(q, s.data?.[keyFor(q)]))));
    const r = ws.addRow(row);
    r.height = 16;
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF7F9FC";
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isNum = typeof cell.value === "number";
      cell.font = { size: 9, color: { argb: "FF1F2937" }, name: "Arial" };
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 3 ? "left" : isNum ? "center" : "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = { right: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (isNum) cell.numFmt = "#,##0.###";
    });
    const stKey = norm(s.status);
    const statusCell = r.getCell(2);
    if (STATUS_FILL[stKey]) {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[stKey] } };
      statusCell.font = { size: 9, bold: true, color: { argb: STATUS_FG[stKey] }, name: "Arial" };
    }
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };
}

export async function exportMdaDashboard(
  submissions: DashSubmission[],
  questions: FormQuestion[],
  formName: string,
  projectName?: string,
) {
  const { overview, fields } = computeDashboardMetrics(submissions, questions);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  // ───── Collected Data sheet (Bloomberg-style full table — first sheet) ─────
  buildCollectedDataSheet(wb, submissions, questions, formName || "Integrated MDA Supervisory Checklist", projectName);


  // ───── Overview sheet ─────
  const ov = wb.addWorksheet("Overview", { views: [{ showGridLines: false }] });
  ov.columns = [{ width: 38 }, { width: 28 }];
  bandRow(ov, 1, 2, "MDA Supervisory Checklist — Dashboard Metrics", NAVY, 14);
  bandRow(ov, 2, 2, formName + (projectName ? `  •  Project: ${projectName}` : ""), INDIGO, 11);
  bandRow(ov, 3, 2, `Generated ${new Date().toLocaleString()}`, CYAN, 10);
  ov.addRow([]);
  const ovHeadRow = ov.addRow(["Metric", "Value"]);
  ovHeadRow.eachCell((c) => {
    c.font = { bold: true, color: { argb: WHITE }, name: "Arial" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  });
  ovHeadRow.height = 22;
  overview.forEach((m, i) => {
    const r = ov.addRow([m.metric, m.value]);
    r.eachCell((c) => {
      c.font = { name: "Arial" };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      c.alignment = { vertical: "middle", indent: 1 };
    });
    r.getCell(2).font = { bold: true, name: "Arial", color: { argb: INDIGO } };
  });

  // ───── Field metrics sheet ─────
  const fs = wb.addWorksheet("Field Metrics", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }] });
  const headers = ["Section", "Field", "Type", "Responses", "Response Rate", "Key Insight", "Breakdown / Top Values", "Avg", "Min", "Max", "Sum"];
  fs.columns = [
    { width: 22 }, { width: 40 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 30 }, { width: 46 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 },
  ];
  bandRow(fs, 1, headers.length, "Adaptive Field Insights", NAVY, 14);
  bandRow(fs, 2, headers.length, formName + (projectName ? `  •  Project: ${projectName}` : ""), INDIGO, 11);
  bandRow(fs, 3, headers.length, `${fields.length} fields  •  ${submissions.length} submissions`, CYAN, 10);
  fs.addRow([]);
  const headRow = fs.addRow(headers);
  headRow.eachCell((c) => {
    c.font = { bold: true, color: { argb: WHITE }, name: "Arial" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  headRow.height = 26;

  let lastSection = "";
  fields.forEach((f) => {
    if (f.section !== lastSection) {
      lastSection = f.section;
      bandRow(fs, fs.rowCount + 1, headers.length, f.section, INDIGO, 11);
    }
    const r = fs.addRow([
      f.section, f.field, f.type, f.responses, `${f.responseRate}%`,
      f.insight, f.topValue, f.numericAvg, f.numericMin, f.numericMax, f.numericSum,
    ]);
    r.eachCell((c) => {
      c.font = { name: "Arial", size: 10 };
      c.alignment = { vertical: "middle", wrapText: true };
      c.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
    // Response-rate colour pill
    const rr = r.getCell(5);
    const tone = f.responseRate >= 80 ? "FFDCFCE7" : f.responseRate >= 40 ? "FFFEF9C3" : "FFFEE2E2";
    const toneFg = f.responseRate >= 80 ? "FF15803D" : f.responseRate >= 40 ? "FF854D0E" : "FFB91C1C";
    rr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone } };
    rr.font = { name: "Arial", size: 10, bold: true, color: { argb: toneFg } };
    rr.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Auto-filter over the header row of the field table
  fs.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (formName || "MDA-Checklist").replace(/[^a-z0-9]+/gi, "_");
  a.href = url;
  a.download = `${safe}_Dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
