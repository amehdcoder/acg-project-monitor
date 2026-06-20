// NTDs Microplan — branded Excel template (export blank + filled) with
// dropdown validations for controlled fields, mirroring the polished Bloomberg
// school template. The header row keeps the exact friendly labels so the
// existing importer in MicroplanningView continues to work unchanged.

import ExcelJS from "exceljs";

import fmohLogo from "@/assets/logo-fmoh.png";
import amehLogo from "@/assets/logo-amehnities.png";
import handsLogo from "@/assets/hands-emblem.png";

// Exact template column headers matching the NTDs Microplan Template.
export const TEMPLATE_HEADERS = [
  "Year of Microplanning",
  "Source of Population Data",
  "State",
  "LGA",
  "Ward",
  "Name of FLHF",
  "Name of FLHF In-charge",
  "Phone Number of FLHF In-charge",
  "Name of Community",
  "Name of Community Leader",
  "Phone Number of Community Leader",
  "Distance of Community to FLHF (KM)",
  "Name of Settlements",
  "Name of Mai Unguwa",
  "Distance of Settlement to FLHF (KM)",
  "Type of Terrain",
  "Accessibility",
  "Security Clearance",
  "Estimated Total Population",
  "Estimated Population of Children 5 - 14 Years Old",
  "Estimated Population of Adults 15 years and above",
  "Estimated Population of Children 0 - 4 Years Old",
  "Number of HHs",
  "Trachoma: 0-5 Months",
  "Trachoma: 6 Months - 6 Years",
  "Trachoma: 7 - 14 Years",
  "Trachoma: 15+ Years",
  "Name(s) of CDD",
  "Phone Number(s) of CDD(s)",
  "Is CDD from Community/Settlement",
  "Community Latitude",
  "Community Longitude",
  "FLHF Latitude",
  "FLHF Longitude",
  "Settlement Latitude",
  "Settlement Longitude",
  "Campaign Type",
  "Notes",
] as const;

export const REQUIRED_HEADERS = new Set<string>([
  "State", "LGA", "Ward", "Name of FLHF", "Name of Community",
]);

const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba",
  "Yobe","Zamfara",
];

// Controlled-vocabulary dropdowns — values match what the app stores so imports
// stay consistent and accurate.
const LIST_VALIDATIONS: Record<string, string[]> = {
  "State": NIGERIA_STATES,
  "Source of Population Data": [
    "census", "projected", "community_leader", "health_facility",
    "household_listing", "survey", "other",
  ],
  "Type of Terrain": ["flat", "hilly", "mountainous", "riverine", "swampy", "desert", "forest"],
  "Accessibility": ["accessible", "hard_to_reach", "inaccessible", "seasonal"],
  "Security Clearance": ["cleared", "partial", "not_cleared", "unknown"],
  "Is CDD from Community/Settlement": ["Yes", "No"],
  "Campaign Type": ["ntd", "polio", "malaria", "routine_immunization", "covid19", "nutrition", "other"],
};

// Whole-number fields.
const INTEGER_HEADERS = new Set<string>([
  "Year of Microplanning",
  "Estimated Total Population",
  "Estimated Population of Children 5 - 14 Years Old",
  "Estimated Population of Adults 15 years and above",
  "Estimated Population of Children 0 - 4 Years Old",
  "Number of HHs",
  "Trachoma: 0-5 Months",
  "Trachoma: 6 Months - 6 Years",
  "Trachoma: 7 - 14 Years",
  "Trachoma: 15+ Years",
]);

// Decimal fields (distances + coordinates).
const DECIMAL_HEADERS = new Set<string>([
  "Distance of Community to FLHF (KM)",
  "Distance of Settlement to FLHF (KM)",
  "Community Latitude", "Community Longitude",
  "FLHF Latitude", "FLHF Longitude",
  "Settlement Latitude", "Settlement Longitude",
]);

const HEADER_ROW = 5; // logos + title occupy rows 1-4
const BLANK_ROWS = 500;

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export interface ExportMicroplanOptions {
  filled?: boolean;
  /** Each entry already mapped to header → value (string/number/null). */
  dataRows?: (string | number | null)[][];
  fileName?: string;
}

