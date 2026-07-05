// SARMAAN ACSM & MDA Supervision — colourful, professional Excel export of every
// checklist submission feeding the dashboard. Builds three sheets:
//   1. Submissions   — one row per submission, every checklist field as a column
//   2. Dashboard KPIs — the headline metrics rendered on the board
//   3. Ward Performance — per-ward overall score + performance band
//
// Values are resolved through the per-form name→id map so submissions captured
// on any sibling ACSM form decode correctly.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import {
  readStr, overallScoreOf, bandOf, BAND_META, computeAcsmMetrics,
  type AcsmSub, type NameToId,
} from "@/lib/sarmaan/acsmDashboardData";
import { ACSM_FIELD } from "@/lib/sarmaan/acsmChecklist";
import type { ProfileLite } from "@/lib/accountability";

const NAVY = "FF0A2540";
const GREEN = "FF1E9E52";
const TEAL = "FF12B5A5";
const HEADER_TEXT = "FFFFFFFF";
const STRIPE = "FFEFF6FB";
const BORDER = "FFCBD8E6";
const INK = "FF1E293B";

const border = {
  top: { style: "thin" as const, color: { argb: BORDER } },
  bottom: { style: "thin" as const, color: { argb: BORDER } },
  left: { style: "thin" as const, color: { argb: BORDER } },
  right: { style: "thin" as const, color: { argb: BORDER } },
};

interface Col { key: string; label: string; kind: "meta" | "field" }

function sections(q: unknown): FormGroup[] {
  if (Array.isArray(q)) return q.filter((r) => Array.isArray((r as FormGroup)?.questions)) as FormGroup[];
  return [];
}

