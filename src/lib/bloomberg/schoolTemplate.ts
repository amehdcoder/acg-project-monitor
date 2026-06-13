// Bloomberg School Eye Health Project — School & Baseline import/export template.
//
// Produces a branded .xlsx (FMoH / HANDS / Amehnities logos) pre-populated with
// the current school register and LEA baseline figures. The Owner / Super Admin
// can edit it offline and re-import; the importer upserts BOTH the location
// cascade (bloomberg_schools) and the hidden baseline figures
// (bloomberg_school_baselines).

import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CLASSES } from "@/lib/bloomberg/definition";

import fmohLogo from "@/assets/logo-fmoh.png";
import handsLogo from "@/assets/logo-hands.png";
import amehLogo from "@/assets/logo-amehnities.png";

// Exact column order, matching the reference Schools.csv.
const BASELINE_COLS = ALL_CLASSES.flatMap((c) => [
  `${c.key}_male_baseline`,
  `${c.key}_female_baseline`,
  `${c.key}_total_baseline`,
]);

const COLUMNS = [
  "name", "label", "state", "lga", "ward", "location",
  "state_label", "lga_label", "ward_label", "location_label",
  "school_code", "school_name", "school_type", "school_level", "ownership",
  "baseline_scope", "source_file", "source_sheet",
  ...BASELINE_COLS,
  "total_male_baseline", "total_female_baseline", "grand_total_baseline",
  "data_quality_flag", "baseline_notes",
] as const;

const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba",
  "Yobe","Zamfara",
];
const SCHOOL_TYPES = ["Primary", "Junior Secondary", "Primary & Junior Secondary"];
const SCHOOL_LEVELS = ["Primary", "JSS", "Primary & JSS"];
const OWNERSHIP = ["Public", "Private"];

const HEADER_ROW = 5; // logos occupy rows 1-4

const norm = (s: any) => String(s ?? "").trim();
const toInt = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Build & download the branded school/baseline template. */
export async function exportSchoolTemplate(): Promise<number> {
  // Pull schools + baselines (paginated).
  const schools: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("bloomberg_schools")
      .select("*")
      .order("school_name")
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    schools.push(...data);
    if (data.length < 1000) break;
  }
  const baselineMap = new Map<string, any>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("bloomberg_school_baselines")
      .select("*")
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    data.forEach((b: any) => baselineMap.set(b.school_key, b));
    if (data.length < 1000) break;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — Bloomberg School Eye Health Project";
  wb.created = new Date();
  const ws = wb.addWorksheet("Schools", { views: [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 1 }] });

  // ---- Logo banner ----
  const [fmoh, hands, ameh] = await Promise.all([
    fetchImage(fmohLogo), fetchImage(handsLogo), fetchImage(amehLogo),
  ]);
  const addLogo = (buf: ArrayBuffer | null, col: number) => {
    if (!buf) return;
    const id = wb.addImage({ buffer: buf as any, extension: "png" });
    ws.addImage(id, { tl: { col, row: 0.1 }, ext: { width: 70, height: 70 } });
  };
  addLogo(fmoh, 0);
  addLogo(hands, 2);
  addLogo(ameh, 4);
  ws.mergeCells(2, 7, 3, 16);
  const title = ws.getCell(2, 7);
  title.value = "BLOOMBERG SCHOOL EYE HEALTH PROJECT\nSchool Register & Baseline Enrolment Template";
  title.font = { bold: true, size: 13, color: { argb: "FF0C2340" } };
  title.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  // ---- Header row ----
  const header = ws.getRow(HEADER_ROW);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2340" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  header.height = 30;
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.length < 12 ? 14 : Math.min(c.length + 3, 26); });

  const colIndex = (name: string) => COLUMNS.indexOf(name as any) + 1;

  // ---- Data rows ----
  let r = HEADER_ROW + 1;
  schools.forEach((s) => {
    const b = baselineMap.get(s.school_key) || {};
    const row = ws.getRow(r);
    const setVal = (name: string, v: any) => { row.getCell(colIndex(name)).value = v ?? ""; };
    setVal("name", s.school_key);
    setVal("label", s.label);
    setVal("state", s.state); setVal("lga", s.lga); setVal("ward", s.ward); setVal("location", s.location);
    setVal("state_label", s.state_label); setVal("lga_label", s.lga_label);
    setVal("ward_label", s.ward_label); setVal("location_label", s.location_label);
    setVal("school_code", s.school_code); setVal("school_name", s.school_name);
    setVal("school_type", s.school_type); setVal("school_level", s.school_level);
    setVal("ownership", s.ownership); setVal("baseline_scope", s.baseline_scope);
    ALL_CLASSES.forEach((c) => {
      setVal(`${c.key}_male_baseline`, b[`${c.key}_male`] ?? 0);
      setVal(`${c.key}_female_baseline`, b[`${c.key}_female`] ?? 0);
      setVal(`${c.key}_total_baseline`, b[`${c.key}_total`] ?? 0);
    });
    setVal("total_male_baseline", b.total_male ?? 0);
    setVal("total_female_baseline", b.total_female ?? 0);
    setVal("grand_total_baseline", b.grand_total ?? 0);
    setVal("data_quality_flag", b.data_quality_flag);
    setVal("baseline_notes", b.baseline_notes);
    r++;
  });

  // ---- Validations (apply to a generous range) ----
  const lastRow = Math.max(r + 500, HEADER_ROW + 600);
  const listVal = (col: number, list: string[]) => {
    const letter = ws.getColumn(col).letter;
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${list.join(",")}"`],
      };
    }
  };
  listVal(colIndex("state_label"), NIGERIA_STATES);
  listVal(colIndex("school_type"), SCHOOL_TYPES);
  listVal(colIndex("school_level"), SCHOOL_LEVELS);
  listVal(colIndex("ownership"), OWNERSHIP);
  // Whole-number >= 0 for every numeric baseline column.
  [...BASELINE_COLS, "total_male_baseline", "total_female_baseline", "grand_total_baseline"].forEach((c) => {
    const letter = ws.getColumn(colIndex(c)).letter;
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: ["0"],
        showErrorMessage: true, errorTitle: "Invalid number", error: "Enter a whole number (0 or more).",
      };
    }
  });

  // ---- Instructions sheet ----
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 24 }, { width: 90 }];
  const note = (a: string, b: string) => help.addRow([a, b]);
  note("Field", "Guidance");
  help.getRow(1).font = { bold: true };
  note("name", "Unique school key. Leave the existing value to UPDATE a school; use a new UPPERCASE_KEY to ADD one.");
  note("label", "Friendly display name shown in pickers (e.g. \"Abbas Primary Sch. — Alkaleri\").");
  note("state / lga / ward / location", "Lowercase machine codes used by the cascade. *_label columns are what users see.");
  note("school_type", "One of: " + SCHOOL_TYPES.join(", "));
  note("ownership", "Public or Private.");
  note("*_baseline", "LEA baseline enrolment by class & sex. Hidden from field validators — admin only.");
  note("Totals", "total_/grand_total columns are recalculated automatically on import; you may leave them.");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bloomberg_School_Baseline_Template_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return schools.length;
}