/** Build & download the branded NTDs Microplan workbook (blank or filled). */
export async function exportMicroplanWorkbook(opts: ExportMicroplanOptions = {}): Promise<void> {
  const { filled = false, dataRows = [], fileName } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — HANDS Nigeria";
  wb.created = new Date();
  const ws = wb.addWorksheet("Microplan", {
    views: [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 5 }],
  });

  // ---- Logo banner ----
  const [fmoh, ameh, hands] = await Promise.all([
    fetchImage(fmohLogo), fetchImage(amehLogo), fetchImage(handsLogo),
  ]);
  const addLogo = (buf: ArrayBuffer | null, col: number) => {
    if (!buf) return;
    const id = wb.addImage({ buffer: buf as any, extension: "png" });
    ws.addImage(id, { tl: { col, row: 0.1 }, ext: { width: 66, height: 66 } });
  };
  addLogo(fmoh, 0);
  addLogo(hands, 2);
  addLogo(ameh, TEMPLATE_HEADERS.length - 2);

  ws.mergeCells(1, 5, 1, TEMPLATE_HEADERS.length - 3);
  const title = ws.getCell(1, 5);
  title.value = "NTDs MICROPLAN TEMPLATE";
  title.font = { bold: true, size: 15, color: { argb: "FF0C5A3A" } };
  title.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  ws.mergeCells(2, 5, 3, TEMPLATE_HEADERS.length - 3);
  const subtitle = ws.getCell(2, 5);
  subtitle.value = "Microplanning based on population of Communities, Settlements and catchment areas";
  subtitle.font = { italic: true, size: 11, color: { argb: "FF4B5563" } };
  subtitle.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 16;
  ws.getRow(4).height = 6;

  // ---- Header row ----
  const header = ws.getRow(HEADER_ROW);
  TEMPLATE_HEADERS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    const required = REQUIRED_HEADERS.has(c);
    cell.value = required ? `${c} *` : c;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0A4A30" } },
      bottom: { style: "thin", color: { argb: "FF0A4A30" } },
      left: { style: "thin", color: { argb: "FF0A4A30" } },
      right: { style: "thin", color: { argb: "FF0A4A30" } },
    };
  });
  header.height = 40;
  TEMPLATE_HEADERS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(c.length + 2, 14), 30);
  });

  // ---- Data / blank rows ----
  const lastRow = HEADER_ROW + (filled ? Math.max(dataRows.length, 1) : BLANK_ROWS);
  if (filled && dataRows.length > 0) {
    dataRows.forEach((vals, idx) => {
      const row = ws.getRow(HEADER_ROW + 1 + idx);
      vals.forEach((v, ci) => {
        row.getCell(ci + 1).value = (v ?? "") as any;
      });
    });
  }
  for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
    const row = ws.getRow(i);
    row.height = 18;
    if ((i - HEADER_ROW) % 2 === 0) {
      TEMPLATE_HEADERS.forEach((_, ci) => {
        const cell = row.getCell(ci + 1);
        if (!cell.fill || (cell.fill as any).pattern === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F7F4" } };
        }
      });
    }
  }

  // ---- Validations ----
  const colOf = (h: string) => TEMPLATE_HEADERS.indexOf(h as any) + 1;
  const applyList = (h: string, list: string[]) => {
    const col = colOf(h);
    if (col < 1) return;
    const letter = ws.getColumn(col).letter;
    const joined = list.join(",");
    if (joined.length > 250) return; // Excel inline-list limit
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${joined}"`],
        showErrorMessage: true, errorTitle: "Invalid value",
        error: "Please pick a value from the dropdown list.",
      };
    }
  };
  Object.entries(LIST_VALIDATIONS).forEach(([h, list]) => applyList(h, list));

  const applyNumber = (h: string, decimal: boolean) => {
    const col = colOf(h);
    if (col < 1) return;
    const letter = ws.getColumn(col).letter;
    for (let i = HEADER_ROW + 1; i <= lastRow; i++) {
      ws.getCell(`${letter}${i}`).dataValidation = {
        type: decimal ? "decimal" : "whole",
        operator: "greaterThanOrEqual", allowBlank: true, formulae: ["0"],
        showErrorMessage: true, errorTitle: "Invalid number",
        error: decimal ? "Enter a number (0 or more)." : "Enter a whole number (0 or more).",
      };
    }
  };
  INTEGER_HEADERS.forEach((h) => applyNumber(h, false));
  // Coordinates can be negative; only validate distances strictly as decimals.
  ["Distance of Community to FLHF (KM)", "Distance of Settlement to FLHF (KM)"].forEach((h) => applyNumber(h, true));

  // ---- Instructions sheet ----
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 40 }, { width: 92 }];
  const head = help.getRow(1);
  head.getCell(1).value = "Column";
  head.getCell(2).value = "Guidance";
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C5A3A" } };
  });
  const note = (a: string, b: string) => {
    const r = help.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true };
  };
  note("Required fields (*)", "State, LGA, Ward, Name of FLHF and Name of Community are mandatory. Rows missing any of these are skipped on import.");
  note("Do not edit headers", "Fill rows below the green header row on the “Microplan” sheet. Renaming or reordering headers will break the import.");
  note("State", "Pick from the dropdown of the 36 states + FCT.");
  note("Source of Population Data", "Choose: census, projected, community_leader, health_facility, household_listing, survey, other.");
  note("Type of Terrain", "Choose: flat, hilly, mountainous, riverine, swampy, desert, forest.");
  note("Accessibility", "Choose: accessible, hard_to_reach, inaccessible, seasonal.");
  note("Security Clearance", "Choose: cleared, partial, not_cleared, unknown.");
  note("Is CDD from Community/Settlement", "Choose Yes or No.");
  note("Campaign Type", "Choose: ntd, polio, malaria, routine_immunization, covid19, nutrition, other.");
  note("Population & Trachoma counts", "Whole numbers only (0 or more).");
  note("Distances (KM)", "Decimal numbers (0 or more), e.g. 3.5.");
  note("Coordinates", "Decimal latitude/longitude (may be negative), e.g. 9.12345.");

  // ---- Download ----
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || (filled ? "Microplan_Data.xlsx" : "NTDs_Microplan_Template_Blank.xlsx");
  a.click();
  URL.revokeObjectURL(url);
}
