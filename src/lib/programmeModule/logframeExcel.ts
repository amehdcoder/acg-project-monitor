// WHO-style Excel template for the Programme Report: exports the full editable
// logframe (project details, objectives, results, indicators, activities,
// baselines, targets, disaggregations) plus the current period's values, and
// parses a filled template back into a logframe + report drafts.

import ExcelJS from "exceljs";
import { resultLevel, type AutoKey, type LogframeObjective, type ProjectLogframe, type LogframeDisaggregation } from "./logframe";
import { parseDisaggCell, serializeDisaggCell } from "./disaggregationCatalog";

export interface ReportDraftLike {
  value: string;
  disaggregation: Record<string, string>;
  risk: string;
  overTargetComment: string;
}

export interface ReportSheetState {
  period: string;
  reportYear: string;
  notes: string;
  drafts: Record<string, ReportDraftLike>;
}

const FONT = "Arial";
const WHO_BLUE = "FF009ADE";
const NAVY = "FF0B2E59";
const WHITE = "FFFFFFFF";
const TONE_FILL: Record<string, { band: string; soft: string }> = {
  blue: { band: "FF1F5FA8", soft: "FFE6F0FA" },
  teal: { band: "FF0F7E7A", soft: "FFE3F4F2" },
  amber: { band: "FFB86E00", soft: "FFFDF1DE" },
};
const KIND_FILL: Record<string, string> = { Impact: "FFEAF7EE", Outcome: "FFEAF7EE", Output: "FFF1F5FB", Result: "FFF1F5FB", Activity: "FFFFFBEA" };

