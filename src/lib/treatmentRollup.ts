// Aggregation & Excel export for the Treatment Data Reporting Tools.
//
// Rolls up Community/Village/School Summary (Level 1) submissions BY FLHF into
// the FLHF Summary (Level 2) shape, and rolls FLHF-level data up BY LGA into
// the LGA Summary (Level 3) shape — then writes a beautifully-formatted, fully
// labelled Excel workbook for download.
//
// Submissions store responses keyed by question.id, so we use the form's own
// questions definition (id → name, name → label) to normalise every record.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  buildCommunitySummaryForm,
  COMMUNITY_SUMMARY_FORM_NAME,
} from "@/lib/treatmentDataForms";

// ── Maps from a form definition (grouped FormGroup[] or flat) ────────────────
interface FieldMeta {
  name: string;
  label: string;
  type: string;
}

function collectFields(questions: any[]): { idToName: Record<string, string>; order: FieldMeta[] } {
  const idToName: Record<string, string> = {};
  const order: FieldMeta[] = [];
  const seen = new Set<string>();
  const visit = (q: any) => {
    if (!q || !q.name) return;
    if (q.id) idToName[q.id] = q.name;
    if (q.type === "note") return;
    if (!seen.has(q.name)) {
      seen.add(q.name);
      order.push({ name: q.name, label: q.label || q.name, type: q.type || "text" });
    }
  };
  for (const item of questions || []) {
    if (item?.questions && Array.isArray(item.questions)) item.questions.forEach(visit);
    else visit(item);
  }
  return { idToName, order };
}

// Normalise one submission's raw data into a name-keyed object.
function normaliseRow(data: Record<string, any>, idToName: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data || {})) {
    const name = idToName[k] || k; // already name-keyed values pass through
    if (out[name] === undefined || out[name] === "" || out[name] === null) out[name] = v;
  }
  return out;
}

const GEO_KEYS = ["state", "lga", "ward", "flhf_name", "community", "settlement_name"];

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function displayText(v: any): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(displayText).join(", ");
  if (typeof v === "object") {
    const lat = v.lat ?? v.latitude;
    const lng = v.lng ?? v.longitude;
    if (lat != null && lng != null) return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    return JSON.stringify(v);
  }
  if (typeof v === "string") return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return String(v);
}

interface NormalisedSubmission {
  row: Record<string, any>;
  submittedAt: string;
}

interface AggregateGroup {
  keys: Record<string, string>; // group key fields (e.g. state, lga, ward, flhf_name)
  sums: Record<string, number>; // summed numeric fields
  count: number; // number of source records
  childCount: number; // distinct children below this level (communities / flhfs)
}

// Aggregate rows by a set of grouping keys, summing every numeric field.
function aggregate(
  rows: Record<string, any>[],
  groupBy: string[],
  numericFields: string[],
  childKey?: string,
): AggregateGroup[] {
  const groups = new Map<string, AggregateGroup>();
  const childSets = new Map<string, Set<string>>();
  for (const r of rows) {
    const keyVals = groupBy.map((g) => String(r[g] ?? "").trim());
    const gk = keyVals.join("||").toLowerCase();
    let grp = groups.get(gk);
    if (!grp) {
      grp = {
        keys: Object.fromEntries(groupBy.map((g, i) => [g, keyVals[i]])),
        sums: Object.fromEntries(numericFields.map((f) => [f, 0])),
        count: 0,
        childCount: 0,
      };
      groups.set(gk, grp);
      childSets.set(gk, new Set());
    }
    grp.count += 1;
    for (const f of numericFields) {
      const n = toNumber(r[f]);
      if (n != null) grp.sums[f] += n;
    }
    if (childKey) {
      const cv = String(r[childKey] ?? "").trim();
      if (cv) childSets.get(gk)!.add(cv.toLowerCase());
    }
  }
  for (const [gk, grp] of groups) grp.childCount = childSets.get(gk)?.size || 0;
  return Array.from(groups.values()).sort((a, b) =>
    groupBy.map((g) => (a.keys[g] || "")).join().localeCompare(groupBy.map((g) => (b.keys[g] || "")).join()),
  );
}

// ── Excel styling helpers ────────────────────────────────────────────────────
const COLORS = {
  brand: "FF0E5C8C",
  brandDark: "FF083A59",
  accent: "FFE8F1F8",
  band: "FFF4F8FB",
  headerText: "FFFFFFFF",
  border: "FFCBD5E1",
  totalFill: "FFD9E8F4",
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brand } };
    cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 11, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.brandDark } },
      bottom: { style: "thin", color: { argb: COLORS.brandDark } },
      left: { style: "thin", color: { argb: COLORS.brandDark } },
      right: { style: "thin", color: { argb: COLORS.brandDark } },
    };
  });
  row.height = 30;
}

function thinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "hair", color: { argb: COLORS.border } },
    bottom: { style: "hair", color: { argb: COLORS.border } },
    left: { style: "hair", color: { argb: COLORS.border } },
    right: { style: "hair", color: { argb: COLORS.border } },
  };
}

