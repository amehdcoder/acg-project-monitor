/**
 * WHO / Nigeria NTD Programme styled workbook for community-level medicine
 * allocation. Colourful, print-ready, with a cover sheet documenting the
 * apportionment method, an LGA/Ward summary and the full community register.
 */
import ExcelJS from "exceljs";
import type { AllocationResult } from "./geoAllocation";
import { explainResidual } from "./allocationRounding";


const WHO_BLUE = "FF0093D5";
const WHO_DARK = "FF002E5D";
const BAND = "FFEAF6FC";
const ACCENT = "FF00A85A";
const WARN = "FFFFF3CD";

const money = "#,##0";
const pct = "0.0%";

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_DARK } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: "Arial", size: 9, italic: true, color: { argb: "FFFFFFFF" } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 20;
}

function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, labels: string[]) {
  const row = ws.getRow(rowIdx);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  row.height = 30;
  ws.views = [{ state: "frozen", ySplit: rowIdx }];
  ws.autoFilter = { from: { row: rowIdx, column: 1 }, to: { row: rowIdx, column: labels.length } };
}

function styleBody(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 9 };
      cell.border = { top: { style: "hair", color: { argb: "FFCCCCCC" } }, bottom: { style: "hair", color: { argb: "FFCCCCCC" } }, left: { style: "hair", color: { argb: "FFCCCCCC" } }, right: { style: "hair", color: { argb: "FFCCCCCC" } } };
      if ((r - firstRow) % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    }
  }
}

export interface AllocationExportMeta {
  scope: string;
  project?: string;
  medicine: string;
  program?: string;
  unit?: string;
  bufferPct: number;
  targetPopBasis: string;
  /** Human description of the rounding rule in force */
  roundingRule?: string;
  /** Reconciliation warnings/errors shown in the UI at export time */
  validation?: { level: "error" | "warn" | "info"; text: string }[];
  /** Geographies archived out of this allocation */
  exclusions?: { level: "LGA" | "Ward"; state: string; lga: string; ward?: string }[];
}



