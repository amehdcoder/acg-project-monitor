// SARMAAN ACSM & MDA Supervision — colourful, professional Excel export of every
// checklist submission feeding the dashboard. The workbook keeps one submission
// per row, includes every checklist question as a column, and applies one colour
// system consistently across all sheets.

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import {
  readVal, readStr, overallScoreOf, bandOf, BAND_META, computeAcsmMetrics,
  type AcsmSub, type NameToId,
} from "@/lib/sarmaan/acsmDashboardData";
import { ACSM_FIELD } from "@/lib/sarmaan/acsmChecklist";
import type { ProfileLite } from "@/lib/accountability";

const X = {
  navy: "FF0A2540",
  green: "FF1E9E52",
  greenSoft: "FFE8F6EE",
  teal: "FF12B5A5",
  tealSoft: "FFE6FAF7",
  blue: "FF2563EB",
  amber: "FFF59E0B",
  amberSoft: "FFFFF4DE",
  red: "FFDC2626",
  redSoft: "FFFDECEC",
  lime: "FF84CC16",
  limeSoft: "FFF0F9DD",
  gray: "FF64748B",
  graySoft: "FFF1F5F9",
  white: "FFFFFFFF",
  stripe: "FFEFF6FB",
  border: "FFCBD8E6",
  ink: "FF1E293B",
  muted: "FF64748B",
};

const border = {
  top: { style: "thin" as const, color: { argb: X.border } },
  bottom: { style: "thin" as const, color: { argb: X.border } },
  left: { style: "thin" as const, color: { argb: X.border } },
  right: { style: "thin" as const, color: { argb: X.border } },
};

interface Col {
  key: string;
  label: string;
  kind: "meta" | "field";
  section?: string;
  type?: string;
}

const NUMERIC_FIELDS = new Set<string>([
  ACSM_FIELD.teamsPlanned,
  ACSM_FIELD.teamsWentOut,
  ACSM_FIELD.teamsNotOut,
  ACSM_FIELD.deploymentRate,
  ACSM_FIELD.awarenessRate,
  ACSM_FIELD.ageKnowledge,
  ACSM_FIELD.freeMedicineKnowledge,
  ACSM_FIELD.aesObserved,
  ACSM_FIELD.aesReferred,
]);

function sections(q: unknown): FormGroup[] {
  if (Array.isArray(q)) return q.filter((r) => Array.isArray((r as FormGroup)?.questions)) as FormGroup[];
  return [];
}

