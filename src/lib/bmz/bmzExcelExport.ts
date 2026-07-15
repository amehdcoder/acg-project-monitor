import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { BmzRow } from "@/hooks/useBmzDashboard";
import {
  CADRE_OPTIONS, REFRESHER_OPTIONS, PRIMARY_ACTIVITIES,
  AVAIL_OPTIONS, CHALLENGE_ITEMS,
  cadreLabel, refresherLabel, availLabel, readinessBand,
} from "@/lib/bmz/definition";

const NAVY = "FF0B3D2E";
const GREEN = "FF0F6B52";
const TEAL = "FF14B8A6";
const AMBER = "FFF59E0B";
const CRIMSON = "FFDC2626";
const HEADER_TEXT = "FFFFFFFF";
const STRIPE = "FFEFF7F3";
const SOFT_STRIPE = "FFF6FBF8";
const BORDER_COLOR = "FFCFE3D8";
const TEXT = "FF13322A";

const border = {
  top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
};

const yesNo = (v: any) => (v === true ? "Yes" : v === false ? "No" : "—");
const dateStr = (v: any) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};
const activitiesStr = (arr: string[] | null) =>
  !arr || !arr.length
    ? "—"
    : arr.map((k) => PRIMARY_ACTIVITIES.find((a) => a.key === k)?.label || k).join("; ");
const challengesStr = (arr: BmzRow["challenges"]) =>
  !arr || !arr.length
    ? "—"
    : arr
        .map((c) => {
          const l = CHALLENGE_ITEMS.find((x) => x.key === c.type)?.label || c.type;
          return c.explain ? `${l}: ${c.explain}` : l;
        })
        .join("; ");

interface Column {
  key: string;
  header: string;
  width: number;
  numeric?: boolean;
  extract: (r: BmzRow, i: number) => any;
}

const COLUMNS: Column[] = [
  { key: "sn", header: "S/N", width: 6, numeric: true, extract: (_r, i) => i + 1 },
  { key: "date", header: "Date of visit", width: 13, extract: (r) => dateStr(r.date_of_visit) },
  { key: "state", header: "State", width: 12, extract: (r) => r.state || "—" },
  { key: "lga", header: "LGA", width: 16, extract: (r) => r.lga || "—" },
  { key: "ward", header: "Community / Ward", width: 22, extract: (r) => r.community_ward || "—" },
  { key: "supervisor", header: "State supervisor", width: 20, extract: (r) => r.state_supervisor || "—" },
  { key: "cadre", header: "Cadre", width: 16, extract: (r) => cadreLabel(r.cadre || "") },
  { key: "sex", header: "Sex", width: 8, extract: (r) => (r.sex ? r.sex[0].toUpperCase() + r.sex.slice(1) : "—") },
  { key: "trained", header: "Trained on eye care", width: 12, extract: (r) => yesNo(r.trained_eye_care) },
  { key: "lastTrain", header: "Last training date", width: 14, extract: (r) => dateStr(r.last_training_date) },
  { key: "refresh", header: "Refresher status", width: 14, extract: (r) => refresherLabel(r.refresher_status || "") },
  { key: "activities", header: "Primary activities", width: 44, extract: (r) => activitiesStr(r.primary_activities) },
  { key: "facility", header: "Linked facility", width: 24, extract: (r) => r.linked_facility || "—" },
  { key: "kits", header: "Screening kits", width: 18, extract: (r) => availLabel(r.screening_kits || "") },
  { key: "poster", header: "Eye poster", width: 18, extract: (r) => availLabel(r.eye_poster || "") },
  { key: "register", header: "Register up to date", width: 12, extract: (r) => yesNo(r.register_updated) },
  { key: "refEvid", header: "Referral evidence", width: 12, extract: (r) => yesNo(r.referrals_evidence) },
  { key: "numRef", header: "# Referrals", width: 10, numeric: true, extract: (r) => r.num_referrals ?? 0 },
  { key: "screened", header: "# Screened", width: 10, numeric: true, extract: (r) => r.total_screened ?? 0 },
  { key: "gatherings", header: "# Gatherings", width: 10, numeric: true, extract: (r) => r.gatherings_count ?? 0 },
  { key: "challenges", header: "Challenges", width: 42, extract: (r) => challengesStr(r.challenges) },
  { key: "compliance", header: "Compliance %", width: 12, numeric: true, extract: (r) => r.compliance_score ?? 0 },
  { key: "band", header: "Readiness band", width: 12, extract: (r) => readinessBand(r.compliance_score ?? 0).label },
  { key: "lat", header: "GPS Lat", width: 12, numeric: true, extract: (r) => r.gps_lat ?? "" },
  { key: "lng", header: "GPS Lng", width: 12, numeric: true, extract: (r) => r.gps_lng ?? "" },
  { key: "status", header: "Status", width: 10, extract: (r) => r.status || "—" },
  { key: "created", header: "Submitted at", width: 18, extract: (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : "—") },
];

