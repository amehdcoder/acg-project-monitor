// Lightweight "upload & compute" engine for the Medicine tab.
//
// Users can upload a simple sheet structured as:
//   Year | State | LGA | Ward | FLHF | Community or Settlement | Total Population
// and the engine derives the standard age/condition disaggregations from the
// Total Population so the usual medicine breakdown (proportional distribution +
// drug-per-person ratio) runs without needing the rows pre-saved in the database.
//
// It is built to stay smooth on very large files: parsing is offloaded with
// streaming row iteration and the heavy mapping yields to the event loop in
// chunks so the UI never freezes, regardless of row count.

import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

import fmohLogo from "@/assets/logo-fmoh.png";
import amehLogo from "@/assets/logo-amehnities.png";
import handsLogo from "@/assets/hands-emblem.png";

// ---- Standard demographic proportions (share of total population) ----
// Nigeria age structure (UN/NPC projections, rounded) used to estimate the
// disaggregated cohorts the target-population calculation expects.
export const POP_PROPORTIONS = {
  children_0_4: 0.165,
  children_5_14: 0.26,
  adults_15_plus: 0.575,
  // Trachoma cohorts (TF/TT screening age bands)
  trachoma_0_5_months: 0.012,
  trachoma_6m_6y: 0.155,
  trachoma_7_14y: 0.2,
  trachoma_15_plus: 0.575,
} as const;

export interface UploadedMedicineEntry {
  id: string;
  year_of_microplanning: number;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string;
  estimated_total_population: number;
  estimated_children_0_4: number;
  estimated_children_5_14: number;
  estimated_adults_15_plus: number;
  trachoma_0_5_months: number;
  trachoma_6m_6y: number;
  trachoma_7_14y: number;
  trachoma_15_plus: number;
  __uploaded: true;
}

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Map a normalized header to the canonical column it represents.
function matchHeader(h: string): keyof typeof FIELD_KEYS | null {
  const n = norm(h);
  if (n === "year" || n.includes("yearof")) return "year";
  if (n === "state") return "state";
  if (n === "lga" || n.includes("localgovern")) return "lga";
  if (n === "ward") return "ward";
  if (n === "flhf" || n.includes("nameofflhf") || n.includes("healthfacility") || n === "facility") return "flhf";
  if (n.includes("community") || n.includes("settlement")) return "community";
  if (n.includes("totalpop") || n === "population" || n.includes("estimatedtotal")) return "population";
  return null;
}

const FIELD_KEYS = {
  year: 1, state: 1, lga: 1, ward: 1, flhf: 1, community: 1, population: 1,
} as const;

export const MEDICINE_UPLOAD_HEADERS = [
  "Year",
  "State",
  "LGA",
  "Ward",
  "FLHF",
  "Community or Settlement",
  "Total Population",
] as const;

const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba",
  "Yobe","Zamfara",
];

export interface ParseResult {
  entries: UploadedMedicineEntry[];
  skipped: number;
  total: number;
}

/** Build a single estimated entry from total population. */
function buildEntry(raw: {
  year: any; state: any; lga: any; ward: any; flhf: any; community: any; population: any;
}, idx: number): UploadedMedicineEntry | null {
  const state = String(raw.state ?? "").trim();
  const lga = String(raw.lga ?? "").trim();
  const community = String(raw.community ?? "").trim();
  // Tolerate thousands separators, spaces, currency-like prefixes, and stray
  // characters so values such as "1,234", "1 234", or "1234.0" all parse.
  const cleanedPop = String(raw.population ?? "").replace(/[^0-9.\-]/g, "");
  const pop = Math.max(0, Math.round(Number(cleanedPop) || 0));
  // Require at least State + LGA + a community/settlement + a population.
  if (!state || !lga || !community || pop <= 0) return null;

  const yr = Number(raw.year);
  const p = POP_PROPORTIONS;
  return {
    id: `upload-${idx}`,
    year_of_microplanning: Number.isFinite(yr) && yr > 1900 ? Math.round(yr) : new Date().getFullYear(),
    state,
    lga,
    ward: String(raw.ward ?? "").trim() || "—",
    flhf_name: String(raw.flhf ?? "").trim() || "—",
    community_name: community,
    settlement_name: "—",
    estimated_total_population: pop,
    estimated_children_0_4: Math.round(pop * p.children_0_4),
    estimated_children_5_14: Math.round(pop * p.children_5_14),
    estimated_adults_15_plus: Math.round(pop * p.adults_15_plus),
    trachoma_0_5_months: Math.round(pop * p.trachoma_0_5_months),
    trachoma_6m_6y: Math.round(pop * p.trachoma_6m_6y),
    trachoma_7_14y: Math.round(pop * p.trachoma_7_14y),
    trachoma_15_plus: Math.round(pop * p.trachoma_15_plus),
    __uploaded: true,
  };
}