const cleanSection = (s?: string) => String(s || "Checklist").replace(/\s+/g, " ").trim();
const prettyName = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export async function exportAcsmSubmissions(opts: {
  formName: string;
  questions: unknown;
  subs: AcsmSub[];
  maps: Record<string, NameToId>;
  profiles: Map<string, ProfileLite>;
}): Promise<void> {
  const { formName, questions, subs, maps, profiles } = opts;

  // Ordered column set: fixed metadata first, then EVERY checklist question.
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
      seen.add(qq.name);
      const section = cleanSection(g.label);
      fieldCols.push({
        key: qq.name,
        label: `${section} — ${qq.label || prettyName(qq.name)}`,
        kind: "field",
        section,
        type: qq.type,
      });
    });
  });

  // Include any sibling-form question names that are present in dashboard maps
  // but not in the current schema object, so no valid checklist field is lost.
  Object.values(maps).forEach((m) => {
    m.forEach((_, name) => {
      if (seen.has(name)) return;
      seen.add(name);
      fieldCols.push({ key: name, label: `Checklist — ${prettyName(name)}`, kind: "field", section: "Checklist" });
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
      default: return formatAnswer(readVal(s, c.key, maps), c);
    }
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities · SARMAAN ACSM";
  wb.created = new Date();

  // ---------------- Submissions sheet ----------------
  const ws = wb.addWorksheet("Submissions", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 3 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    pageMargins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  });
  ws.properties.tabColor = { argb: X.green };
  const colCount = columns.length;

  titleBand(ws, 1, colCount, `${formName} — All Checklist Submissions`);
  subtitleBand(ws, 2, colCount, `${subs.length} submission(s) · every question captured as columns · exported ${new Date().toLocaleString()}`);
  legendBand(ws, 3, colCount);

  const headerRow = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.kind === "meta" ? X.navy : X.teal } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  headerRow.height = 42;

  subs.forEach((s, ri) => {
    const row = ws.getRow(ri + 5);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = cellFor(s, c);
      if (c.key === "__score") {
        cell.value = Number(v);
        cell.numFmt = '0"%"';
        cell.alignment = { vertical: "top", horizontal: "center" };
        applyBandCell(cell, Number(v));
      } else {
        cell.value = v === "" ? "" : v;
        cell.alignment = { vertical: "top", horizontal: c.kind === "meta" ? "left" : alignFor(c, v), wrapText: true };
        cell.font = { name: "Calibri", size: 10, color: { argb: X.ink } };
      }
      cell.border = border;
      if (ri % 2 === 1 && c.key !== "__score") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      }
      if (c.key === "__band") {
        applyBandCell(cell, overallScoreOf([s], maps), String(v));
      } else if (c.kind === "field") {
        applyAnswerRule(cell, v);
      }
    });
  });

  applyAutoFit(ws, 10, 52);
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colCount } };

  // ---------------- Dashboard KPIs sheet ----------------
  const M = computeAcsmMetrics(subs, maps);
  const ks = wb.addWorksheet("Dashboard KPIs");
  ks.properties.tabColor = { argb: X.blue };
  titleBand(ks, 1, 4, "Dashboard KPIs");
  legendBand(ks, 2, 4);
  ["Metric", "Value", "Band / Rule", "Interpretation"].forEach((h, i) => {
    const cell = ks.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: X.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.navy } };
    cell.border = border;
    cell.alignment = { horizontal: i === 0 || i === 3 ? "left" : "center", wrapText: true };
  });
  const kpis: { metric: string; value: string | number; score?: number; interpretation: string }[] = [
    { metric: "Total Submissions", value: subs.length, interpretation: "Number of checklist submissions included in this export." },
    { metric: "Wards Supervised", value: `${M.wardsSupervised} / ${M.wardsTotal} (${M.wardsSupervisedPct}%)`, score: M.wardsSupervisedPct, interpretation: "Share of known wards with at least one supervision visit." },
    { metric: "Teams Deployed", value: `${M.teamsWent} / ${M.teamsPlanned} (${M.teamsDeployedPct}%)`, score: M.teamsDeployedPct, interpretation: "Deployment performance against teams planned." },
    { metric: "Teams Not Deployed", value: M.teamsNotDeployed, interpretation: "Teams planned but not reported as deployed." },
    { metric: "Community Awareness %", value: `${M.communityAwareness}%`, score: M.communityAwareness, interpretation: "Caregivers aware, correct age, and free-medicine knowledge." },
    { metric: "Correct Dosing Rate %", value: `${M.correctDosing}%`, score: M.correctDosing, interpretation: "Correct reconstitution and age/dose-pole checks." },
    { metric: "Consent Obtained %", value: `${M.consentObtained}%`, score: M.consentObtained, interpretation: "Caregiver consent documented before medicine administration." },
    { metric: "Refusal Rate %", value: `${M.refusalRate}%`, score: inverseScore(M.refusalRate), interpretation: "Lower is better; derived from awareness and rumor-risk signals." },
    { metric: "IEC Visibility %", value: `${M.iecVisibility}%`, score: M.iecVisibility, interpretation: "Availability/display of IEC materials and job aids." },
    { metric: "Town Announcer Coverage %", value: `${M.announcerCoverage}%`, score: M.announcerCoverage, interpretation: "Town announcers present in communities visited." },
    { metric: "Total ADRs Reported", value: M.adrTotal, interpretation: "Adverse events observed during supervision." },
    { metric: "ADRs Referred", value: `${M.adrReferred} (${M.adrReferredPct}%)`, score: M.adrReferredPct, interpretation: "Reported adverse events referred to facility." },
  ];
  kpis.forEach((k, i) => {
    const row = ks.getRow(i + 3);
    const a = row.getCell(1); a.value = k.metric; a.border = border; a.font = { color: { argb: X.ink }, bold: true };
    const b = row.getCell(2); b.value = k.value; b.border = border; b.alignment = { horizontal: "center" }; b.font = { bold: true, color: { argb: X.ink } };
    const c = row.getCell(3); c.border = border; c.alignment = { horizontal: "center", wrapText: true };
    const d = row.getCell(4); d.value = k.interpretation; d.border = border; d.alignment = { wrapText: true }; d.font = { color: { argb: X.muted } };
    if (typeof k.score === "number") applyBandCell(c, k.score, BAND_META[bandOf(k.score)].label);
    else { c.value = "Operational count"; c.fill = fill(X.graySoft); c.font = { bold: true, color: { argb: X.gray } }; }
    if (i % 2 === 1) [a, b, d].forEach((cell) => { cell.fill = fillStripe(); });
  });
  applyAutoFit(ks, 14, 44);

  // ---------------- Ward Performance sheet ----------------
  const ps = wb.addWorksheet("Ward Performance");
  ps.properties.tabColor = { argb: X.teal };
  titleBand(ps, 1, 4, "Ward Performance Bands");
  legendBand(ps, 2, 4);
  ["Ward", "Visits", "Overall Score %", "Band"].forEach((h, i) => {
    const cell = ps.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: X.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: X.navy } };
    cell.border = border;
    cell.alignment = { horizontal: i === 0 ? "left" : "center" };
  });
  const wardVisits = new Map<string, number>();
  subs.forEach((s) => {
    const ward = readStr(s, ACSM_FIELD.ward, maps) || "Unspecified";
    wardVisits.set(ward, (wardVisits.get(ward) || 0) + 1);
  });
  (M.wardScores || []).forEach((w, i) => {
    const row = ps.getRow(i + 4);
    const a = row.getCell(1); a.value = w.ward; a.border = border;
    const b = row.getCell(2); b.value = wardVisits.get(w.ward) || 0; b.border = border; b.alignment = { horizontal: "center" };
    const c = row.getCell(3); c.value = w.score; c.numFmt = '0"%"'; c.border = border; c.alignment = { horizontal: "center" }; applyBandCell(c, w.score);
    const d = row.getCell(4); d.value = BAND_META[w.band].label; d.border = border; d.alignment = { horizontal: "center" }; applyBandCell(d, w.score, BAND_META[w.band].label);
    if (i % 2 === 1) { a.fill = fillStripe(); b.fill = fillStripe(); }
  });
  ps.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 4 } };
  applyAutoFit(ps, 12, 36);

  // ---------------- Score Band Legend sheet ----------------
  const ls = wb.addWorksheet("Score Band Legend");
  ls.properties.tabColor = { argb: X.navy };
  titleBand(ls, 1, 4, "Score Band & Workbook Colour Rules");
  ["Rule", "Range / Value", "Colour", "Meaning"].forEach((h, i) => {
    const cell = ls.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: X.white } };
    cell.fill = fill(X.navy);
    cell.border = border;
    cell.alignment = { horizontal: i === 3 ? "left" : "center", wrapText: true };
  });
  const legendRows = [
    ["Performance band", "Strong: 85–100%", "Green", BAND_META.strong.desc, 90],
    ["Performance band", "Moderate: 70–84%", "Lime", BAND_META.moderate.desc, 75],
    ["Performance band", "Weak: 50–69%", "Amber", BAND_META.weak.desc, 60],
    ["Performance band", "Critical: <50%", "Red", BAND_META.critical.desc, 40],
    ["Answer value", "Yes", "Green text", "Positive / standard met.", null],
    ["Answer value", "No", "Red text", "Gap requiring follow-up.", null],
    ["Answer value", "Partly", "Amber text", "Partial compliance or incomplete implementation.", null],
    ["Answer value", "N/A", "Grey text", "Not applicable to this visit.", null],
  ];
  legendRows.forEach((r, i) => {
    const row = ls.getRow(i + 3);
    r.slice(0, 4).forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v as string;
      cell.border = border;
      cell.alignment = { horizontal: ci === 3 ? "left" : "center", wrapText: true };
      cell.font = { color: { argb: X.ink } };
      if (i % 2 === 1) cell.fill = fillStripe();
    });
    if (typeof r[4] === "number") applyBandCell(row.getCell(3), r[4] as number, String(r[2]));
    else applyAnswerRule(row.getCell(2), r[1] as string);
  });
  applyAutoFit(ls, 14, 58);

  // ---------------- Question Index sheet ----------------
  const qi = wb.addWorksheet("Question Index");
  qi.properties.tabColor = { argb: X.amber };
  titleBand(qi, 1, 4, "Question Index — Exported Checklist Columns");
  ["Section", "Field Name", "Column Header", "Question Type"].forEach((h, i) => {
    const cell = qi.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: X.white } };
    cell.fill = fill(X.navy);
    cell.border = border;
    cell.alignment = { horizontal: i === 2 ? "left" : "center", wrapText: true };
  });
  fieldCols.forEach((c, i) => {
    const row = qi.getRow(i + 3);
    [c.section || "Checklist", c.key, c.label, c.type || "field"].forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.border = border;
      cell.alignment = { horizontal: ci === 2 ? "left" : "center", wrapText: true };
      cell.font = { color: { argb: X.ink } };
      if (i % 2 === 1) cell.fill = fillStripe();
    });
  });
  qi.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } };
  applyAutoFit(qi, 14, 60);

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `SARMAAN_ACSM_Submissions_${stamp}.xlsx`,
  );
}

