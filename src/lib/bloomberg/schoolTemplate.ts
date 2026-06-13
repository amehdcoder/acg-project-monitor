// Bloomberg School Eye Health Project — School & Baseline import/export template.
//
// Produces a branded, EMPTY .xlsx template (FMoH / HANDS / Amehnities logos) with
// human-friendly column headers, drop-down validations and an instructions sheet.
// The Owner / Super Admin fills it offline and re-imports; the importer upserts
// BOTH the location cascade (bloomberg_schools) and the hidden baseline figures
// (bloomberg_school_baselines).
//
// The importer accepts EITHER the friendly headers produced here OR the legacy
// machine headers, so older exported files keep working.

import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CLASSES, normalizeMissingLabel } from "@/lib/bloomberg/definition";

import fmohLogo from "@/assets/logo-fmoh.png";
import amehLogo from "@/assets/logo-amehnities.png";

// Exact machine column order, matching the reference Schools.csv.
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

// Human-friendly, understandable header label for every machine column.
const classLabel = new Map(ALL_CLASSES.map((c) => [c.key, c.label]));
const COLUMN_LABELS: Record<string, string> = {
  name: "School ID (Unique Key)",
  label: "Display Name",
  state: "State Code",
  lga: "LGA Code",
  ward: "Ward Code",
  location: "Community Code",
  state_label: "State",
  lga_label: "LGA",
  ward_label: "Ward",
  location_label: "Community / Location",
  school_code: "School Code",
  school_name: "School Name",
  school_type: "School Type",
  school_level: "School Level",
  ownership: "Ownership",
  baseline_scope: "Baseline Scope",
  source_file: "Source File",
  source_sheet: "Source Sheet",
  total_male_baseline: "Total Boys (Baseline)",
  total_female_baseline: "Total Girls (Baseline)",
  grand_total_baseline: "Grand Total (Baseline)",
  data_quality_flag: "Data Quality Flag",
  baseline_notes: "Notes",
};
// Friendly labels for the per-class baseline columns, e.g. "P1 — Boys".
BASELINE_COLS.forEach((c) => {
  const key = c.replace(/_(male|female|total)_baseline$/, "");
  const sex = c.endsWith("_male_baseline") ? "Boys" : c.endsWith("_female_baseline") ? "Girls" : "Total";
  COLUMN_LABELS[c] = `${classLabel.get(key) || key.toUpperCase()} — ${sex}`;
});

const friendly = (machine: string) => COLUMN_LABELS[machine] || machine;

// Normalisation used to match a header cell back to a machine column name,
// tolerant of friendly labels, casing, spacing and punctuation.
const normalizeKey = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Reverse lookup: normalized(friendly OR machine) -> machine column name.
const HEADER_LOOKUP: Record<string, string> = {};
COLUMNS.forEach((m) => {
  HEADER_LOOKUP[normalizeKey(m)] = m;
  HEADER_LOOKUP[normalizeKey(friendly(m))] = m;
});

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

/** Build & download the branded, EMPTY school/baseline template for filling. */
export async function exportSchoolTemplate(): Promise<number> {
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

  // ---- Header row (friendly labels) ----
  const header = ws.getRow(HEADER_ROW);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = friendly(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2340" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E3A5F" } },
      bottom: { style: "thin", color: { argb: "FF1E3A5F" } },
      left: { style: "thin", color: { argb: "FF1E3A5F" } },
      right: { style: "thin", color: { argb: "FF1E3A5F" } },
    };
  });
  header.height = 34;
  COLUMNS.forEach((c, i) => {
    const len = friendly(c).length;
    ws.getColumn(i + 1).width = Math.min(Math.max(len + 2, 12), 26);
  });

  const colIndex = (name: string) => COLUMNS.indexOf(name as any) + 1;

  // ---- Empty fill rows with subtle banding so it reads cleanly ----
  const BLANK_ROWS = 400;
  const lastRow = HEADER_ROW + BLANK_ROWS;
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    const row = ws.getRow(i);
    row.height = 18;
    if ((i - HEADER_ROW) % 2 === 0) {
      COLUMNS.forEach((_, ci) => {
        row.getCell(ci + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
      });
    }
  }

  // ---- Validations (drop-downs + whole numbers) ----
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
  help.columns = [{ width: 28 }, { width: 92 }];
  const note = (a: string, b: string) => help.addRow([a, b]);
  note("Column", "Guidance");
  help.getRow(1).font = { bold: true };
  help.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2340" } };
  help.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  note("School ID (Unique Key)", "Unique school key. Use a NEW UPPERCASE_KEY to ADD a school; reuse an existing key to UPDATE it.");
  note("Display Name", "Friendly display name shown in pickers (e.g. \"Abbas Primary Sch. — Alkaleri\").");
  note("State / LGA / Ward / Community", "Type the human names in the labelled columns. The lower-case *Code* columns are optional machine codes.");
  note("School Name", "Required. The official name of the school.");
  note("School Type", "One of: " + SCHOOL_TYPES.join(", "));
  note("School Level", "One of: " + SCHOOL_LEVELS.join(", "));
  note("Ownership", "Public or Private.");
  note("Class columns (P1 — Boys, etc.)", "LEA baseline enrolment by class & sex. Hidden from field validators — admin only.");
  note("Totals", "Total / Grand Total columns are recalculated automatically on import — you may leave them blank.");
  note("Notes", "Any free-text remarks about this school's baseline figures.");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bloomberg_School_Baseline_Template_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return BLANK_ROWS;
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

  // Locate header row by matching cells (friendly OR machine) to "name" + "school_name".
  let headerRowNum = 0;
  const colMap: Record<string, number> = {};
  for (let i = 1; i <= Math.min(ws.rowCount, 20); i++) {
    const row = ws.getRow(i);
    const map: Record<string, number> = {};
    row.eachCell((cell, col) => {
      const machine = HEADER_LOOKUP[normalizeKey(cell.value)];
      if (machine) map[machine] = col;
    });
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
    if (!key) { errors.push(`Row ${i}: missing "School ID (Unique Key)" — skipped.`); continue; }
    if (!schoolName) { errors.push(`Row ${i}: missing "School Name" — skipped.`); continue; }

    schoolRows.push({
      school_key: key,
      label: normalizeMissingLabel(norm(get(row, "label"))) || null,
      state: norm(get(row, "state")) || null,
      lga: norm(get(row, "lga")) || null,
      ward: norm(get(row, "ward")) || null,
      location: norm(get(row, "location")) || null,
      state_label: normalizeMissingLabel(norm(get(row, "state_label"))) || null,
      lga_label: normalizeMissingLabel(norm(get(row, "lga_label"))) || null,
      ward_label: normalizeMissingLabel(norm(get(row, "ward_label"))) || null,
      location_label: normalizeMissingLabel(norm(get(row, "location_label"))) || null,
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
