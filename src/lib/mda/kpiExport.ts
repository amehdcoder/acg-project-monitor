/**
 * KPI data export — Integrated MDA Supervisory Checklist
 * ────────────────────────────────────────────────────────────────────────
 * Clicking a headline KPI card downloads a beautifully-formatted Excel
 * workbook containing every question response for the submissions used to
 * compute that KPI (questions = columns, one row per submission). The columns,
 * rows and cells that the value was computed from are visibly highlighted so a
 * reviewer can audit the number end-to-end.
 *
 * Accuracy guarantee: this module shares `buildMdaModel` with the dashboard's
 * KPI engine, so the rows it selects and the cells it highlights are derived
 * from exactly the same logic that produced the headline figure.
 */
import ExcelJS from "exceljs";
import {
  buildMdaModel,
  type KSubmission,
  type ModelCom,
} from "./kpis";
import {
  MDA_FOLLOWUP_COMPLETION,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_ADVERSE,
} from "@/lib/mdaFollowUp";

// ── palette (matches the dashboard export visual language) ──
const NAVY = "FF0C2340";
const WHITE = "FFFFFFFF";
const DET_HEADER = "FFFDE68A"; // amber — determinant column header
const DET_HEADER_FG = "FF92400E";
const ROW_HIT = "FFDCFCE7"; // green — contributing (counted) row
const CELL_HIT = "FF34D399"; // strong green — the exact determinant cell
const CELL_HIT_FG = "FF064E3B";
const ZEBRA = "FFF7F9FC";

const strip = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => strip(v).toLowerCase();

interface ExpQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: { label?: string; value?: string }[];
  questions?: ExpQuestion[];
}
interface FlatQ { key: string; label: string; q: ExpQuestion }

function flatten(questions: ExpQuestion[]): FlatQ[] {
  const out: FlatQ[] = [];
  const seen = new Set<string>();
  const walk = (qs?: ExpQuestion[]) => {
    for (const item of qs || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (isGroup) walk(item.questions);
      else if (item.type) {
        const key = String(item.name || item.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label: strip(item.label) || key, q: item });
      }
    }
  };
  walk(questions);
  return out;
}

function displayValue(q: ExpQuestion, raw: any): string | number {
  if (raw === undefined || raw === null || raw === "") return "";
  const labelFor = (val: string) =>
    strip(q.options?.find((o) => String(o.value) === String(val) || o.label === val)?.label) || strip(val);
  if (Array.isArray(raw)) return raw.map((v) => labelFor(String(v))).join(" | ");
  if (typeof raw === "object") { try { return JSON.stringify(raw); } catch { return String(raw); } }
  const s = String(raw);
  if (q.type === "select_multiple" && s.includes(" ")) return s.split(/\s+/).map(labelFor).join(" | ");
  if ((q.type === "number" || q.type === "integer" || q.type === "decimal") && s !== "" && !isNaN(Number(s))) return Number(s);
  return labelFor(s);
}

export type KpiId =
  | "communitiesSupervised"
  | "mdaCompleted"
  | "sufficientMedicine"
  | "followUpCoverage"
  | "adverseManaged"
  | "redFlagSites";

interface ExportRow {
  s: KSubmission;
  kind: "Checklist" | "Follow-up";
  contributes: boolean; // counted toward the KPI numerator
  hitKeys: Set<string>; // determinant cells satisfying the condition
}
interface KpiSpec {
  label: string;
  definition: string;
  numerator: number;
  denominator: number;
  display: string;
  determinantKeys: string[]; // columns to flag in the header
  rows: ExportRow[];
}

