// NTD Treatment Data Cleaner — column schemas & column definitions (no hand-written rules — the neural brain learns "normal")
// per MDA type. Drives the import parser, validation engine and export
// template generator. Column keys are the EXACT header strings used in the
// uploaded MDA Treatment Data Cleaning Template workbook.

export type MdaTypeId =
  | "ONCHO"
  | "LF"
  | "ONCHOLF"
  | "SCH"
  | "SCHSTH"
  | "TRACHOMA";

export type ColType = "text" | "year" | "date" | "int" | "num" | "pct" | "calc";

export interface ColumnDef {
  key: string; // exact header text
  type: ColType;
}

export type Severity = "critical" | "high" | "warning" | "governance";

export interface MdaConfig {
  id: MdaTypeId;
  label: string;
  sheet: string; // workbook sheet name
  diseaseAccepted: string[];
  coverageThreshold: number;
  columns: ColumnDef[];
}

// ── Shared column blocks ──────────────────────────────────────────────────
const c = (key: string, type: ColType): ColumnDef => ({ key, type });

const GEO_DATE: ColumnDef[] = [
  c("Reporting Year", "year"),
  c("Target Disease(s)", "text"),
  c("Start Date", "date"),
  c("End Date", "date"),
  c("State", "text"),
  c("LGA", "text"),
  c("Ward", "text"),
  c("FLHF", "text"),
  c("Community", "text"),
];

const CENSUS_STD: ColumnDef[] = [
  c("No. of Males (Census)", "int"),
  c("No. of Females (Census)", "int"),
  c("Total Census", "calc"),
  c("No. of Households/Arms of class", "int"),
  c("Total Children 0 - 4 Year (Census)", "int"),
  c("Total Children 5 - 14 Year (Census)", "int"),
  c("Total Persons Aged 15 Years and Above (Census)", "int"),
  c("Visually impaired (Census)", "int"),
  c("Hearing impaired (Census)", "int"),
  c("Lymphoedema (Census)", "int"),
  c("Hydrocele (Census)", "int"),
  c("Other forms of disability (Census)", "int"),
];

const TREAT_STD: ColumnDef[] = [
  c("Total Males 5-14 Years Treated", "int"),
  c("Total Females 5 -14 Years Treated", "int"),
  c("Total 5 -14 Years Treated", "calc"),
  c("Total Males 15 Years Above Treated", "int"),
  c("Total Females 15 Years and Above Treated", "int"),
  c("Total 15 Years and Above Treated", "calc"),
  c("Total Treated", "calc"),
  c("Number of Households/Arms of Class where at least one person was treated.", "int"),
];

const CDD_BLOCK: ColumnDef[] = [
  c("No. of Male CDDs", "int"),
  c("No. of Female CDDs", "int"),
  c("Total CDDs", "calc"),
  c("Total No. of CDDs Trained", "int"),
];

const DISABILITY_COLS = [
  "Visually impaired (Census)",
  "Hearing impaired (Census)",
  "Lymphoedema (Census)",
  "Other forms of disability (Census)",
];

const EXTRA_COUNTS: ColumnDef[] = [
  c("Number of absentees", "int"),
  c("Number of refusals", "int"),
  c("Children 0-4 years", "int"),
  c("Sick", "int"),
  c("Stunted Growth", "int"),
  c("Pregnant", "int"),
];

function drugBlock(_drug: string, rec: string, used: string, lost: string, bal: string): { cols: ColumnDef[] } {
  return { cols: [c(rec, "int"), c(used, "int"), c(lost, "int"), c(bal, "calc")] };
}

const COVERAGE_COLS: ColumnDef[] = [
  c("Geographic Coverage (%)", "pct"),
  c("Therapeutic Coverage (%)", "pct"),
];

// ── ONCHO Only ─────────────────────────────────────────────────────────────
function onchoConfig(): MdaConfig {
  const ivm = drugBlock("IVM", "Number of IVM Received", "Number of IVM Used", "Number of IVM Lost", "IVM Balance");
  const columns: ColumnDef[] = [
    ...GEO_DATE, ...CENSUS_STD, ...TREAT_STD,
    ...EXTRA_COUNTS.slice(0, 2), // absentees, refusals
    ...EXTRA_COUNTS.slice(2), // children0-4, sick, stunted, pregnant
    ...ivm.cols,
    ...COVERAGE_COLS,
    ...CDD_BLOCK,
    c("IVM Drug Ratio", "num"),
  ];
  return { id: "ONCHO", label: "ONCHO Only", sheet: "ONCHO Only", diseaseAccepted: ["ONCHO Only", "Onchocerciasis", "ONCHO"], coverageThreshold: 80, columns };
}