export async function exportCommunityAllocationWorkbook(result: AllocationResult, meta: AllocationExportMeta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — NTD Microplanning";
  wb.created = new Date();

  const stampedOn = new Date().toLocaleString();
  const unit = meta.unit || "Units";
  const subtitle = `${meta.medicine}${meta.program ? ` · ${meta.program}` : ""} · ${unit} · ${meta.scope}${meta.project ? ` · ${meta.project}` : ""} · Generated ${stampedOn}`;

  /* ── Cover ─────────────────────────────────────────────────────────── */
  const cover = wb.addWorksheet("Cover & Method", { properties: { tabColor: { argb: WHO_DARK } } });
  cover.columns = [{ width: 34 }, { width: 78 }];
  titleBlock(cover, "Community Medicine Allocation — NTD Mass Drug Administration", subtitle, 2);
  const facts: [string, string | number][] = [
    ["Medicine / commodity", meta.medicine],
    ["Programme", meta.program || "—"],
    ["Dispensing unit", unit],
    ["Geographic scope", meta.scope],
    ["Target population basis", meta.targetPopBasis],
    ["Apportionment method", "Proportional to target population (largest-remainder integer rounding)"],
    ["Programme standard", "WHO PC-NTD guidance & Nigeria NTD Programme MDA microplanning norms"],
    ["Wastage / contingency buffer", `${(meta.bufferPct * 100).toFixed(1)}%`],

    ["LGAs covered", result.totals.lgas],
    ["Wards covered", result.totals.wards],
    ["Communities / settlements", result.totals.communities],
    ["Total target population", result.totals.targetPop],
    ["Total allocated units", result.totals.allocation],
    ["Buffer units", result.totals.buffer],
    ["Total units to dispatch", result.totals.dispatch],
    ["Generated", stampedOn],
  ];
  let r = 4;
  for (const [k, v] of facts) {
    const a = cover.getCell(r, 1); const b = cover.getCell(r, 2);
    a.value = k; a.font = { name: "Arial", size: 10, bold: true, color: { argb: WHO_DARK } };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    b.value = v as any;
    b.font = { name: "Arial", size: 10 };
    if (typeof v === "number") b.numFmt = money;
    [a, b].forEach((c) => { c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } }; c.alignment = { vertical: "middle", wrapText: true }; });
    cover.getRow(r).height = 20;
    r++;
  }
  r += 1;
  cover.mergeCells(r, 1, r, 2);
  const note = cover.getCell(r, 1);
  note.value =
    "Allocation rule: each community/settlement receives units strictly in proportion to its target population within its ward. " +
    "Where a ward total is entered it takes precedence; the remaining LGA total is apportioned across the wards without an explicit entry. " +
    "Integer rounding uses the largest-remainder method so community totals reconcile exactly with the ward and LGA totals — no over- or under-issue.";
  note.font = { name: "Arial", size: 9, italic: true, color: { argb: WHO_DARK } };
  note.alignment = { wrapText: true, vertical: "top" };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN } };
  cover.getRow(r).height = 58;

  /* ── LGA / Ward summary ────────────────────────────────────────────── */
  const sum = wb.addWorksheet("LGA & Ward Summary", { properties: { tabColor: { argb: ACCENT } }, pageSetup: { orientation: "landscape", fitToPage: true } });
  const sumHead = ["State", "LGA", "Ward", "Communities", "Target population", `Allocated (${unit})`, `Buffer (${unit})`, `To dispatch (${unit})`];
  sum.columns = [{ width: 16 }, { width: 22 }, { width: 24 }, { width: 13 }, { width: 18 }, { width: 16 }, { width: 15 }, { width: 18 }];
  titleBlock(sum, "LGA & Ward Allocation Summary", subtitle, sumHead.length);
  headerRow(sum, 4, sumHead);
  let sr = 5;
  const subtotalRows: number[] = [];
  for (const L of result.tree) {
    for (const w of L.wards) {
      const alloc = result.wardAllocation[w.key] || 0;
      const buffer = Math.round(alloc * meta.bufferPct);
      sum.getRow(sr).values = [L.state, L.lga, w.ward, w.communities, w.targetPop, alloc, buffer, alloc + buffer];
      sr++;
    }
    const lgaBuffer = Math.round(L.allocation * meta.bufferPct);
    sum.getRow(sr).values = [L.state, `${L.lga} — TOTAL`, "", L.communities, L.targetPop, L.allocation, lgaBuffer, L.allocation + lgaBuffer];
    subtotalRows.push(sr);
    sr++;
  }
  styleBody(sum, 5, sr - 1, sumHead.length);
  for (let i = 5; i < sr; i++) {
    const row = sum.getRow(i);
    [4, 5, 6, 7, 8].forEach((c) => { row.getCell(c).numFmt = money; row.getCell(c).alignment = { horizontal: "right" }; });
  }
  for (const i of subtotalRows) {
    const row = sum.getRow(i);
    row.height = 20;
    for (let c = 1; c <= sumHead.length; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF0000FF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7CC" } };
      cell.border = { top: { style: "thin", color: { argb: WHO_DARK } }, bottom: { style: "double", color: { argb: WHO_DARK } }, left: { style: "hair" }, right: { style: "hair" } };
      if (c >= 4) cell.alignment = { horizontal: "right" };
    }
  }

  /* ── Community register ────────────────────────────────────────────── */
  const com = wb.addWorksheet("Community Allocation", { properties: { tabColor: { argb: WHO_BLUE } }, pageSetup: { orientation: "landscape", fitToPage: true } });
  const head = ["S/N", "State", "LGA", "Ward", "Health facility (FLHF)", "Community", "Settlement", "Target population", `Allocated (${unit})`, `Buffer (${(meta.bufferPct * 100).toFixed(0)}%)`, `To dispatch (${unit})`, "Quantity received", "Signature / date"];
  com.columns = [{ width: 6 }, { width: 15 }, { width: 18 }, { width: 20 }, { width: 24 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 17 }, { width: 16 }, { width: 20 }];
  titleBlock(com, "Community / Settlement Allocation Register", subtitle, head.length);
  headerRow(com, 4, head);
  let cr = 5;
  result.communities.forEach((c, i) => {
    com.getRow(cr).values = [
      i + 1, c.state, c.lga, c.ward, c.flhf, c.community, c.settlement,
      c.targetPop, c.allocation, c.buffer, c.dispatch, "", "",
    ];
    cr++;
  });
  styleBody(com, 5, cr - 1, head.length);
  for (let i = 5; i < cr; i++) {
    const row = com.getRow(i);
    [8, 9, 10, 11].forEach((c) => { row.getCell(c).numFmt = money; row.getCell(c).alignment = { horizontal: "right" }; });
    row.getCell(1).alignment = { horizontal: "center" };
    [12, 13].forEach((c) => { row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN } }; });
  }
  const totalRow = com.getRow(cr);
  totalRow.values = ["", "TOTAL", "", "", "", "", "", result.totals.targetPop, result.totals.allocation, result.totals.buffer, result.totals.dispatch, "", ""];
  for (let c = 1; c <= head.length; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    if ([8, 9, 10, 11].includes(c)) { cell.numFmt = money; cell.alignment = { horizontal: "right" }; }
  }

  /* ── Validation report ─────────────────────────────────────────────── */
  const vr = wb.addWorksheet("Validation Report", { properties: { tabColor: { argb: "FFB00020" } }, pageSetup: { orientation: "landscape", fitToPage: true } });
  vr.columns = [{ width: 14 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 60 }];
  titleBlock(vr, "Validation Report — Reconciliation & Approved Totals", subtitle, 6);

  let vrow = 4;
  const sectionHeader = (text: string) => {
    vr.mergeCells(vrow, 1, vrow, 6);
    const c = vr.getCell(vrow, 1);
    c.value = text;
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_DARK } };
    c.alignment = { vertical: "middle", indent: 1 };
    vr.getRow(vrow).height = 20;
    vrow++;
  };

  sectionHeader("1. Final approved totals used for this allocation");
  const approved: [string, string | number][] = [
    ["Medicine / commodity", meta.medicine],
    ["Programme", meta.program || "—"],
    ["Dispensing unit", unit],
    ["Rounding rule", meta.roundingRule || "Exact largest-remainder apportionment"],
    ["Wastage / contingency buffer", `${(meta.bufferPct * 100).toFixed(1)}%`],
    ["LGAs included", result.totals.lgas],
    ["Wards included", result.totals.wards],
    ["Communities / settlements", result.totals.communities],
    ["Total target population", result.totals.targetPop],
    ["Total allocated units", result.totals.allocation],
    ["Buffer units", result.totals.buffer],
    ["Total units to dispatch", result.totals.dispatch],
    ["Approved on", stampedOn],
  ];
  for (const [k, v] of approved) {
    const a = vr.getCell(vrow, 1); vr.mergeCells(vrow, 2, vrow, 3);
    const b = vr.getCell(vrow, 2);
    a.value = k; a.font = { name: "Arial", size: 9, bold: true, color: { argb: WHO_DARK } };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    b.value = v as any; b.font = { name: "Arial", size: 9 };
    if (typeof v === "number") { b.numFmt = money; b.alignment = { horizontal: "left" }; }
    [a, b].forEach((c) => { c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } }; c.alignment = { ...(c.alignment || {}), vertical: "middle", wrapText: true }; });
    vrow++;
  }
  vrow++;

  sectionHeader("2. Rounding residuals (difference between entered and distributed totals)");
  headerRow(vr, vrow, ["Level", "Geography", `Entered (${unit})`, `Distributed (${unit})`, "Difference", "Explanation"]);
  const resStart = vrow + 1;
  vrow++;
  if (result.residuals.length === 0) {
    vr.getRow(vrow).values = ["—", "All geographies", result.totals.allocation, result.totals.allocation, 0, "Every ward and LGA reconciles exactly — no residual."];
    vrow++;
  } else {
    for (const r of result.residuals) {
      vr.getRow(vrow).values = [r.level, r.scope, r.input, r.distributed, r.diff, explainResidual(r, unit)];
      vrow++;
    }
  }
  styleBody(vr, resStart, vrow - 1, 6);
  for (let i = resStart; i < vrow; i++) {
    const row = vr.getRow(i);
    [3, 4, 5].forEach((c) => { row.getCell(c).numFmt = money; row.getCell(c).alignment = { horizontal: "right" }; });
    const d = Number(row.getCell(5).value) || 0;
    if (d !== 0) row.getCell(5).font = { name: "Arial", size: 9, bold: true, color: { argb: "FFC00000" } };
  }
  vrow++;

  sectionHeader("3. Reconciliation warnings raised before approval");
  headerRow(vr, vrow, ["Severity", "Message", "", "", "", ""]);
  const wStart = vrow + 1;
  vrow++;
  const notes = meta.validation ?? [];
  if (notes.length === 0) {
    vr.getRow(vrow).values = ["OK", "No reconciliation warnings — the allocation was approved clean."];
    vr.mergeCells(vrow, 2, vrow, 6);
    vrow++;
  } else {
    for (const nte of notes) {
      vr.getRow(vrow).values = [nte.level === "error" ? "ERROR" : nte.level === "warn" ? "WARNING" : "INFO", nte.text];
      vr.mergeCells(vrow, 2, vrow, 6);
      vrow++;
    }
  }
  styleBody(vr, wStart, vrow - 1, 6);
  for (let i = wStart; i < vrow; i++) {
    const sev = String(vr.getCell(i, 1).value || "");
    vr.getCell(i, 1).font = {
      name: "Arial", size: 9, bold: true,
      color: { argb: sev === "ERROR" ? "FFC00000" : sev === "WARNING" ? "FFB45309" : "FF008000" },
    };
    vr.getCell(i, 2).alignment = { wrapText: true, vertical: "top" };
  }
  vrow++;

  sectionHeader("4. Geographies excluded / archived from this allocation");
  headerRow(vr, vrow, ["Level", "State", "LGA", "Ward", "", ""]);
  const xStart = vrow + 1;
  vrow++;
  const ex = meta.exclusions ?? [];
  if (ex.length === 0) {
    vr.getRow(vrow).values = ["—", "None", "All geographies in scope were included in this allocation."];
    vr.mergeCells(vrow, 3, vrow, 6);
    vrow++;
  } else {
    for (const e of ex) { vr.getRow(vrow).values = [e.level, e.state, e.lga, e.ward || "—", "", ""]; vrow++; }
  }
  styleBody(vr, xStart, vrow - 1, 6);
  vr.views = [{ state: "normal" }];
  vr.autoFilter = undefined as any;


  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `community-medicine-allocation-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