const KPI_DEFS: Record<KpiId, { label: string; definition: string }> = {
  communitiesSupervised: {
    label: "Communities Supervised",
    definition: "Total checklist submissions (all users, all time). Every checklist row below is counted.",
  },
  mdaCompleted: {
    label: "MDA Completed",
    definition: "Checklist submissions whose community's latest \"Status of MDA\" = Completed ÷ total checklist submissions.",
  },
  sufficientMedicine: {
    label: "Sufficient Medicine",
    definition: "Checklist submissions answering Yes to \"Does CDD have sufficient medicine?\" (first visit) ÷ total checklist submissions.",
  },
  followUpCoverage: {
    label: "Follow-up Coverage",
    definition: "Communities requiring any follow-up that were followed up (deduplicated) ÷ communities requiring any follow-up.",
  },
  adverseManaged: {
    label: "Adverse Cases Managed",
    definition: "Communities with SAE complaint = Yes that were followed up with \"Has it been managed?\" = Yes ÷ communities with SAE = Yes.",
  },
  redFlagSites: {
    label: "Red-flag Sites",
    definition: "Distinct communities where availability of CDD/Teacher, register, dose pole, sufficient medicine OR treatment commenced = No, OR SAE complaint = Yes.",
  },
};

function buildSpec(kpiId: KpiId, submissions: KSubmission[], questions: ExpQuestion[]): KpiSpec {
  const m = buildMdaModel(submissions, questions as any);
  const { dq, allComs, firstChecklistVal, isYes, isNo, latestStatus, hasFu,
    needsCompletion, needsCommodities, saeYes, needsAdverse } = m;
  const def = KPI_DEFS[kpiId];
  const rows: ExportRow[] = [];
  let numerator = 0, denominator = 0;
  let determinantKeys: string[] = [];

  const checklistOf = (c: ModelCom) => c.checklist;
  const k = (q: any) => (q ? q.key : undefined);

  if (kpiId === "communitiesSupervised") {
    for (const c of allComs) for (const s of checklistOf(c)) rows.push({ s, kind: "Checklist", contributes: true, hitKeys: new Set() });
    numerator = denominator = rows.length;
  } else if (kpiId === "mdaCompleted") {
    determinantKeys = [k(dq.status)].filter(Boolean);
    for (const c of allComs) {
      const completed = latestStatus(c) === "completed";
      for (const s of checklistOf(c)) {
        const hit = new Set<string>();
        if (completed && dq.status) hit.add(dq.status.key);
        rows.push({ s, kind: "Checklist", contributes: completed, hitKeys: hit });
        denominator++;
        if (completed) numerator++;
      }
    }
  } else if (kpiId === "sufficientMedicine") {
    determinantKeys = [k(dq.suffMed)].filter(Boolean);
    for (const c of allComs) {
      for (const s of checklistOf(c)) {
        const yes = !!dq.suffMed && isYes(dq.suffMed, s.data?.[dq.suffMed.key]);
        const hit = new Set<string>();
        if (yes && dq.suffMed) hit.add(dq.suffMed.key);
        rows.push({ s, kind: "Checklist", contributes: yes, hitKeys: hit });
        denominator++;
        if (yes) numerator++;
      }
    }
  } else if (kpiId === "followUpCoverage") {
    determinantKeys = [k(dq.status), k(dq.registers), k(dq.dose), k(dq.suffMed), k(dq.sae)].filter(Boolean) as string[];
    for (const c of allComs) {
      const needs = needsCompletion(c) || needsCommodities(c) || needsAdverse(c);
      if (!needs) continue;
      denominator++;
      const followed =
        (needsCompletion(c) && hasFu(c, MDA_FOLLOWUP_COMPLETION)) ||
        (needsCommodities(c) && hasFu(c, MDA_FOLLOWUP_COMMODITIES)) ||
        (needsAdverse(c) && hasFu(c, MDA_FOLLOWUP_ADVERSE));
      if (followed) numerator++;
      const hit = new Set<string>();
      if (needsCompletion(c) && dq.status) hit.add(dq.status.key);
      if (dq.registers && isNo(dq.registers, firstChecklistVal(c, dq.registers))) hit.add(dq.registers.key);
      if (dq.dose && isNo(dq.dose, firstChecklistVal(c, dq.dose))) hit.add(dq.dose.key);
      if (dq.suffMed && isNo(dq.suffMed, firstChecklistVal(c, dq.suffMed))) hit.add(dq.suffMed.key);
      if (dq.sae && saeYes(c)) hit.add(dq.sae.key);
      for (const s of checklistOf(c)) rows.push({ s, kind: "Checklist", contributes: followed, hitKeys: new Set(hit) });
      for (const canonical of [MDA_FOLLOWUP_COMPLETION, MDA_FOLLOWUP_COMMODITIES, MDA_FOLLOWUP_ADVERSE])
        for (const s of c.fu[canonical] || []) rows.push({ s, kind: "Follow-up", contributes: followed, hitKeys: new Set() });
    }
  } else if (kpiId === "adverseManaged") {
    determinantKeys = [k(dq.sae), k(dq.managed)].filter(Boolean) as string[];
    for (const c of allComs) {
      if (!saeYes(c)) continue;
      denominator++;
      const fu = c.fu[MDA_FOLLOWUP_ADVERSE] || [];
      const managed = fu.some((s) => dq.managed && isYes(dq.managed, s.data?.[dq.managed.key]));
      if (managed) numerator++;
      const hit = new Set<string>();
      if (dq.sae) hit.add(dq.sae.key);
      for (const s of checklistOf(c)) rows.push({ s, kind: "Checklist", contributes: managed, hitKeys: new Set(hit) });
      for (const s of fu) {
        const mh = new Set<string>();
        if (managed && dq.managed && isYes(dq.managed, s.data?.[dq.managed.key])) mh.add(dq.managed.key);
        rows.push({ s, kind: "Follow-up", contributes: managed, hitKeys: mh });
      }
    }
  } else if (kpiId === "redFlagSites") {
    determinantKeys = [k(dq.cdd), k(dq.registers), k(dq.dose), k(dq.suffMed), k(dq.commenced), k(dq.sae)].filter(Boolean) as string[];
    for (const c of allComs) {
      const hit = new Set<string>();
      if (dq.cdd && isNo(dq.cdd, firstChecklistVal(c, dq.cdd))) hit.add(dq.cdd.key);
      if (dq.registers && isNo(dq.registers, firstChecklistVal(c, dq.registers))) hit.add(dq.registers.key);
      if (dq.dose && isNo(dq.dose, firstChecklistVal(c, dq.dose))) hit.add(dq.dose.key);
      if (dq.suffMed && isNo(dq.suffMed, firstChecklistVal(c, dq.suffMed))) hit.add(dq.suffMed.key);
      if (dq.commenced && isNo(dq.commenced, firstChecklistVal(c, dq.commenced))) hit.add(dq.commenced.key);
      if (dq.sae && saeYes(c)) hit.add(dq.sae.key);
      const flagged = hit.size > 0;
      if (!flagged) continue;
      numerator++; denominator++;
      for (const s of checklistOf(c)) rows.push({ s, kind: "Checklist", contributes: true, hitKeys: new Set(hit) });
    }
  }

  const isPct = kpiId !== "communitiesSupervised" && kpiId !== "redFlagSites";
  const display = kpiId === "communitiesSupervised" || kpiId === "redFlagSites"
    ? numerator.toLocaleString()
    : `${denominator > 0 ? Math.round((numerator / denominator) * 100) : 0}%`;

  return { label: def.label, definition: def.definition, numerator, denominator, display, determinantKeys, rows };
}