export const COLUMNS = [
  { key: "type", header: "Level", width: 12 },
  { key: "objKey", header: "Objective ID", width: 11 },
  { key: "objTitle", header: "Specific Objective", width: 20 },
  { key: "objStatement", header: "Objective narrative", width: 44 },
  { key: "tone", header: "Colour", width: 9 },
  { key: "resKey", header: "Result ID", width: 14 },
  { key: "resTitle", header: "Result area", width: 40 },
  { key: "code", header: "Code", width: 14 },
  { key: "activity", header: "Activity", width: 36 },
  { key: "indicator", header: "Indicator", width: 48 },
  { key: "mov", header: "Means of verification", width: 30 },
  { key: "baseline", header: "Baseline", width: 16 },
  { key: "y1", header: "Year 1 target", width: 11 },
  { key: "y2", header: "Year 2 target", width: 11 },
  { key: "y3", header: "Year 3 target", width: 11 },
  { key: "y4", header: "Year 4 target", width: 11 },
  { key: "total", header: "Total target", width: 11 },
  { key: "disagg", header: "Disaggregations (separate with ;)", width: 28 },
  { key: "percent", header: "Percentage? (Yes/No)", width: 12 },
  { key: "auto", header: "Auto-source (do not edit)", width: 16 },
  { key: "value", header: "Value this period", width: 13 },
  { key: "disaggValues", header: "Disaggregated values (Dimension: Option=Value, …; one dimension per line)", width: 44 },
  { key: "risk", header: "Risks / challenges", width: 32 },
  { key: "over", header: "Over-target explanation", width: 32 },
  { key: "objColor", header: "Objective hex colour", width: 18 },
  { key: "resColor", header: "Result hex colour", width: 18 },
  { key: "indColor", header: "Indicator hex colour", width: 18 },
  { key: "resStatement", header: "Result statement", width: 40 },
  { key: "assumptions", header: "Assumptions", width: 40 },
  { key: "config", header: "Disaggregation options (JSON)", width: 48 },
  { key: "resLevel", header: "Result level", width: 14 },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

const border = { style: "thin" as const, color: { argb: "FFBFC9D6" } };
const allBorders = { top: border, left: border, bottom: border, right: border };

export const formatDisaggValues = (d: Record<string, string> | undefined): string =>
  Object.entries(d || {})
    .map(([dim, cell]) => {
      const parts = Object.entries(parseDisaggCell(cell)).map(([k, v]) => `${k}=${v}`);
      return parts.length ? `${dim}: ${parts.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("\n");

export const parseDisaggValues = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n|\s*\|\s*/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const dim = line.slice(0, idx).trim();
    const map: Record<string, number> = {};
    for (const pair of line.slice(idx + 1).split(",")) {
      const eq = pair.lastIndexOf("=");
      if (eq < 0) continue;
      const k = pair.slice(0, eq).trim();
      const n = Number(pair.slice(eq + 1).replace(/,/g, "").trim());
      if (k && Number.isFinite(n)) map[k] = n;
    }
    if (dim && Object.keys(map).length) out[dim] = serializeDisaggCell(map);
  }
  return out;
};

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
};

export async function buildLogframeWorkbook(lf: ProjectLogframe, state: ReportSheetState): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  // ---------- Cover ----------
  const cover = wb.addWorksheet("Cover", { views: [{ showGridLines: false }], properties: { tabColor: { argb: WHO_BLUE } } });
  cover.columns = [{ width: 4 }, { width: 30 }, { width: 90 }];
  cover.mergeCells("B2:C2");
  const t = cover.getCell("B2");
  t.value = "PROGRAMME PERFORMANCE REPORT";
  t.font = { name: FONT, size: 20, bold: true, color: { argb: WHITE } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
  t.alignment = { vertical: "middle", indent: 1 };
  cover.getRow(2).height = 40;
  cover.mergeCells("B3:C3");
  const st = cover.getCell("B3");
  st.value = "Logical framework, targets and period results — standard reporting template";
  st.font = { name: FONT, size: 11, italic: true, color: { argb: WHITE } };
  st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  st.alignment = { indent: 1, vertical: "middle" };
  cover.getRow(3).height = 22;

  const meta: [string, string][] = [
    ["Project ID", lf.project.id],
    ["Project title", lf.project.name],
    ["Country", lf.project.country],
    ["Impact statement", lf.project.impact],
    ["Reporting period", state.period],
    ["Programme year", state.reportYear],
    ["Narrative notes", state.notes],
  ];
  meta.forEach(([k, v], i) => {
    const r = cover.getRow(5 + i);
    r.getCell(2).value = k;
    r.getCell(3).value = v;
    r.getCell(2).font = { name: FONT, bold: true, color: { argb: NAVY } };
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4FB" } };
    r.getCell(3).font = { name: FONT, color: { argb: "FF0000FF" } };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    r.getCell(2).border = allBorders;
    r.getCell(3).border = allBorders;
    r.height = k === "Impact statement" || k === "Narrative notes" ? 48 : 20;
  });
  const legendStart = 5 + meta.length + 2;
  cover.getCell(`B${legendStart}`).value = "Objectives";
  cover.getCell(`B${legendStart}`).font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
  lf.objectives.forEach((o, i) => {
    const r = cover.getRow(legendStart + 1 + i);
    const tone = TONE_FILL[o.tone] || TONE_FILL.blue;
    r.getCell(2).value = o.title;
    r.getCell(2).font = { name: FONT, bold: true, color: { argb: WHITE } };
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone.band } };
    r.getCell(3).value = o.statement;
    r.getCell(3).font = { name: FONT };
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone.soft } };
    r.getCell(3).alignment = { wrapText: true };
    r.height = 32;
  });
  const note = legendStart + lf.objectives.length + 3;
  cover.mergeCells(`B${note}:C${note}`);
  cover.getCell(`B${note}`).value = `Generated ${new Date().toLocaleString()} · Blue text = editable entries. Edit any cell on the Cover and Logframe sheets, then upload the file in the Programme Report to replace or update the form.`;
  cover.getCell(`B${note}`).font = { name: FONT, size: 9, italic: true, color: { argb: "FF5B6B7F" } };
  cover.getCell(`B${note}`).alignment = { wrapText: true };
  cover.getRow(note).height = 30;

  // ---------- Logframe ----------
  const ws = wb.addWorksheet("Logframe", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3 }],
    properties: { tabColor: { argb: "FF0F7E7A" } },
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "3:3" },
    headerFooter: { oddFooter: `&L${lf.project.id} Programme Report&CPage &P of &N&R${state.period}` },
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const h1 = ws.getCell(1, 1);
  h1.value = `${lf.project.id} — ${lf.project.name}`;
  h1.font = { name: FONT, size: 14, bold: true, color: { argb: WHITE } };
  h1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
  h1.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  // Section bands over the header
  const bands: [number, number, string, string][] = [
    [1, 7, "RESULTS CHAIN", NAVY],
    [8, 11, "INDICATOR DEFINITION", "FF1F5FA8"],
    [12, 17, "BASELINE & TARGETS", "FF0F7E7A"],
    [18, 20, "DISAGGREGATION SETTINGS", "FF6A4C93"],
    [21, 24, "PERIOD RESULTS", "FFB86E00"],
  ];
  for (const [a, b, label, color] of bands) {
    ws.mergeCells(2, a, 2, b);
    const c = ws.getCell(2, a);
    c.value = label;
    c.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  const header = ws.getRow(3);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEEF9" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.border = allBorders;
  });
  header.height = 42;

  const add = (row: Partial<Record<ColKey, string | number>>, tone: string, kind: string) => {
    const r = ws.addRow(row);
    r.eachCell({ includeEmpty: true }, (cell, n) => {
      if (n > COLUMNS.length) return;
      cell.font = { name: FONT, size: 9, color: { argb: n >= 21 ? "FF0000FF" : "FF1F2937" } };
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = allBorders;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n <= 4 ? (TONE_FILL[tone] || TONE_FILL.blue).soft : n >= 21 ? "FFFFF8E6" : KIND_FILL[kind] } };
    });
    r.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: NAVY } };
    r.getCell(8).font = { name: "Consolas", size: 9, bold: true, color: { argb: NAVY } };
  };

  for (const obj of lf.objectives) {
    for (const res of obj.results) {
      const base = { objKey: obj.key, objTitle: obj.title, objStatement: obj.statement, tone: obj.tone, resKey: res.key, resTitle: res.title, objColor: obj.color ?? "", resColor: res.color ?? "", resStatement: res.statement ?? "", assumptions: res.assumptions ?? "", resLevel: resultLevel(res) };
      const level = resultLevel(res);
      const kind = level[0].toUpperCase() + level.slice(1);
      const items = [
        ...res.indicators.map((ind) => ({ ...ind, kind, activity: "", indicator: ind.title })),
        ...res.activities.map((a) => ({ ...a, kind: "Activity", activity: a.title, baseline: "" })),
      ];
      if (!items.length) add({ ...base, type: kind }, obj.tone, kind);
      for (const it of items) {
        const d = state.drafts[it.code];
        add({
          ...base, type: it.kind, code: it.code, activity: it.activity, indicator: it.indicator,
          indColor: it.color ?? "", config: it.disaggregationConfig ? JSON.stringify(it.disaggregationConfig) : "",
          mov: it.mov || "", baseline: it.baseline || "",
          y1: it.targets[0] ?? "", y2: it.targets[1] ?? "", y3: it.targets[2] ?? "", y4: it.targets[3] ?? "",
          total: it.totalTarget || "", disagg: (it.disaggregation || []).join("; "),
          percent: it.isPercent ? "Yes" : "No", auto: it.autoKey || "",
          value: d?.value ?? "", disaggValues: formatDisaggValues(d?.disaggregation), risk: d?.risk || "", over: d?.overTargetComment || "",
        }, obj.tone, it.kind);
      }
    }
  }
  const last = ws.rowCount;
  for (let r = 4; r <= Math.max(last + 200, 300); r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, formulae: ['"Impact,Outcome,Output,Result,Activity"'] };
    ws.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: ['"blue,teal,amber"'] };
    ws.getCell(r, 19).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'] };
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNS.length } };

  // ---------- Instructions ----------
  const help = wb.addWorksheet("Instructions", { views: [{ showGridLines: false }], properties: { tabColor: { argb: "FFB86E00" } } });
  help.columns = [{ width: 4 }, { width: 110 }];
  const lines = [
    "HOW TO USE THIS TEMPLATE",
    "1. Cover sheet: edit the project title, impact statement, reporting period, programme year and narrative notes in the blue cells. The Objectives block is editable too — change a Specific Objective's title or narrative in its coloured row.",
    "2. Logframe sheet: one row per indicator or activity. Every column can be edited — objective narratives, result areas, codes, indicator names, baselines, yearly and total targets.",
    "3. Rows with the same Objective ID belong to one Specific Objective; rows with the same Result ID belong to one result area. Add a row to add an indicator; delete a row to remove it.",
    "4. Level: Impact, Outcome, Output or Activity. Legacy Result rows remain supported. For Activity rows, put the activity name in 'Activity' and its indicator in 'Indicator'.",
    "5. Disaggregations: list dimension names separated by semicolons, e.g. Sex; NTD age band; State; LGA; Ward.",
    "6. Disaggregated values: one dimension per line, e.g. Sex: Male=12, Female=9. Values in each dimension should add up to 'Value this period'.",
    "7. Do not edit the 'Auto-source' column — it links indicators to automatic counts from beneficiary records.",
    "8. Upload in the Programme Report → Import Logframe. Choose 'Replace' to overwrite everything, or 'Update' to keep current entries and only apply filled values.",
  ];
  lines.forEach((l, i) => {
    const c = help.getCell(2 + i, 2);
    c.value = l;
    c.font = i === 0 ? { name: FONT, size: 14, bold: true, color: { argb: WHITE } } : { name: FONT, size: 10 };
    if (i === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
    c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
    help.getRow(2 + i).height = i === 0 ? 30 : 30;
  });

  return wb;
}

export async function exportLogframeExcel(lf: ProjectLogframe, state: ReportSheetState) {
  const wb = await buildLogframeWorkbook(lf, state);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(lf.project.id || "Programme").replace(/[^\w]+/g, "_")}_Programme_Report_${state.period.replace(/[^\w]+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export interface ParsedTemplate {
  logframe: ProjectLogframe;
  state: ReportSheetState;
}

export async function parseLogframeWorkbook(data: ArrayBuffer): Promise<ParsedTemplate> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const cover = wb.getWorksheet("Cover");
  const ws = wb.getWorksheet("Logframe");
  if (!ws) throw new Error("This file has no 'Logframe' sheet. Please use the exported Programme Report template.");

  const meta: Record<string, string> = {};
  cover?.eachRow((row) => {
    const k = cellText(row.getCell(2).value);
    if (k) meta[k.toLowerCase()] = cellText(row.getCell(3).value);
  });

  // The Cover "Objectives" block is editable: title in column B, narrative in
  // column C, one row per Specific Objective in logframe order.
  const coverObjectives: { title: string; statement: string }[] = [];
  if (cover) {
    let inLegend = false;
    cover.eachRow((row) => {
      const k = cellText(row.getCell(2).value);
      const v = cellText(row.getCell(3).value);
      if (!inLegend) { if (k.toLowerCase() === "objectives") inLegend = true; return; }
      if (!k && !v) { inLegend = false; return; }
      if (k.toLowerCase().startsWith("generated ")) { inLegend = false; return; }
      coverObjectives.push({ title: k, statement: v });
    });
  }

  // Locate header row by "Code" column.
  let headerRow = 3;
  for (let r = 1; r <= 6; r++) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map((v) => cellText(v));
    if (vals.includes("Code") && vals.includes("Indicator")) { headerRow = r; break; }
  }
  const colIdx = new Map<ColKey, number>();
  ws.getRow(headerRow).eachCell((cell, n) => {
    const col = COLUMNS.find((c) => c.header.toLowerCase() === cellText(cell.value).toLowerCase());
    if (col) colIdx.set(col.key, n);
  });
  if (!colIdx.has("code") || !colIdx.has("indicator")) throw new Error("The Logframe sheet headers were changed. Please keep the original column headings.");

  const objectives: LogframeObjective[] = [];
  const drafts: Record<string, ReportDraftLike> = {};
  const errors: string[] = [];
  const seen = new Set<string>();
  let lastObj: LogframeObjective | null = null;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (k: ColKey) => { const i = colIdx.get(k); return i ? cellText(row.getCell(i).value) : ""; };
    const code = g("code");
    const objTitle = g("objTitle");
    const objKeyRaw = g("objKey") || (objTitle ? objTitle.toLowerCase().replace(/[^a-z0-9]+/g, "") : lastObj?.key || "");
    if (!code && !objKeyRaw && !g("indicator")) continue;
    let obj = objectives.find((o) => o.key === objKeyRaw);
    if (!obj) {
      const tone = (["blue", "teal", "amber"].includes(g("tone")) ? g("tone") : (["blue", "teal", "amber"] as const)[objectives.length % 3]) as LogframeObjective["tone"];
      obj = { key: objKeyRaw || `so${objectives.length + 1}`, title: objTitle || `Specific Objective ${objectives.length + 1}`, statement: g("objStatement"), tone, color: g("objColor") || undefined, results: [] };
      objectives.push(obj);
    }
    lastObj = obj;
    const type = g("type").toLowerCase();
    const resKey = g("resKey") || `${obj.key}-${type === "outcome" ? "outcome" : "r1"}`;
    let res = obj.results.find((x) => x.key === resKey);
    if (!res) { res = { key: resKey, title: g("resTitle") || resKey, level: type === "impact" ? "impact" : type === "outcome" ? "outcome" : type === "output" || type === "result" ? "output" : undefined, color: g("resColor") || undefined, statement: g("resStatement") || undefined, assumptions: g("assumptions") || undefined, indicators: [], activities: [] }; obj.results.push(res); }
    if (type === "impact" || type === "outcome" || type === "output") res.level = type;
    if (["impact", "outcome", "output"].includes(g("resLevel"))) res.level = g("resLevel") as "impact" | "outcome" | "output";
    if (!code) continue;
    if (seen.has(code)) { errors.push(`Row ${r}: duplicate code ${code} skipped`); continue; }
    seen.add(code);
    const targets = [g("y1"), g("y2"), g("y3"), g("y4")].map((v) => v || null);
    const disaggregation = g("disagg").split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    const isPercent = /^y/i.test(g("percent"));
    const autoKey = (g("auto") || undefined) as AutoKey | undefined;
    let disaggregationConfig: LogframeDisaggregation[] | undefined;
    if (g("config")) {
      const parsed: unknown = JSON.parse(g("config"));
      if (!Array.isArray(parsed) || parsed.some(d => !d || typeof d.label !== "string" || !["options", "location"].includes(d.kind) || (d.options && (!Array.isArray(d.options) || d.options.some((o: unknown) => typeof o !== "string"))))) throw new Error(`Row ${r}: invalid disaggregation options`);
      disaggregationConfig = parsed;
    }
    const common = { code, mov: g("mov") || undefined, targets, totalTarget: g("total") || undefined, disaggregation: disaggregation.length ? disaggregation : undefined, autoKey, isPercent: isPercent || undefined, color: g("indColor") || undefined, disaggregationConfig };
    if (type === "activity") res.activities.push({ ...common, title: g("activity") || g("indicator"), indicator: g("indicator") });
    else res.indicators.push({ ...common, title: g("indicator"), baseline: g("baseline") || undefined });

    const value = g("value"), dv = g("disaggValues"), risk = g("risk"), over = g("over");
    if (value || dv || risk || over) drafts[code] = { value: value.replace(/,/g, ""), disaggregation: parseDisaggValues(dv), risk, overTargetComment: over };
  }
  if (!objectives.length) throw new Error("No objectives or indicators were found in the Logframe sheet.");
  void errors;

  // Apply edited objective titles/narratives from the Cover sheet.
  coverObjectives.forEach((co, i) => {
    if (!objectives[i]) return;
    if (co.title) objectives[i].title = co.title;
    if (co.statement) objectives[i].statement = co.statement;
  });

  return {
    logframe: {
      project: {
        id: meta["project id"] || "",
        name: meta["project title"] || "",
        country: meta["country"] || "",
        impact: meta["impact statement"] || "",
      },
      objectives,
    },
    state: {
      period: meta["reporting period"] || "",
      reportYear: /^[1-4]$/.test(meta["programme year"] || "") ? meta["programme year"] : "",
      notes: meta["narrative notes"] || "",
      drafts,
    },
  };
}