// ---------- Analysis helpers ----------
function computeKeyFindings(rows: BmzRow[]) {
  const total = rows.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const trained = rows.filter((r) => r.trained_eye_care).length;
  const refresherDone = rows.filter((r) => r.refresher_status === "done").length;
  const kitsInUse = rows.filter((r) => r.screening_kits === "in_use").length;
  const kitsMissing = rows.filter((r) => r.screening_kits === "not_available").length;
  const postersInUse = rows.filter((r) => r.eye_poster === "in_use").length;
  const registerOk = rows.filter((r) => r.register_updated).length;
  const referralOk = rows.filter((r) => r.referrals_evidence).length;
  const referralsMade = rows.reduce((s, r) => s + (r.num_referrals ?? 0), 0);
  const screened = rows.reduce((s, r) => s + (r.total_screened ?? 0), 0);
  const avgComp = total ? Math.round(rows.reduce((s, r) => s + (r.compliance_score ?? 0), 0) / total) : 0;

  const lgaMap = new Map<string, { n: number; comp: number }>();
  rows.forEach((r) => {
    const k = r.lga || "—";
    const c = lgaMap.get(k) || { n: 0, comp: 0 };
    c.n += 1;
    c.comp += r.compliance_score ?? 0;
    lgaMap.set(k, c);
  });
  const lgaStats = [...lgaMap.entries()].map(([lga, v]) => ({
    lga, visits: v.n, avgCompliance: Math.round(v.comp / v.n),
  }));
  const topCoverage = [...lgaStats].sort((a, b) => b.visits - a.visits).slice(0, 5);
  const weakest = [...lgaStats].sort((a, b) => a.avgCompliance - b.avgCompliance).slice(0, 5);

  return {
    total, trained, trainedPct: pct(trained), refresherDone, refresherDonePct: pct(refresherDone),
    kitsInUse, kitsInUsePct: pct(kitsInUse), kitsMissing, kitsMissingPct: pct(kitsMissing),
    postersInUse, postersInUsePct: pct(postersInUse),
    registerOk, registerOkPct: pct(registerOk), referralOk, referralOkPct: pct(referralOk),
    referralsMade, screened,
    referralRate: screened ? Math.round((referralsMade / screened) * 100) : 0,
    avgComp, lgaStats, topCoverage, weakest,
  };
}

function narrativeFindings(k: ReturnType<typeof computeKeyFindings>): string[] {
  const out: string[] = [];
  out.push(
    `${k.total} monitoring visits captured across ${k.lgaStats.length} LGA(s) in Jigawa State, ` +
      `with an average compliance index of ${k.avgComp}% — the state currently sits in the "${readinessBand(k.avgComp).label}" readiness band.`,
  );
  out.push(
    `Workforce readiness: ${k.trainedPct}% of visited cadres are trained on primary eye care ` +
      `and ${k.refresherDonePct}% have completed a refresher — indicating ${k.refresherDonePct < 50 ? "an urgent" : "a manageable"} refresher gap.`,
  );
  out.push(
    `Screening kits are actively in use in ${k.kitsInUsePct}% of visits, while ${k.kitsMissingPct}% report kits as "not available" — ` +
      `procurement should prioritise the ${k.weakest.length ? k.weakest[0].lga : ""} corridor first.`,
  );
  out.push(
    `Service throughput: ${k.screened.toLocaleString()} persons screened yielded ${k.referralsMade.toLocaleString()} referrals ` +
      `(referral rate ${k.referralRate}%), with documentary evidence of referral in ${k.referralOkPct}% of visits.`,
  );
  if (k.topCoverage.length) {
    out.push(
      `Coverage leaders (by visits): ${k.topCoverage.map((l) => `${l.lga} (${l.visits})`).join(", ")}.`,
    );
  }
  if (k.weakest.length) {
    out.push(
      `Compliance hotspots to support: ${k.weakest.map((l) => `${l.lga} — ${l.avgCompliance}%`).join(", ")}.`,
    );
  }
  return out;
}

// ---------- Styled sheet builders ----------
function paintTitle(ws: ExcelJS.Worksheet, cols: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: HEADER_TEXT } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: "Calibri", size: 10, italic: true, color: { argb: HEADER_TEXT } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  ws.getRow(2).height = 20;
}