/**
 * Parse an uploaded medicine file (.xlsx/.xls/.csv). Resilient to extra columns,
 * banner rows, and header ordering. Processes rows in chunks, yielding to the
 * event loop so the UI stays responsive for very large files.
 */
export async function parseMedicineUploadFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ParseResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  // Find header row: the first row (within the first 15) that contains a
  // "Total Population"-like column and at least one of State/LGA.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const matched = row.map((c) => matchHeader(String(c)));
    if (matched.includes("population") && (matched.includes("state") || matched.includes("lga"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "Could not find a header row. Make sure the sheet has columns: Year, State, LGA, Ward, FLHF, Community or Settlement, Total Population.",
    );
  }

  const headerCells = rows[headerIdx];
  const colMap: Partial<Record<keyof typeof FIELD_KEYS, number>> = {};
  headerCells.forEach((c, idx) => {
    const key = matchHeader(String(c));
    if (key && colMap[key] === undefined) colMap[key] = idx;
  });

  const dataRows = rows.slice(headerIdx + 1);
  const total = dataRows.length;
  const entries: UploadedMedicineEntry[] = [];
  let skipped = 0;

  // Forward-fill carry-over for hierarchical columns. Hierarchical microplan
  // sheets frequently MERGE the State/LGA/Ward/FLHF (and sometimes Year/Community)
  // cells across the rows of a group, so only the first row of the group holds a
  // value and the rest are read as blank. Without carry-down those rows are
  // wrongly skipped (losing ~half the communities). We remember the last
  // non-empty value per hierarchical column and reuse it when a cell is blank.
  const carry: Partial<Record<keyof typeof FIELD_KEYS, any>> = {};
  const CARRY_KEYS: (keyof typeof FIELD_KEYS)[] = ["year", "state", "lga", "ward", "flhf"];
  const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === "";
  const pick = (r: any[], key: keyof typeof FIELD_KEYS, fill: boolean) => {
    const idx = colMap[key];
    let v = idx !== undefined ? r[idx] : undefined;
    if (fill) {
      if (!isBlank(v)) carry[key] = v;
      else if (!isBlank(carry[key])) v = carry[key];
    }
    return v;
  };

  const CHUNK = 5000;
  for (let i = 0; i < total; i++) {
    const r = dataRows[i] || [];
    if (!r.some((c) => c !== undefined && c !== null && c !== "")) continue;
    const entry = buildEntry(
      {
        year: pick(r, "year", true),
        state: pick(r, "state", true),
        lga: pick(r, "lga", true),
        ward: pick(r, "ward", true),
        flhf: pick(r, "flhf", true),
        community: pick(r, "community", false),
        population: pick(r, "population", false),
      },
      entries.length,
    );
    if (entry) entries.push(entry);
    else skipped++;

    if (i % CHUNK === CHUNK - 1) {
      onProgress?.(i + 1, total);
      // Yield so the main thread can paint / stay responsive on huge files.
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  onProgress?.(total, total);
  return { entries, skipped, total };
}

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Download a branded, dropdown-validated blank upload template. */
export async function exportMedicineUploadTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — HANDS Nigeria";
  wb.created = new Date();
  const ws = wb.addWorksheet("Population", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  const [fmoh, ameh, hands] = await Promise.all([
    fetchImage(fmohLogo), fetchImage(amehLogo), fetchImage(handsLogo),
  ]);
  const addLogo = (buf: ArrayBuffer | null, col: number) => {
    if (!buf) return;
    const id = wb.addImage({ buffer: buf as any, extension: "png" });
    ws.addImage(id, { tl: { col, row: 0.1 }, ext: { width: 60, height: 60 } });
  };
  addLogo(fmoh, 0);
  addLogo(hands, 2);
  addLogo(ameh, MEDICINE_UPLOAD_HEADERS.length - 1);

  ws.mergeCells(1, 2, 1, MEDICINE_UPLOAD_HEADERS.length - 1);
  const title = ws.getCell(1, 2);
  title.value = "MEDICINE TARGET POPULATION UPLOAD";
  title.font = { bold: true, size: 14, color: { argb: "FF0C5A3A" } };
  title.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  ws.mergeCells(2, 2, 3, MEDICINE_UPLOAD_HEADERS.length - 1);
  const sub = ws.getCell(2, 2);
  sub.value = "Enter Total Population per community/settlement — target population & medicine breakdown are computed automatically.";
  sub.font = { italic: true, size: 10, color: { argb: "FF4B5563" } };
  sub.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(1).height = 26;
  ws.getRow(4).height = 6;

  const HEADER_ROW = 5;
  const header = ws.getRow(HEADER_ROW);
  MEDICINE_UPLOAD_HEADERS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0A4A30" } },
      bottom: { style: "thin", color: { argb: "FF0A4A30" } },
      left: { style: "thin", color: { argb: "FF0A4A30" } },
      right: { style: "thin", color: { argb: "FF0A4A30" } },
    };
  });
  header.height = 32;
  MEDICINE_UPLOAD_HEADERS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(c.length + 4, 14), 30);
  });

  const lastRow = HEADER_ROW + 1000;
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    const row = ws.getRow(i);
    row.height = 18;
    if ((i - HEADER_ROW) % 2 === 0) {
      MEDICINE_UPLOAD_HEADERS.forEach((_, ci) => {
        row.getCell(ci + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F7F4" } };
      });
    }
  }

  // State dropdown
  const stateCol = MEDICINE_UPLOAD_HEADERS.indexOf("State") + 1;
  const stateLetter = ws.getColumn(stateCol).letter;
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    ws.getCell(`${stateLetter}${i}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${NIGERIA_STATES.join(",")}"`],
      showErrorMessage: true, errorTitle: "Invalid value", error: "Pick a state from the list.",
    };
  }
  // Numeric validations for Year & Total Population
  const numCols = ["Year", "Total Population"];
  numCols.forEach((h) => {
    const col = MEDICINE_UPLOAD_HEADERS.indexOf(h as any) + 1;
    const letter = ws.getColumn(col).letter;
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: ["0"],
        showErrorMessage: true, errorTitle: "Invalid number", error: "Enter a whole number (0 or more).",
      };
    }
  });

  // Instructions sheet
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 32 }, { width: 90 }];
  const head = help.getRow(1);
  head.getCell(1).value = "Column";
  head.getCell(2).value = "Guidance";
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } }; });
  const note = (a: string, b: string) => {
    const r = help.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true };
  };
  note("Required", "State, LGA, Community or Settlement and Total Population are required. Rows missing any are skipped.");
  note("Year", "Microplanning year (whole number). Defaults to current year if blank.");
  note("State", "Pick from the dropdown of 36 states + FCT.");
  note("Total Population", "Whole-community population. The app derives target cohorts automatically.");
  note("Computed", "Target population is derived from Total Population using standard age proportions, then medicine is distributed proportionally per the LGA allocation you enter in the Medicine tab.");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Medicine_Target_Population_Upload_Template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Allocation Plan upload — drives the whole Medicine allocation automatically