// ── LF Only ─────────────────────────────────────────────────────────────────
function lfConfig(ratioIvmLabel = "IVM Ratio", ratioAlbLabel = "ALB Ratio", id: MdaTypeId = "LF", label = "LF Only", sheet = "LF Only", accepted = ["LF Only", "Lymphatic Filariasis", "LF"], threshold = 65): MdaConfig {
  const ivm = drugBlock("IVM", "Number of IVM Received", "Number of IVM Used", "Number of IVM Lost", "IVM Balance");
  const alb = drugBlock("ALB", "Number of ALB Received", "Number of ALB Used", "Number of ALB Lost", "ALB Balance");
  const columns: ColumnDef[] = [
    ...GEO_DATE, ...CENSUS_STD, ...TREAT_STD, ...EXTRA_COUNTS,
    ...ivm.cols, ...alb.cols, ...COVERAGE_COLS, ...CDD_BLOCK,
    c(ratioIvmLabel, "num"), c(ratioAlbLabel, "num"),
  ];
  return { id, label, sheet, diseaseAccepted: accepted, coverageThreshold: threshold, columns };
}

// ── SCH Only ─────────────────────────────────────────────────────────────────
function schConfig(id: MdaTypeId = "SCH", label = "SCH Only", sheet = "SCH Only", accepted = ["SCH Only", "Schistosomiasis", "SCH"], withMeb = false): MdaConfig {
  const pzq = drugBlock("PZQ", "Number of PZQ Received", "Number of PZQ Used", "Number of PZQ Lost", "PZQ Balance");
  const meb = withMeb ? drugBlock("MEB", "Number of MEB Received", "Number of MEB Used", "Number of MEB Lost", "MEB Balance") : null;
  const ae: ColumnDef[] = [
    c("Total Number of Adverse Events", "int"),
    c("Number of cases referred to health the health facility", "int"),
  ];
  const columns: ColumnDef[] = [
    ...GEO_DATE, ...CENSUS_STD, ...TREAT_STD, ...ae, ...EXTRA_COUNTS,
    ...pzq.cols,
    ...(meb ? meb.cols : []),
    ...COVERAGE_COLS, ...CDD_BLOCK,
    c("PZQ Drug Ratio", "num"),
    ...(withMeb ? [c("MEB Drug Ratio", "num")] : []),
  ];
  return { id, label, sheet, diseaseAccepted: accepted, coverageThreshold: 75, columns };
}