function fillStripe(): ExcelJS.Fill {
  return fill(X.stripe);
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function titleBand(ws: ExcelJS.Worksheet, rowNum: number, colCount: number, text: string) {
  ws.mergeCells(rowNum, 1, rowNum, colCount);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 16, bold: true, color: { argb: X.white } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  cell.fill = fill(X.navy);
  ws.getRow(rowNum).height = 30;
}

function subtitleBand(ws: ExcelJS.Worksheet, rowNum: number, colCount: number, text: string) {
  ws.mergeCells(rowNum, 1, rowNum, colCount);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: X.white } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  cell.fill = fill(X.green);
  ws.getRow(rowNum).height = 20;
}

function legendBand(ws: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  ws.mergeCells(rowNum, 1, rowNum, colCount);
  const cell = ws.getCell(rowNum, 1);
  cell.value = "Score bands: Strong 85–100% (green) · Moderate 70–84% (lime) · Weak 50–69% (amber) · Critical <50% (red). Answer colours: Yes green, No red, Partly amber, N/A grey.";
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.white } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  cell.fill = fill(X.teal);
  ws.getRow(rowNum).height = 22;
}

function bandFill(score: number): string {
  const band = bandOf(score);
  if (band === "strong") return X.green;
  if (band === "moderate") return X.lime;
  if (band === "weak") return X.amber;
  return X.red;
}