// from a single uploaded sheet so the admin never has to manually pick the LGA,
// drill down to the ward, or type the medicine allocated and JRSM target.
//
// Expected columns (extra columns / banners / ordering tolerated):
//   State | LGA | Ward | SAC Requiring PC (JRSM-Target People)
//         | Medicine Allocated by Ward | Medicine Allocated by LGA
// ============================================================================

export const ALLOCATION_PLAN_HEADERS = [
  "State",
  "LGA",
  "Ward",
  "SAC Requiring PC (JRSM-Target People)",
  "Medicine Allocated by Ward",
  "Medicine Allocated by LGA",
] as const;

type AllocField = "state" | "lga" | "ward" | "jrsm" | "medWard" | "medLga";

function matchAllocHeader(h: string): AllocField | null {
  const n = norm(h);
  if (n === "state") return "state";
  if (n === "lga" || n.includes("localgovern")) return "lga";
  if (n === "ward") return "ward";
  if (n.includes("sacrequiring") || n.includes("jrsm") || n.includes("targetpeople") || n.includes("targetpop")) return "jrsm";
  if (n.includes("medicineallocatedbyward") || n === "medicinebyward") return "medWard";
  if (n.includes("medicineallocatedbylga") || n === "medicinebylga") return "medLga";
  return null;
}

