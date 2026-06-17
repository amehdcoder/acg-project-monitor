// Builds a beautifully formatted Excel workbook of ALL collected Bloomberg
// School Enrolment Validation data — for download by Systems Admins, Super
// Admins, Owners and Co-owners. Includes accurate baseline (LEA) vs validated
// enrolment figures, per-class breakdown, and any "Not Specified in the LGA
// School Enrolment Dataset" values the validators typed in.

import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_CLASSES, OPERATIONAL_STATUS, NOT_FOUND_REASONS, MISSING_LOCATION_LABEL,
} from "@/lib/bloomberg/definition";

const OP_LABEL = new Map(OPERATIONAL_STATUS.map((r) => [r.value, r.label]));
const REASON_LABEL = new Map(NOT_FOUND_REASONS.map((r) => [r.value, r.label]));

const NAVY = "FF0C2340";
const BLUE = "FF2563EB";
const TEAL = "FF14B8A6";
const PINK = "FFDB2777";
const AMBER = "FFB45309";
const WHITE = "FFFFFFFF";

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

const num = (v: any): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** Resolve the effective location label: prefer the validator-typed "specify"
 * value whenever the chosen option was the "Not Specified…" placeholder. */
const effective = (raw: string | null, specified: string | undefined): { value: string; flagged: boolean } => {
  if (specified && specified.trim()) return { value: specified.trim(), flagged: true };
  return { value: raw || "", flagged: false };
};