function addTitleBlock(ws: ExcelJS.Worksheet, span: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: COLORS.brandDark }, name: "Calibri" };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { italic: true, size: 10, color: { argb: "FF607589" }, name: "Calibri" };
  ws.getRow(2).height = 18;
  ws.addRow([]); // spacer
}

function writeSheet(
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  columns: { header: string; key: string; width: number; numeric?: boolean }[],
  records: Record<string, any>[],
  totalRow?: Record<string, any>,
) {
  const span = columns.length;
  addTitleBlock(ws, span, title, subtitle);

  const headerRowIdx = ws.rowCount + 1;
  const header = ws.addRow(columns.map((c) => c.header));
  styleHeaderRow(header);

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  records.forEach((rec, ri) => {
    const row = ws.addRow(columns.map((c) => rec[c.key] ?? (c.numeric ? 0 : "")));
    row.eachCell((cell, col) => {
      thinBorder(cell);
      const c = columns[col - 1];
      cell.alignment = { vertical: "middle", horizontal: c?.numeric ? "right" : "left", wrapText: !c?.numeric };
      cell.font = { size: 10, name: "Calibri" };
      if (c?.numeric) cell.numFmt = "#,##0;(#,##0);-";
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.band } };
    });
  });

  if (totalRow) {
    const row = ws.addRow(columns.map((c) => totalRow[c.key] ?? ""));
    row.eachCell((cell, col) => {
      const c = columns[col - 1];
      cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: COLORS.brandDark } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalFill } };
      cell.alignment = { vertical: "middle", horizontal: c?.numeric ? "right" : "left" };
      if (c?.numeric) cell.numFmt = "#,##0;(#,##0);-";
      thinBorder(cell);
    });
  }

  ws.views = [{ state: "frozen", ySplit: headerRowIdx, xSplit: 0 }];
  if (records.length) {
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: span },
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export interface RollupOptions {
  projectId?: string;
  projectName?: string;
}