export async function exportJigawaEyeHealthWorkbook(rows: BmzRow[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities · Jigawa Eye Health Monitoring";
  wb.created = new Date();

  const visits = rows.filter((r) => r.status === "sent" || r.status === "finalized");
  const k = computeKeyFindings(visits);

  // ============================================================
  // Sheet 1 — Executive Findings
  // ============================================================
  const fs = wb.addWorksheet("Executive Findings", {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: { defaultRowHeight: 18 },
  });
  paintTitle(fs, 4, "Jigawa Eye Health Monitoring — Executive Findings",
    `${visits.length} monitoring visit(s) analysed · exported ${new Date().toLocaleString()}`);

  // KPI band
  const kpis: [string, string, string][] = [
    ["Monitoring visits", String(k.total), GREEN],
    ["Avg compliance", `${k.avgComp}%`, readinessBand(k.avgComp).color.replace("#", "FF")],
    ["Trained on eye care", `${k.trainedPct}%`, TEAL],
    ["Referral rate", `${k.referralRate}%`, AMBER],
  ];
  const kpiRowLabels = fs.getRow(4);
  const kpiRowValues = fs.getRow(5);
  kpis.forEach(([label, value, color], i) => {
    const c1 = kpiRowLabels.getCell(i + 1);
    c1.value = label;
    c1.font = { bold: true, color: { argb: HEADER_TEXT }, size: 10 };
    c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c1.alignment = { horizontal: "center", vertical: "middle" };
    c1.border = border;

    const c2 = kpiRowValues.getCell(i + 1);
    c2.value = value;
    c2.font = { bold: true, size: 22, color: { argb: NAVY } };
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT_STRIPE } };
    c2.alignment = { horizontal: "center", vertical: "middle" };
    c2.border = border;
  });
  kpiRowLabels.height = 22;
  kpiRowValues.height = 46;
  for (let i = 1; i <= 4; i++) fs.getColumn(i).width = 26;

  // Narrative findings
  let cursor = 7;
  fs.mergeCells(cursor, 1, cursor, 4);
  const h = fs.getCell(cursor, 1);
  h.value = "Key findings";
  h.font = { bold: true, size: 12, color: { argb: HEADER_TEXT } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  h.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  fs.getRow(cursor).height = 22;
  cursor += 1;

  narrativeFindings(k).forEach((line, i) => {
    fs.mergeCells(cursor, 1, cursor, 4);
    const c = fs.getCell(cursor, 1);
    c.value = `• ${line}`;
    c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
    c.font = { size: 11, color: { argb: TEXT } };
    if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
    c.border = border;
    fs.getRow(cursor).height = 42;
    cursor += 1;
  });

  // ============================================================
  // Sheet 2 — Submissions dataset
  // ============================================================
  const ws = wb.addWorksheet("Submissions", {
    views: [{ state: "frozen", ySplit: 3, xSplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  const colCount = COLUMNS.length;
  paintTitle(ws, colCount, "Jigawa Eye Health Monitoring — Full Submissions Dataset",
    `${rows.length} record(s) · ${visits.length} sent/finalised · exported ${new Date().toLocaleString()}`);

  const header = ws.getRow(3);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  header.height = 34;

  rows.forEach((r, ri) => {
    const row = ws.getRow(ri + 4);
    COLUMNS.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const value = c.extract(r, ri);
      cell.value = c.numeric && value !== "" && value != null ? Number(value) : value;
      cell.font = { size: 10, color: { argb: TEXT } };
      cell.alignment = c.numeric
        ? { horizontal: "right", vertical: "top" }
        : { horizontal: "left", vertical: "top", wrapText: true };
      cell.border = border;
      if (c.key === "compliance") {
        const v = Number(value) || 0;
        const bandColor = readinessBand(v).color.replace("#", "FF");
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandColor } };
        cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 10 };
        cell.numFmt = '0"%"';
      } else if (c.key === "band") {
        const bandColor = readinessBand(r.compliance_score ?? 0).color.replace("#", "FF");
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandColor } };
        cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 10 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      }
    });
  });

  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };

  // ============================================================
  // Sheet 3 — LGA performance
  // ============================================================
  const ls = wb.addWorksheet("LGA Performance", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  paintTitle(ls, 4, "Jigawa Eye Health — LGA Performance Matrix",
    "Visits, coverage and average compliance by Local Government Area");

  const lgaHeader = ls.getRow(3);
  ["LGA", "Visits", "Avg compliance %", "Readiness band"].forEach((h2, i) => {
    const c = lgaHeader.getCell(i + 1);
    c.value = h2;
    c.font = { bold: true, color: { argb: HEADER_TEXT } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = border;
  });
  lgaHeader.height = 28;

  const sortedLga = [...k.lgaStats].sort((a, b) => b.visits - a.visits);
  sortedLga.forEach((l, i) => {
    const row = ls.getRow(i + 4);
    const bandColor = readinessBand(l.avgCompliance).color.replace("#", "FF");
    const cellA = row.getCell(1); cellA.value = l.lga;
    cellA.alignment = { horizontal: "left", indent: 1 };
    const cellB = row.getCell(2); cellB.value = l.visits;
    cellB.alignment = { horizontal: "center" };
    const cellC = row.getCell(3); cellC.value = l.avgCompliance;
    cellC.numFmt = '0"%"';
    cellC.alignment = { horizontal: "center" };
    cellC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandColor } };
    cellC.font = { bold: true, color: { argb: HEADER_TEXT } };
    const cellD = row.getCell(4); cellD.value = readinessBand(l.avgCompliance).label;
    cellD.alignment = { horizontal: "center" };
    cellD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandColor } };
    cellD.font = { bold: true, color: { argb: HEADER_TEXT } };
    [cellA, cellB, cellC, cellD].forEach((c) => (c.border = border));
    if (i % 2 === 1 && cellA.fill == null) {
      cellA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      cellB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
    }
  });
  ls.getColumn(1).width = 24;
  ls.getColumn(2).width = 12;
  ls.getColumn(3).width = 18;
  ls.getColumn(4).width = 18;

  // ============================================================
  // Sheet 4 — Cadre / activities / challenges rollup
  // ============================================================
  const rs = wb.addWorksheet("Program Rollup");
  paintTitle(rs, 3, "Jigawa Eye Health — Program Rollup",
    "Cadre performance, primary activities and reported challenges");

  const writeTable = (
    title: string, headers: string[], rows2: (string | number)[][], startRow: number,
  ) => {
    rs.mergeCells(startRow, 1, startRow, headers.length);
    const t = rs.getCell(startRow, 1);
    t.value = title;
    t.font = { bold: true, color: { argb: HEADER_TEXT }, size: 12 };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    t.alignment = { horizontal: "left", indent: 1 };
    rs.getRow(startRow).height = 22;

    const hr = rs.getRow(startRow + 1);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: HEADER_TEXT } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    rows2.forEach((r, ri) => {
      const row = rs.getRow(startRow + 2 + ri);
      r.forEach((v, ci) => {
        const c = row.getCell(ci + 1);
        c.value = v;
        c.border = border;
        c.alignment = { horizontal: ci === 0 ? "left" : "center", indent: ci === 0 ? 1 : 0 };
        if (ri % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      });
    });
    return startRow + 2 + rows2.length + 2;
  };

  let row = 4;
  // Cadre performance
  const cadreRows = CADRE_OPTIONS.map((c) => {
    const sub = visits.filter((v) => v.cadre === c.value);
    const avg = sub.length ? Math.round(sub.reduce((s, v) => s + (v.compliance_score ?? 0), 0) / sub.length) : 0;
    return [c.label, sub.length, `${avg}%`];
  });
  row = writeTable("Cadre performance", ["Cadre", "Visits", "Avg compliance"], cadreRows, row);

  // Refresher
  const refRows = REFRESHER_OPTIONS.map((o) => {
    const n = visits.filter((v) => v.refresher_status === o.value).length;
    const pct = visits.length ? Math.round((n / visits.length) * 100) : 0;
    return [o.label, n, `${pct}%`];
  });
  row = writeTable("Refresher training status", ["Status", "Count", "Share"], refRows, row);

  // Availability
  const avOptRows: (string | number)[][] = [];
  (["screening_kits", "eye_poster"] as const).forEach((field) => {
    AVAIL_OPTIONS.forEach((o) => {
      const n = visits.filter((v) => v[field] === o.value).length;
      const pct = visits.length ? Math.round((n / visits.length) * 100) : 0;
      avOptRows.push([
        field === "screening_kits" ? "Screening kits" : "Eye posters",
        o.label, `${n} (${pct}%)`,
      ]);
    });
  });
  row = writeTable("Material availability", ["Material", "Status", "Visits (share)"], avOptRows, row);

  // Activities
  const actRows = PRIMARY_ACTIVITIES.map((a) => {
    const n = visits.filter((v) => (v.primary_activities || []).includes(a.key)).length;
    const pct = visits.length ? Math.round((n / visits.length) * 100) : 0;
    return [a.label, n, `${pct}%`];
  });
  row = writeTable("Primary activities coverage", ["Activity", "Visits", "Share"], actRows, row);

  // Challenges
  const chRows = CHALLENGE_ITEMS.map((c) => {
    const n = visits.filter((v) => (v.challenges || []).some((x) => x.type === c.key)).length;
    const pct = visits.length ? Math.round((n / visits.length) * 100) : 0;
    return [c.label, n, `${pct}%`];
  }).filter((r) => (r[1] as number) > 0);
  if (chRows.length) row = writeTable("Reported challenges", ["Challenge", "Visits", "Share"], chRows, row);

  rs.getColumn(1).width = 36;
  rs.getColumn(2).width = 14;
  rs.getColumn(3).width = 18;

  // ============================================================
  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Jigawa_Eye_Health_Monitoring_${stamp}.xlsx`,
  );
}