export interface AllocationPlanRow {
  state: string;
  lga: string;
  ward: string;
  jrsm: number;
  medicineByWard: number;
  medicineByLga: number;
}

export interface AllocationPlanResult {
  rows: AllocationPlanRow[];
  skipped: number;
  total: number;
}

const toNum = (v: any) => {
  const cleaned = String(v ?? "").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/** Parse an uploaded allocation-plan sheet. Tolerant of merged hierarchy cells. */
export async function parseAllocationPlanFile(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<AllocationPlanResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const matched = (rows[i] || []).map((c) => matchAllocHeader(String(c)));
    if (matched.includes("lga") && (matched.includes("medWard") || matched.includes("medLga") || matched.includes("jrsm"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "Could not find a header row. Make sure the sheet has columns: State, LGA, Ward, SAC Requiring PC (JRSM-Target People), Medicine Allocated by Ward, Medicine Allocated by LGA.",
    );
  }

  const colMap: Partial<Record<AllocField, number>> = {};
  (rows[headerIdx] || []).forEach((c, idx) => {
    const key = matchAllocHeader(String(c));
    if (key && colMap[key] === undefined) colMap[key] = idx;
  });

  const dataRows = rows.slice(headerIdx + 1);
  const total = dataRows.length;
  const out: AllocationPlanRow[] = [];
  let skipped = 0;

  // Forward-fill State/LGA (and last LGA-level medicine) across merged cells.
  const carry: Partial<Record<AllocField, any>> = {};
  const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === "";
  const pick = (r: any[], key: AllocField, fill: boolean) => {
    const idx = colMap[key];
    let v = idx !== undefined ? r[idx] : undefined;
    if (fill) {
      if (!isBlank(v)) carry[key] = v;
      else if (!isBlank(carry[key])) v = carry[key];
    }
    return v;
  };

  for (let i = 0; i < total; i++) {
    const r = dataRows[i] || [];
    if (!r.some((c) => c !== undefined && c !== null && c !== "")) continue;
    const state = String(pick(r, "state", true) ?? "").trim();
    const lga = String(pick(r, "lga", true) ?? "").trim();
    const ward = String(pick(r, "ward", false) ?? "").trim();
    const jrsm = Math.round(toNum(pick(r, "jrsm", false)));
    const medicineByWard = Math.round(toNum(pick(r, "medWard", false)));
    const medicineByLga = Math.round(toNum(pick(r, "medLga", true)));
    if (!lga) { skipped++; continue; }
    out.push({ state, lga, ward, jrsm, medicineByWard, medicineByLga });
  }
  onProgress?.(total, total);
  return { rows: out, skipped, total };
}

/** Download a branded, dropdown-validated blank Allocation Plan template. */
export async function exportAllocationPlanTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — HANDS Nigeria";
  wb.created = new Date();
  const ws = wb.addWorksheet("Allocation Plan", { views: [{ state: "frozen", ySplit: 5 }] });

  const [fmoh, ameh, hands] = await Promise.all([
    fetchImage(fmohLogo), fetchImage(amehLogo), fetchImage(handsLogo),
  ]);
  const addLogo = (buf: ArrayBuffer | null, col: number) => {
    if (!buf) return;
    const id = wb.addImage({ buffer: buf as any, extension: "png" });
    ws.addImage(id, { tl: { col, row: 0.1 }, ext: { width: 60, height: 60 } });
  };
  addLogo(fmoh, 0);
  addLogo(hands, 2);
  addLogo(ameh, ALLOCATION_PLAN_HEADERS.length - 1);

  ws.mergeCells(1, 2, 1, ALLOCATION_PLAN_HEADERS.length - 1);
  const title = ws.getCell(1, 2);
  title.value = "MEDICINE ALLOCATION PLAN";
  title.font = { bold: true, size: 14, color: { argb: "FF0C5A3A" } };
  title.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  ws.mergeCells(2, 2, 3, ALLOCATION_PLAN_HEADERS.length - 1);
  const sub = ws.getCell(2, 2);
  sub.value = "Enter the JRSM target and medicine allocated per Ward (or per LGA). The app auto-distributes medicine & expected treatment to every community.";
  sub.font = { italic: true, size: 10, color: { argb: "FF4B5563" } };
  sub.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(1).height = 26;
  ws.getRow(4).height = 6;

  const HEADER_ROW = 5;
  const header = ws.getRow(HEADER_ROW);
  ALLOCATION_PLAN_HEADERS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0A4A30" } },
      bottom: { style: "thin", color: { argb: "FF0A4A30" } },
      left: { style: "thin", color: { argb: "FF0A4A30" } },
      right: { style: "thin", color: { argb: "FF0A4A30" } },
    };
  });
  header.height = 40;
  ALLOCATION_PLAN_HEADERS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(c.length + 2, 14), 30);
  });

  const lastRow = HEADER_ROW + 1000;
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    const row = ws.getRow(i);
    row.height = 18;
    if ((i - HEADER_ROW) % 2 === 0) {
      ALLOCATION_PLAN_HEADERS.forEach((_, ci) => {
        row.getCell(ci + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F7F4" } };
      });
    }
  }

  const stateCol = ALLOCATION_PLAN_HEADERS.indexOf("State" as any) + 1;
  const stateLetter = ws.getColumn(stateCol).letter;
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    ws.getCell(`${stateLetter}${i}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${NIGERIA_STATES.join(",")}"`],
      showErrorMessage: true, errorTitle: "Invalid value", error: "Pick a state from the list.",
    };
  }
  ["SAC Requiring PC (JRSM-Target People)", "Medicine Allocated by Ward", "Medicine Allocated by LGA"].forEach((h) => {
    const col = ALLOCATION_PLAN_HEADERS.indexOf(h as any) + 1;
    const letter = ws.getColumn(col).letter;
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: ["0"],
        showErrorMessage: true, errorTitle: "Invalid number", error: "Enter a whole number (0 or more).",
      };
    }
  });

  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 36 }, { width: 92 }];
  const head = help.getRow(1);
  head.getCell(1).value = "Column";
  head.getCell(2).value = "Guidance";
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } }; });
  const note = (a: string, b: string) => {
    const r = help.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true };
  };
  note("State / LGA / Ward", "Geographic hierarchy. Merged LGA cells are auto carried down.");
  note("SAC Requiring PC (JRSM-Target People)", "People to treat for that Ward (the JRSM target).");
  note("Medicine Allocated by Ward", "Units of medicine allocated to that Ward. Used to auto-build per-ward allocations.");
  note("Medicine Allocated by LGA", "Total units for the LGA (optional). Used when no ward-level allocation is provided.");
  note("Automation", "On upload, the app builds the allocation rows automatically and distributes medicine & expected treatment across every community. No manual selection needed.");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Medicine_Allocation_Plan_Template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