// ── Trachoma ─────────────────────────────────────────────────────────────────
function trachomaConfig(): MdaConfig {
  const columns: ColumnDef[] = [
    ...GEO_DATE,
    c("No. of Males (Census)", "int"),
    c("No. of Females (Census)", "int"),
    c("Total Census", "calc"),
    c("No. of Households/Arms of class", "int"),
    c("Total Children 0 - 5 Months (Census)", "int"),
    c("Total Children 6 Months - 6 Years (Census)", "int"),
    c("Total Children 7 - 14 Years (Census)", "int"),
    c("Persons 15 Years and Above (Census)", "int"),
    c("Visually impaired (Census)", "int"),
    c("Hearing impaired (Census)", "int"),
    c("Lymphoedema (Census)", "int"),
    c("Hydrocele (Census)", "int"),
    c("Other forms of disability (Census)", "int"),
    c("Visually impaired", "int"),
    c("Hearing impaired", "int"),
    c("Lymphoedema", "int"),
    c("Hydrocele", "int"),
    c("Others", "int"),
    c("Total treated with AZT Tabs (7 years and above) (Male)", "int"),
    c("Total treated with AZT Tabs (7 years and above) (Female)", "int"),
    c("Total treated with AZT tabs", "calc"),
    c("Total treated with AZT POS (6 months to 6 years) (Male)", "int"),
    c("Total treated with AZT POS (6 months to 6 years) (Female)", "int"),
    c("Total treated with AZT POS (7 years and above) (Male)", "int"),
    c("Total treated with AZT POS (7 years and above) (Female)", "int"),
    c("Total treated with AZT POS", "calc"),
    c("Total treated with TEO (0-5 Months) (Male)", "int"),
    c("Total treated with TEO (0-5 Months) (Female)", "int"),
    c("Total treated with TEO (6 months to 6 years) (Male)", "int"),
    c("Total treated with TEO (6 months to 6 years) (Female)", "int"),
    c("Total treated with TEO (7 years and above) (Male)", "int"),
    c("Total treated with TEO (7 years and above) (Female)", "int"),
    c("Total treated with TEO", "calc"),
    c("Visually impaired - Total Treated", "int"),
    c("Hearing impaired - Total Treated", "int"),
    c("Lymphoedema - Total Treated", "int"),
    c("Hydrocele - Total Treated", "int"),
    c("Other forms of disability- Total Treated", "int"),
    c("Number of Households treated", "int"),
    c("Total Treated", "calc"),
    c("Adverse Events - Total number", "int"),
    c("No. Of cases referred to the health facility", "int"),
    c("AZT - Received", "int"),
    c("AZT - Used", "int"),
    c("AZT - Wasted", "int"),
    c("AZT- Remaining", "calc"),
    c("POS - Received", "num"),
    c("POS - Used", "num"),
    c("POS - Wasted", "num"),
    c("POS- Remaining", "calc"),
    c("TEO - Received", "int"),
    c("TEO - Used", "int"),
    c("TEO - Wasted", "int"),
    c("TEO - Remaining", "calc"),
    c("Number of CDDs (Male)", "int"),
    c("Number of CDDs (Female)", "int"),
    c("Total Number of CDDs", "calc"),
    c("Number of Trained CDDs", "int"),
    c("Geographic Coverage (%)", "pct"),
    c("Therapeutic Coverage (%)", "pct"),
    c("AZT Tabs Drug Ratio", "num"),
    c("AZT POS Drug Ratio", "num"),
    c("TEO Drug Ratio", "num"),
  ];
  const accepted = ["Trachoma"];
  return { id: "TRACHOMA", label: "Trachoma", sheet: "Trachoma", diseaseAccepted: accepted, coverageThreshold: 80, columns };
}

export const MDA_CONFIGS: Record<MdaTypeId, MdaConfig> = {
  ONCHO: onchoConfig(),
  LF: lfConfig(),
  ONCHOLF: lfConfig("IVM Drug Ratio", "ALB Drug Ratio", "ONCHOLF", "ONCHOLF", "ONCHOLF", ["ONCHOLF", "ONCHO + LF", "ONCHOLF Integrated"], 65),
  SCH: schConfig(),
  SCHSTH: schConfig("SCHSTH", "SCHSTH", "SCHSTH", ["SCHSTH", "SCH + STH"], true),
  TRACHOMA: trachomaConfig(),
};

export const MDA_LIST: { id: MdaTypeId; label: string }[] = [
  { id: "ONCHO", label: "ONCHO Only" },
  { id: "LF", label: "LF Only" },
  { id: "ONCHOLF", label: "ONCHOLF (Oncho + LF)" },
  { id: "SCH", label: "SCH Only" },
  { id: "SCHSTH", label: "SCHSTH (Sch + STH)" },
  { id: "TRACHOMA", label: "Trachoma" },
];

// Geographic primary-key columns (duplicate detection).
export const PRIMARY_KEY_COLS = ["Reporting Year", "Target Disease(s)", "State", "LGA", "Ward", "FLHF", "Community"];

// System-generated audit columns appended on export.
export const SYSTEM_COLUMNS = [
  "Row_ID",
  "Import_Batch_ID",
  "Validation_Status",
  "Error_Count",
  "Warning_Count",
  "Cleaning_Log",
  "Original_Row_Hash",
  "Cleaned_Row_Hash",
  "Reviewer_Name",
  "Reviewer_Comment",
];

export const FEEDBACK_AREAS = [
  "Geography",
  "Totals",
  "Coverage",
  "Drug Ratio",
  "Inventory",
  "Duplicates",
  "UI/UX",
  "Export",
] as const;
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];