export async function generateTreatmentRollupWorkbook(opts: RollupOptions = {}): Promise<void> {
  // 1. Find the Community Summary forms (one project, or all).
  let formQuery = supabase
    .from("forms")
    .select("id, name, questions")
    .eq("name", COMMUNITY_SUMMARY_FORM_NAME);
  if (opts.projectId) formQuery = formQuery.eq("project_id", opts.projectId);
  const { data: forms, error: formErr } = await formQuery;
  if (formErr) throw formErr;

  // Field metadata: prefer a real form definition, else the canonical builder.
  const def = forms && forms.length ? forms[0] : null;
  const baseQuestions = def?.questions || (buildCommunitySummaryForm().questions as any);
  const { idToName, order } = collectFields(baseQuestions as any[]);
  // Merge in id→name maps from every form variant (admins may have edited copies).
  for (const f of forms || []) {
    const m = collectFields((f.questions as any[]) || []);
    Object.assign(idToName, m.idToName);
  }

  const formIds = (forms || []).map((f) => f.id);
  if (!formIds.length) {
    throw new Error("No Community/Village/School Summary Form found. Add the tool to a project and capture data first.");
  }

  // 2. Fetch all submissions for those forms.
  const subs = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from("form_submissions")
      .select("data, submitted_at, status")
      .in("form_id", formIds)
      .order("submitted_at", { ascending: true })
      .range(from, to);
    return q as any;
  });

  const records: NormalisedSubmission[] = (subs || [])
    .filter((s) => s.status !== "draft")
    .map((s) => ({ row: normaliseRow(s.data || {}, idToName), submittedAt: s.submitted_at }));

  if (!records.length) {
    throw new Error("No finalised Community Summary submissions found to aggregate.");
  }

  const rows = records.map((r) => r.row);

  // Numeric fields = every non-geo field from the definition that is numeric or calculate.
  const numericFields = order
    .filter((f) => (f.type === "number" || f.type === "calculate" || f.type === "integer") && !GEO_KEYS.includes(f.name))
    .map((f) => f.name);
  // Fallback: also include any field that is numeric across the data but not declared.
  const declared = new Set(numericFields);
  for (const f of order) {
    if (declared.has(f.name) || GEO_KEYS.includes(f.name)) continue;
    if (rows.some((r) => toNumber(r[f.name]) != null) && rows.every((r) => r[f.name] == null || r[f.name] === "" || toNumber(r[f.name]) != null)) {
      // skip text-ish; only add if mostly numeric — keep conservative, do nothing here
    }
  }

  const numericLabel = (name: string) => order.find((f) => f.name === name)?.label || name;

  // 3. Aggregations.
  const flhfGroups = aggregate(rows, ["state", "lga", "ward", "flhf_name"], numericFields, "community");
  const lgaGroups = aggregate(rows, ["state", "lga"], numericFields, "flhf_name");

  // 4. Build the workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  const stamp = new Date().toLocaleString();
  const scope = opts.projectName ? `Project: ${opts.projectName}` : "All projects";

  // Sheet A — LGA Summary (Level 3), aggregated by LGA.
  const lgaWs = wb.addWorksheet("LGA Summary (Level 3)", { properties: { tabColor: { argb: COLORS.brandDark } } });
  const lgaCols = [
    { header: "S/N", key: "sn", width: 6, numeric: true },
    { header: "State", key: "state", width: 18 },
    { header: "LGA", key: "lga", width: 20 },
    { header: "FLHFs Reporting", key: "flhfs", width: 14, numeric: true },
    { header: "Communities", key: "communities", width: 14, numeric: true },
    ...numericFields.map((n) => ({ header: numericLabel(n), key: n, width: 18, numeric: true })),
  ];
  const lgaRecords = lgaGroups.map((g, i) => ({
    sn: i + 1,
    state: g.keys.state || "—",
    lga: g.keys.lga || "—",
    flhfs: g.childCount,
    communities: g.count,
    ...g.sums,
  }));
  const lgaTotal: Record<string, any> = {
    sn: "", state: "TOTAL", lga: "",
    flhfs: lgaGroups.reduce((s, g) => s + g.childCount, 0),
    communities: lgaGroups.reduce((s, g) => s + g.count, 0),
  };
  numericFields.forEach((n) => (lgaTotal[n] = lgaGroups.reduce((s, g) => s + (g.sums[n] || 0), 0)));
  writeSheet(lgaWs, "LGA Summary Form (Level 3)", `Aggregated from FLHF summaries by LGA · ${scope} · Generated ${stamp}`, lgaCols, lgaRecords, lgaTotal);

  // Sheet B — FLHF Summary (Level 2), aggregated by FLHF.
  const flhfWs = wb.addWorksheet("FLHF Summary (Level 2)", { properties: { tabColor: { argb: COLORS.brand } } });
  const flhfCols = [
    { header: "S/N", key: "sn", width: 6, numeric: true },
    { header: "State", key: "state", width: 18 },
    { header: "LGA", key: "lga", width: 20 },
    { header: "Ward", key: "ward", width: 20 },
    { header: "FLHF / Zonal Education Office", key: "flhf_name", width: 28 },
    { header: "Communities / Schools", key: "communities", width: 16, numeric: true },
    ...numericFields.map((n) => ({ header: numericLabel(n), key: n, width: 18, numeric: true })),
  ];
  const flhfRecords = flhfGroups.map((g, i) => ({
    sn: i + 1,
    state: g.keys.state || "—",
    lga: g.keys.lga || "—",
    ward: g.keys.ward || "—",
    flhf_name: g.keys.flhf_name || "—",
    communities: g.count,
    ...g.sums,
  }));
  const flhfTotal: Record<string, any> = { sn: "", state: "TOTAL", lga: "", ward: "", flhf_name: "", communities: flhfGroups.reduce((s, g) => s + g.count, 0) };
  numericFields.forEach((n) => (flhfTotal[n] = flhfGroups.reduce((s, g) => s + (g.sums[n] || 0), 0)));
  writeSheet(flhfWs, "FLHF / Zonal Education Office Summary Form (Level 2)", `Aggregated from community summaries by FLHF · ${scope} · Generated ${stamp}`, flhfCols, flhfRecords, flhfTotal);

  // Sheet C — Community Submissions (all fields), the raw Level-1 table.
  const rawWs = wb.addWorksheet("Community Data (Level 1)", { properties: { tabColor: { argb: "FF1FB5A8" } } });
  const rawCols = [
    { header: "S/N", key: "sn", width: 6, numeric: true },
    { header: "Submitted", key: "submitted", width: 18 },
    ...order
      .filter((f) => f.type !== "note" && f.type !== "signature")
      .map((f) => ({ header: f.label, key: f.name, width: GEO_KEYS.includes(f.name) ? 22 : (numericFields.includes(f.name) ? 14 : 20), numeric: numericFields.includes(f.name) })),
  ];
  const rawRecords = records.map((r, i) => {
    const rec: Record<string, any> = {
      sn: i + 1,
      submitted: r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "",
    };
    for (const c of rawCols) {
      if (c.key === "sn" || c.key === "submitted") continue;
      const v = r.row[c.key];
      rec[c.key] = c.numeric ? (toNumber(v) ?? 0) : displayText(v);
    }
    return rec;
  });
  writeSheet(rawWs, "Community / Village / School Summary — All Fields", `Every captured field, one row per submission · ${scope} · Generated ${stamp}`, rawCols, rawRecords);

  // 5. Save.
  const buf = await wb.xlsx.writeBuffer();
  const fname = `Treatment-Data-Rollup-${opts.projectName ? opts.projectName.replace(/[^a-z0-9]+/gi, "-") + "-" : ""}${new Date().toISOString().slice(0, 10)}.xlsx`;
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fname);
}