function applyBandCell(cell: ExcelJS.Cell, score: number, label?: string) {
  if (label !== undefined) cell.value = label;
  cell.fill = fill(bandFill(score));
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.white } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function applyAnswerRule(cell: ExcelJS.Cell, value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return;
  if (v === "yes") {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.green } };
    cell.fill = fill(X.greenSoft);
  } else if (v === "no") {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.red } };
    cell.fill = fill(X.redSoft);
  } else if (v === "partly") {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.amber } };
    cell.fill = fill(X.amberSoft);
  } else if (v === "n/a" || v === "na") {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: X.gray } };
    cell.fill = fill(X.graySoft);
  }
}

function applyAutoFit(ws: ExcelJS.Worksheet, min = 10, max = 50) {
  ws.columns.forEach((col) => {
    let width = min;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const text = typeof raw === "object" && raw !== null && "richText" in raw
        ? ""
        : String((raw as any)?.text ?? raw ?? "");
      width = Math.max(width, ...text.split(/\n/g).map((part) => Math.min(max, part.length + 2)));
    });
    col.width = Math.min(max, Math.max(min, width));
  });
}

function alignFor(c: Col, value: unknown): "left" | "center" | "right" {
  if (typeof value === "number" || NUMERIC_FIELDS.has(c.key)) return "right";
  if (["textarea", "text"].includes(String(c.type)) && String(value || "").length > 40) return "left";
  return "center";
}

function formatAnswer(raw: unknown, c: Col): string | number {
  if (raw == null || raw === "") return "";
  if (NUMERIC_FIELDS.has(c.key)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (Array.isArray(raw)) return raw.map((v) => formatPrimitive(v)).join(", ");
  if (typeof raw === "object") {
    const maybeGps = raw as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
    const lat = Number(maybeGps.lat ?? maybeGps.latitude);
    const lng = Number(maybeGps.lng ?? maybeGps.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    return JSON.stringify(raw);
  }
  const text = String(raw);
  if (c.key === ACSM_FIELD.supervisorSignature && text.startsWith("data:image")) return "Signature captured";
  if (text.startsWith("data:image") && text.length > 80) return "Image captured";
  return text;
}

function formatPrimitive(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function inverseScore(value: number): number {
  if (value <= 5) return 95;
  if (value <= 10) return 75;
  if (value <= 20) return 60;
  return 40;
}

function readGps(s: AcsmSub, maps: Record<string, NameToId>): { lat: number; lng: number } | null {
  const m = maps[s.formId];
  const id = m?.get(ACSM_FIELD.gps);
  const raw = (id && s.data && (s.data as any)[id]) || (s.data as any)?.[ACSM_FIELD.gps];
  const lat = Number((raw as any)?.lat), lng = Number((raw as any)?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