const META = ["#", "Type", "Status", "Submitted by", "Submitted at", "State", "LGA", "Ward", "Community"];

export async function exportKpiWorkbook(
  kpiId: KpiId,
  submissions: KSubmission[],
  questions: ExpQuestion[],
  formName: string,
  projectName?: string,
) {
  const spec = buildSpec(kpiId, submissions, questions);
  const flat = flatten(questions);
  const detSet = new Set(spec.determinantKeys);
  const colKeyAt = (i: number) => flat[i - META.length - 1]?.key;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  // ───── About sheet ─────
  const about = wb.addWorksheet("About this KPI", { views: [{ showGridLines: false }] });
  about.columns = [{ width: 30 }, { width: 70 }];
  const band = (text: string, fill: string, size: number) => {
    const r = about.addRow([text, ""]);
    about.mergeCells(r.number, 1, r.number, 2);
    const c = about.getCell(r.number, 1);
    c.value = text;
    c.font = { bold: true, size, color: { argb: WHITE }, name: "Arial" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    r.height = size + 14;
  };
  band(`${spec.label} — KPI Data Export`, NAVY, 14);
  band(`${formName}${projectName ? `  •  ${projectName}` : ""}`, "FF6366F1", 11);
  about.addRow([]);
  const kv = (key: string, val: string | number) => {
    const r = about.addRow([key, String(val)]);
    r.getCell(1).font = { bold: true, name: "Arial", color: { argb: NAVY } };
    r.getCell(2).font = { name: "Arial" };
    r.getCell(1).alignment = { vertical: "top" };
    r.getCell(2).alignment = { vertical: "top", wrapText: true };
  };
  kv("Definition", spec.definition);
  kv("Computed value", spec.display);
  kv("Numerator", spec.numerator);
  kv("Denominator", spec.denominator);
  kv("Rows exported", spec.rows.length);
  kv("Generated", new Date().toLocaleString());
  about.addRow([]);
  band("How to read the highlights", "FF06B6D4", 11);
  const legend = (swatch: string, fg: string, text: string) => {
    const r = about.addRow(["", text]);
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: swatch } };
    r.getCell(1).value = "Sample";
    r.getCell(1).font = { name: "Arial", bold: true, color: { argb: fg } };
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(2).font = { name: "Arial" };
    r.getCell(2).alignment = { vertical: "middle", wrapText: true };
  };
  legend(DET_HEADER, DET_HEADER_FG, "Determinant column — this question drives the KPI computation.");
  legend(ROW_HIT, "FF166534", "Contributing row — this submission is counted in the KPI numerator.");
  legend(CELL_HIT, CELL_HIT_FG, "Determinant cell — this exact answer satisfied the KPI condition.");

  // ───── Data sheet ─────
  const ws = wb.addWorksheet("KPI Submissions", {
    views: [{ state: "frozen", xSplit: META.length, ySplit: 1, showGridLines: false }],
    properties: { defaultRowHeight: 16 },
  });
  const headers = [...META, ...flat.map((f) => f.label)];
  const headerRow = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    const key = colKeyAt(i + 1);
    const isDet = !!key && detSet.has(key);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: isDet ? DET_HEADER_FG : NAVY }, name: "Arial" };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isDet ? DET_HEADER : "FFEEF2FB" } };
    cell.border = { bottom: { style: "medium", color: { argb: isDet ? DET_HEADER_FG : NAVY } }, right: { style: "hair", color: { argb: "FFCBD5E1" } } };
    ws.getColumn(i + 1).width = i < META.length ? (i === 0 ? 6 : 18) : Math.min(34, Math.max(14, headers[i].length + 2));
  });
  headerRow.height = 32;

  spec.rows.forEach((er, idx) => {
    const s = er.s;
    const d = s.data || {};
    const meta = [
      idx + 1,
      er.kind,
      s.status ? s.status[0].toUpperCase() + s.status.slice(1) : "—",
      s.submitter || "—",
      s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—",
      s.state || d.state || "—",
      s.lga || d.lga || "—",
      s.ward || d.ward || "—",
      strip(d.community || d.community_name || d.settlement || d.settlement_name) || "—",
    ];
    const body = flat.map((f) => displayValue(f.q, d[f.key]));
    const r = ws.addRow([...meta, ...body]);
    r.height = 16;
    const baseFill = er.contributes ? ROW_HIT : (idx % 2 === 0 ? WHITE : ZEBRA);
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isNum = typeof cell.value === "number";
      cell.font = { size: 9, color: { argb: "FF1F2937" }, name: "Arial" };
      cell.alignment = { vertical: "middle", horizontal: colNumber <= META.length ? "left" : isNum ? "center" : "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: baseFill } };
      cell.border = { right: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (isNum) cell.numFmt = "#,##0.###";
      const key = colKeyAt(colNumber);
      if (key && er.hitKeys.has(key)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CELL_HIT } };
        cell.font = { size: 9, bold: true, color: { argb: CELL_HIT_FG }, name: "Arial" };
      }
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = `${spec.label}`.replace(/[^a-z0-9]+/gi, "_");
  a.href = url;
  a.download = `KPI_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