export async function exportAcsmSubmissions(opts: {
  formName: string;
  questions: unknown;
  subs: AcsmSub[];
  maps: Record<string, NameToId>;
  profiles: Map<string, ProfileLite>;
}): Promise<void> {
  const { formName, questions, subs, maps, profiles } = opts;

  // Ordered column set: fixed metadata first, then every checklist question.
  const metaCols: Col[] = [
    { key: "__date", label: "Supervision Date", kind: "meta" },
    { key: "__submitted", label: "Submitted At", kind: "meta" },
    { key: "__supervisor", label: "Supervisor", kind: "meta" },
    { key: "__state", label: "State", kind: "meta" },
    { key: "__lga", label: "LGA", kind: "meta" },
    { key: "__ward", label: "Ward", kind: "meta" },
    { key: "__community", label: "Community", kind: "meta" },
    { key: "__gps", label: "GPS (lat, lng)", kind: "meta" },
    { key: "__score", label: "Overall Score %", kind: "meta" },
    { key: "__band", label: "Performance Band", kind: "meta" },
  ];

  const seen = new Set<string>();
  const fieldCols: Col[] = [];
  sections(questions).forEach((g) => {
    (g.questions || []).forEach((qq: Question) => {
      if (!qq.name || seen.has(qq.name)) return;
      // Skip fields already covered by metadata columns.
      if ([ACSM_FIELD.state, ACSM_FIELD.lga, ACSM_FIELD.ward, ACSM_FIELD.community,
        ACSM_FIELD.gps, ACSM_FIELD.supervisionDate, ACSM_FIELD.supervisorSignature].includes(qq.name as any)) return;
      seen.add(qq.name);
      fieldCols.push({ key: qq.name, label: `${g.label?.slice(0, 2) || ""} ${qq.label || qq.name}`.trim(), kind: "field" });
    });
  });

  const columns = [...metaCols, ...fieldCols];

  const supName = (s: AcsmSub) => {
    const p = s.user_id ? profiles.get(s.user_id) : undefined;
    return p?.name || p?.email || "—";
  };
  const cellFor = (s: AcsmSub, c: Col): string | number => {
    switch (c.key) {
      case "__date": return readStr(s, ACSM_FIELD.supervisionDate, maps) || "";
      case "__submitted": return s.created_at ? new Date(s.created_at).toLocaleString() : "";
      case "__supervisor": return supName(s);
      case "__state": return readStr(s, ACSM_FIELD.state, maps);
      case "__lga": return readStr(s, ACSM_FIELD.lga, maps);
      case "__ward": return readStr(s, ACSM_FIELD.ward, maps);
      case "__community": return readStr(s, ACSM_FIELD.community, maps);
      case "__gps": {
        const g = (s.data && Object.values(s.data)) ? readGps(s, maps) : null;
        return g ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : "";
      }
      case "__score": return overallScoreOf([s], maps);
      case "__band": return BAND_META[bandOf(overallScoreOf([s], maps))].label;
      default: return readStr(s, c.key, maps);
    }
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities · SARMAAN ACSM";
  wb.created = new Date();

  // ---------------- Submissions sheet ----------------
  const ws = wb.addWorksheet("Submissions", {
    views: [{ state: "frozen", ySplit: 3, xSplit: 2 }],
    properties: { defaultRowHeight: 18 },
  });
  const colCount = columns.length;

  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell(1, 1);
  title.value = `${formName} — All Submissions`;
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: HEADER_TEXT } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getCell(2, 1);
  sub.value = `${subs.length} submission(s) · Azithromycin MDA for children 1–59 months · exported ${new Date().toLocaleString()}`;
  sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: HEADER_TEXT } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  ws.getRow(2).height = 18;

  const headerRow = ws.getRow(3);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.kind === "meta" ? NAVY : TEAL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  headerRow.height = 40;

  subs.forEach((s, ri) => {
    const row = ws.getRow(ri + 4);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = cellFor(s, c);
      if (c.key === "__score") {
        cell.value = Number(v);
        cell.numFmt = '0"%"';
        cell.alignment = { vertical: "top", horizontal: "center" };
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: bandArgb(Number(v)) } };
      } else {
        cell.value = v === "" ? "" : v;
        cell.alignment = { vertical: "top", horizontal: c.kind === "meta" ? "left" : "center", wrapText: true };
        cell.font = { name: "Calibri", size: 10, color: { argb: INK } };
      }
      cell.border = border;
      if (ri % 2 === 1 && c.key !== "__score") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      }
      // Colour band cell
      if (c.key === "__band") {
        const argb = bandArgb(overallScoreOf([s], maps));
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb } };
      }
    });
  });

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const sample = subs.slice(0, 80).reduce((m, s) => Math.max(m, String(cellFor(s, c) ?? "").length), 0);
    col.width = Math.min(44, Math.max(11, Math.max(c.label.length, sample) + 2));
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };

  // ---------------- Dashboard KPIs sheet ----------------
  const M = computeAcsmMetrics(subs, maps);
  const ks = wb.addWorksheet("Dashboard KPIs");
  ks.mergeCells(1, 1, 1, 2);
  const kt = ks.getCell(1, 1);
  kt.value = "Dashboard KPIs";
  kt.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
  kt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  kt.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ks.getRow(1).height = 26;
  ["Metric", "Value"].forEach((h, i) => {
    const cell = ks.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.border = border;
    cell.alignment = { horizontal: i === 0 ? "left" : "center" };
  });
  const kpis: [string, string | number][] = [
    ["Total Submissions", subs.length],
    ["Wards Supervised", `${M.wardsSupervised} / ${M.wardsTotal} (${M.wardsSupervisedPct}%)`],
    ["Teams Deployed", `${M.teamsWent} / ${M.teamsPlanned} (${M.teamsDeployedPct}%)`],
    ["Teams Not Deployed", M.teamsNotDeployed],
    ["Community Awareness %", M.communityAwareness],
    ["Correct Dosing Rate %", M.correctDosing],
    ["Consent Obtained %", M.consentObtained],
    ["Refusal Rate %", M.refusalRate],
    ["IEC Visibility %", M.iecVisibility],
    ["Town Announcer Coverage %", M.announcerCoverage],
    ["Total ADRs Reported", M.adrTotal],
    ["ADRs Referred", `${M.adrReferred} (${M.adrReferredPct}%)`],
  ];
  kpis.forEach((k, i) => {
    const row = ks.getRow(i + 3);
    const a = row.getCell(1); a.value = k[0]; a.border = border;
    const b = row.getCell(2); b.value = k[1]; b.border = border;
    b.alignment = { horizontal: "center" }; b.font = { bold: true, color: { argb: INK } };
    if (i % 2 === 1) { a.fill = fillStripe(); b.fill = fillStripe(); }
  });
  ks.getColumn(1).width = 34; ks.getColumn(2).width = 24;

  // ---------------- Ward Performance sheet ----------------
  const ps = wb.addWorksheet("Ward Performance");
  ps.mergeCells(1, 1, 1, 3);
  const pt = ps.getCell(1, 1);
  pt.value = "Ward Performance Bands";
  pt.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
  pt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  pt.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ps.getRow(1).height = 26;
  ["Ward", "Overall Score %", "Band"].forEach((h, i) => {
    const cell = ps.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.border = border;
    cell.alignment = { horizontal: i === 0 ? "left" : "center" };
  });
  (M.wardScores || []).forEach((w, i) => {
    const row = ps.getRow(i + 3);
    const a = row.getCell(1); a.value = w.ward; a.border = border;
    const b = row.getCell(2); b.value = w.score; b.numFmt = '0"%"'; b.border = border; b.alignment = { horizontal: "center" };
    const c = row.getCell(3); c.value = BAND_META[w.band].label; c.border = border; c.alignment = { horizontal: "center" };
    c.font = { bold: true, color: { argb: bandArgb(w.score) } };
    if (i % 2 === 1) { a.fill = fillStripe(); b.fill = fillStripe(); c.fill = fillStripe(); }
  });
  ps.getColumn(1).width = 30; ps.getColumn(2).width = 18; ps.getColumn(3).width = 20;

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `SARMAAN_ACSM_Submissions_${stamp}.xlsx`,
  );
}

function fillStripe(): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
}

function bandArgb(score: number): string {
  const hex = BAND_META[bandOf(score)].color.replace("#", "");
  return `FF${hex.toUpperCase()}`;
}

function readGps(s: AcsmSub, maps: Record<string, NameToId>): { lat: number; lng: number } | null {
  const m = maps[s.formId];
  const id = m?.get(ACSM_FIELD.gps);
  const raw = (id && s.data && (s.data as any)[id]) || (s.data as any)?.[ACSM_FIELD.gps];
  const lat = Number((raw as any)?.lat), lng = Number((raw as any)?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