export async function exportCollectedData(): Promise<number> {
  const [validations, baselines, profiles] = await Promise.all([
    fetchAll<any>(
      "bloomberg_validations",
      "id,validator_id,school_key,state,lga,ward,location,school_name,school_code,school_type,school_level,ownership,gps_lat,gps_lng,verification,enrolment,specified_locations,total_male,total_female,grand_total,remarks,status,submitted_at,created_at",
    ),
    fetchAll<any>(
      "bloomberg_school_baselines",
      `school_key,total_male,total_female,grand_total,${ALL_CLASSES.map((c) => `${c.key}_total`).join(",")}`,
    ),
    fetchAll<any>("profiles", "user_id,first_name,last_name,email"),
  ]);

  const baselineByKey = new Map<string, any>();
  baselines.forEach((b) => baselineByKey.set(b.school_key, b));
  const nameByUser = new Map<string, string>();
  profiles.forEach((p) => {
    const nm = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "—";
    nameByUser.set(p.user_id, nm);
  });

  // Only export submitted (sent) records — the authoritative collected data.
  const rows = validations
    .filter((v) => v.status === "sent")
    .sort((a, b) =>
      (a.state || "").localeCompare(b.state || "") ||
      (a.lga || "").localeCompare(b.lga || "") ||
      (a.school_name || "").localeCompare(b.school_name || ""),
    );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  const ws = wb.addWorksheet("Collected Data", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
    properties: { defaultRowHeight: 16 },
  });

  // ---- Column plan ----
  type Col = { header: string; width: number; group: string; tone?: string };
  const cols: Col[] = [
    { header: "#", width: 5, group: "Record" },
    { header: "Status", width: 12, group: "Record" },
    { header: "Validator", width: 22, group: "Record" },
    { header: "Date Submitted", width: 18, group: "Record" },
    { header: "State", width: 16, group: "Location" },
    { header: "LGA", width: 16, group: "Location" },
    { header: "Ward", width: 18, group: "Location" },
    { header: "Community / Location", width: 22, group: "Location" },
    { header: "Specified Fields", width: 28, group: "Location" },
    { header: "School Name", width: 30, group: "School" },
    { header: "School Code", width: 14, group: "School" },
    { header: "Type", width: 14, group: "School" },
    { header: "Level", width: 14, group: "School" },
    { header: "Ownership", width: 14, group: "School" },
    { header: "School Exists", width: 13, group: "Verification" },
    { header: "Not-Found Reason", width: 22, group: "Verification" },
    { header: "Operational Status", width: 18, group: "Verification" },
    { header: "Head Teacher", width: 22, group: "Verification" },
    { header: "Phone", width: 16, group: "Verification" },
    { header: "Date of Visit", width: 14, group: "Verification" },
    { header: "Latitude", width: 12, group: "Verification" },
    { header: "Longitude", width: 12, group: "Verification" },
  ];
  // Per-class validated columns (M/F/T)
  ALL_CLASSES.forEach((c) => {
    cols.push({ header: `${c.label} M`, width: 8, group: "Validated Enrolment" });
    cols.push({ header: `${c.label} F`, width: 8, group: "Validated Enrolment" });
    cols.push({ header: `${c.label} T`, width: 8, group: "Validated Enrolment" });
  });
  cols.push({ header: "Validated Male", width: 13, group: "Validated Enrolment" });
  cols.push({ header: "Validated Female", width: 14, group: "Validated Enrolment" });
  cols.push({ header: "Validated Total", width: 14, group: "Validated Enrolment" });
  // Per-class baseline totals
  ALL_CLASSES.forEach((c) => {
    cols.push({ header: `${c.label} (Base)`, width: 9, group: "Baseline Enrolment (LEA)" });
  });
  cols.push({ header: "Baseline Male", width: 13, group: "Baseline Enrolment (LEA)" });
  cols.push({ header: "Baseline Female", width: 14, group: "Baseline Enrolment (LEA)" });
  cols.push({ header: "Baseline Total", width: 14, group: "Baseline Enrolment (LEA)" });
  // Variance
  cols.push({ header: "Variance", width: 12, group: "Variance" });
  cols.push({ header: "Variance %", width: 12, group: "Variance" });
  cols.push({ header: "Validator Remarks", width: 40, group: "Notes" });

  const GROUP_COLOR: Record<string, string> = {
    Record: NAVY,
    Location: BLUE,
    School: "FF0E7490",
    Verification: "FF6D28D9",
    "Validated Enrolment": TEAL,
    "Baseline Enrolment (LEA)": AMBER,
    Variance: PINK,
    Notes: NAVY,
  };

  // Row 1: Title banner
  const totalCols = cols.length;
  ws.mergeCells(1, 1, 1, totalCols);
  const title = ws.getCell(1, 1);
  title.value = `Bloomberg School Enrolment Validation — Collected Data   •   ${rows.length.toLocaleString()} submissions   •   Generated ${new Date().toLocaleString()}`;
  title.font = { bold: true, size: 13, color: { argb: WHITE } };
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
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_COLOR[g] || NAVY } };
    cell.border = { right: { style: "thin", color: { argb: WHITE } } };
    ci += span;
  }
  ws.getRow(2).height = 20;

  // Row 3: Column headers
  const headerRow = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FB" } };
    cell.border = {
      bottom: { style: "medium", color: { argb: GROUP_COLOR[c.group] || NAVY } },
      right: { style: "hair", color: { argb: "FFCBD5E1" } },
    };
    ws.getColumn(i + 1).width = c.width;
  });
  headerRow.height = 30;

  const STATUS_FILL: Record<string, string> = { sent: "FFDCFCE7" };
  const STATUS_FG: Record<string, string> = { sent: "FF15803D" };

  // Data rows
  rows.forEach((v, idx) => {
    const ver = v.verification || {};
    const spec = v.specified_locations || {};
    const enrol = v.enrolment || {};
    const base = v.school_key ? baselineByKey.get(v.school_key) : undefined;

    const st = effective(v.state, spec.state);
    const lg = effective(v.lga, spec.lga);
    const wd = effective(v.ward, spec.ward);
    const lc = effective(v.location, spec.location);
    const schoolNameEff = effective(v.school_name, spec.school);

    const specifiedSummary = Object.entries(spec)
      .filter(([, val]) => val && String(val).trim())
      .map(([k, val]) => `${k[0].toUpperCase()}${k.slice(1)}: ${val}`)
      .join("; ");

    const validatedTotal = num(v.grand_total) ?? 0;
    const baselineTotal = num(base?.grand_total) ?? 0;
    const variance = validatedTotal - baselineTotal;
    const variancePct = baselineTotal > 0 ? (variance / baselineTotal) * 100 : null;

    const data: any[] = [
      idx + 1,
      v.status === "sent" ? "Submitted" : v.status,
      nameByUser.get(v.validator_id) || "—",
      v.submitted_at ? new Date(v.submitted_at).toLocaleString() : "—",
      st.value || "—",
      lg.value || "—",
      wd.value || "—",
      lc.value || "—",
      specifiedSummary || "",
      schoolNameEff.value || "—",
      v.school_code || "—",
      v.school_type || "—",
      v.school_level || "—",
      v.ownership || "—",
      ver.school_exists === "no" ? "No" : ver.school_exists === "yes" ? "Yes" : "—",
      ver.not_found_reason ? (REASON_LABEL.get(ver.not_found_reason) || ver.not_found_reason) : "",
      ver.operational_status ? (OP_LABEL.get(ver.operational_status) || ver.operational_status) : "",
      ver.head_teacher || "",
      ver.head_phone || "",
      ver.date_of_visit || "",
      num(v.gps_lat),
      num(v.gps_lng),
    ];
    ALL_CLASSES.forEach((c) => {
      data.push(num(enrol[c.key]?.male), num(enrol[c.key]?.female),
        (num(enrol[c.key]?.male) ?? 0) + (num(enrol[c.key]?.female) ?? 0));
    });
    data.push(num(v.total_male), num(v.total_female), validatedTotal);
    ALL_CLASSES.forEach((c) => data.push(num(base?.[`${c.key}_total`])));
    data.push(num(base?.total_male), num(base?.total_female), baselineTotal || null);
    data.push(variance, variancePct);
    data.push(v.remarks || "");

    const row = ws.addRow(data);
    row.height = 16;
    const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFF7F9FC";
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { size: 9, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 4 ? "left" : "center", wrapText: colNumber === 9 || colNumber === totalCols };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = { right: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });

    // Status pill color
    const statusCell = row.getCell(2);
    if (STATUS_FILL[v.status]) {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[v.status] } };
      statusCell.font = { size: 9, bold: true, color: { argb: STATUS_FG[v.status] } };
    }

    // Highlight specified location cells (amber) so corrections stand out.
    // State..Location occupy columns 5-8.
    [["state", 5], ["lga", 6], ["ward", 7], ["location", 8]].forEach(([k, col]) => {
      if (spec[k as string] && String(spec[k as string]).trim()) {
        const c = row.getCell(col as number);
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
        c.font = { size: 9, bold: true, color: { argb: AMBER } };
      }
    });
    if (specifiedSummary) {
      const c = row.getCell(9);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      c.font = { size: 9, italic: true, color: { argb: AMBER } };
    }
    if (spec.school && String(spec.school).trim()) {
      const c = row.getCell(10);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      c.font = { size: 9, bold: true, color: { argb: AMBER } };
    }

    // Conditional formatting on variance & variance %
    const vcell = row.getCell(totalCols - 2); // Variance
    const pcell = row.getCell(totalCols - 1); // Variance %
    vcell.numFmt = "#,##0;[Red]-#,##0";
    pcell.numFmt = "0.0%";
    if (variancePct !== null) pcell.value = variancePct / 100;
    const absPct = variancePct === null ? 0 : Math.abs(variancePct);
    let toneFill = "FFFFFFFF", toneFg = "FF1F2937";
    if (baselineTotal === 0) { toneFill = "FFF1F5F9"; toneFg = "FF64748B"; }
    else if (absPct < 2) { toneFill = "FFDCFCE7"; toneFg = "FF15803D"; }
    else if (absPct < 10) { toneFill = "FFFEF9C3"; toneFg = "FF854D0E"; }
    else { toneFill = "FFFEE2E2"; toneFg = "FFB91C1C"; }
    [vcell, pcell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toneFill } };
      c.font = { size: 9, bold: true, color: { argb: toneFg } };
      c.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Format numeric enrolment cells
    for (let col = 23; col <= totalCols - 3; col++) {
      row.getCell(col).numFmt = "#,##0";
    }
    row.getCell(21).numFmt = "0.00000";
    row.getCell(22).numFmt = "0.00000";
  });

  // Totals row
  if (rows.length) {
    const totalRowIdx = ws.rowCount + 1;
    const tRow = ws.getRow(totalRowIdx);
    tRow.getCell(1).value = "TOTAL";
    const valMale = rows.reduce((s, v) => s + (num(v.total_male) ?? 0), 0);
    const valFemale = rows.reduce((s, v) => s + (num(v.total_female) ?? 0), 0);
    const valTotal = rows.reduce((s, v) => s + (num(v.grand_total) ?? 0), 0);
    const baseTotal = rows.reduce((s, v) => {
      const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
      return s + (num(b?.grand_total) ?? 0);
    }, 0);
    const vmCol = totalCols - 3 - 3 - ALL_CLASSES.length - 3 + 1; // not precise; set explicit below
    // Explicit known columns:
    const validatedTotalCol = 22 + ALL_CLASSES.length * 3 + 3; // last of validated block
    tRow.getCell(validatedTotalCol - 2).value = valMale;
    tRow.getCell(validatedTotalCol - 1).value = valFemale;
    tRow.getCell(validatedTotalCol).value = valTotal;
    tRow.getCell(totalCols - 3).value = baseTotal; // Baseline Total
    tRow.getCell(totalCols - 2).value = valTotal - baseTotal;
    tRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.numFmt = "#,##0";
    });
    tRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    tRow.height = 20;
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };

  // ---- Legend sheet ----
  const legend = wb.addWorksheet("Legend");
  legend.columns = [{ width: 32 }, { width: 70 }];
  const lt = legend.getCell(1, 1);
  legend.mergeCells(1, 1, 1, 2);
  lt.value = "How to read this workbook";
  lt.font = { bold: true, size: 13, color: { argb: WHITE } };
  lt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  lt.alignment = { vertical: "middle", indent: 1 };
  legend.getRow(1).height = 26;
  const notes: [string, string][] = [
    ["Amber-highlighted cell", `A value typed in by the validator because the option was "${MISSING_LOCATION_LABEL}".`],
    ["Specified Fields", "Summary of every field the validator had to specify manually."],
    ["Validated Enrolment", "Head-count captured during the field validation (per class, by sex)."],
    ["Baseline Enrolment (LEA)", "Original LEA/school register figures imported as baseline."],
    ["Variance", "Validated Total − Baseline Total (negative = fewer pupils than baseline)."],
    ["Variance % colour", "Green < 2% • Yellow 2–10% • Red ≥ 10% • Grey = no baseline available."],
  ];
  notes.forEach(([k, val], i) => {
    const r = legend.getRow(i + 3);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true, size: 10, color: { argb: NAVY } };
    r.getCell(2).value = val;
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.height = 30;
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `bloomberg-collected-data-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