export interface SchoolImportResult {
  schools: number;
  baselines: number;
  errors: string[];
}

/** Parse a populated template and upsert schools + baselines. */
export async function importSchoolTemplate(file: File): Promise<SchoolImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Schools") ?? wb.worksheets[0];
  if (!ws) return { schools: 0, baselines: 0, errors: ["No worksheet found."] };

  // Locate header row by finding "name" + "school_name".
  let headerRowNum = 0;
  const colMap: Record<string, number> = {};
  for (let i = 1; i <= Math.min(ws.rowCount, 20); i++) {
    const row = ws.getRow(i);
    const map: Record<string, number> = {};
    row.eachCell((cell, col) => { map[norm(cell.value).toLowerCase()] = col; });
    if (map["name"] && map["school_name"]) {
      headerRowNum = i;
      Object.assign(colMap, map);
      break;
    }
  }
  if (!headerRowNum) {
    return { schools: 0, baselines: 0, errors: ["Could not find the header row. Use the exported template."] };
  }

  const get = (row: ExcelJS.Row, name: string) => {
    const col = colMap[name];
    if (!col) return null;
    const v = row.getCell(col).value;
    if (v && typeof v === "object" && "text" in (v as any)) return (v as any).text;
    if (v && typeof v === "object" && "result" in (v as any)) return (v as any).result;
    return v;
  };

  const schoolRows: any[] = [];
  const baselineRows: any[] = [];
  const errors: string[] = [];

  for (let i = headerRowNum + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const key = norm(get(row, "name"));
    const schoolName = norm(get(row, "school_name"));
    if (!key && !schoolName) continue;
    if (!key) { errors.push(`Row ${i}: missing "name" (school key) — skipped.`); continue; }
    if (!schoolName) { errors.push(`Row ${i}: missing "school_name" — skipped.`); continue; }

    schoolRows.push({
      school_key: key,
      label: norm(get(row, "label")) || null,
      state: norm(get(row, "state")) || null,
      lga: norm(get(row, "lga")) || null,
      ward: norm(get(row, "ward")) || null,
      location: norm(get(row, "location")) || null,
      state_label: norm(get(row, "state_label")) || null,
      lga_label: norm(get(row, "lga_label")) || null,
      ward_label: norm(get(row, "ward_label")) || null,
      location_label: norm(get(row, "location_label")) || null,
      school_code: norm(get(row, "school_code")) || null,
      school_name: schoolName,
      school_type: norm(get(row, "school_type")) || null,
      school_level: norm(get(row, "school_level")) || null,
      ownership: norm(get(row, "ownership")) || null,
      baseline_scope: norm(get(row, "baseline_scope")) || null,
    });

    const b: any = { school_key: key };
    let tm = 0, tf = 0;
    ALL_CLASSES.forEach((c) => {
      const m = toInt(get(row, `${c.key}_male_baseline`)) ?? 0;
      const f = toInt(get(row, `${c.key}_female_baseline`)) ?? 0;
      b[`${c.key}_male`] = m;
      b[`${c.key}_female`] = f;
      b[`${c.key}_total`] = m + f;
      tm += m; tf += f;
    });
    b.total_male = tm;
    b.total_female = tf;
    b.grand_total = tm + tf;
    b.data_quality_flag = norm(get(row, "data_quality_flag")) || null;
    b.baseline_notes = norm(get(row, "baseline_notes")) || null;
    baselineRows.push(b);
  }

  let schoolsUpserted = 0, baselinesUpserted = 0;
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  for (const c of chunk(schoolRows, 300)) {
    const { error } = await supabase.from("bloomberg_schools").upsert(c as any, { onConflict: "school_key" });
    if (error) { errors.push(`Schools: ${error.message}`); break; }
    schoolsUpserted += c.length;
  }
  for (const c of chunk(baselineRows, 300)) {
    const { error } = await supabase.from("bloomberg_school_baselines").upsert(c as any, { onConflict: "school_key" });
    if (error) { errors.push(`Baselines: ${error.message}`); break; }
    baselinesUpserted += c.length;
  }

  return { schools: schoolsUpserted, baselines: baselinesUpserted, errors };
}
