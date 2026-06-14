// NTD Treatment Data Cleaner — column schemas & validation rule definitions
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

// Rule discriminated union consumed by the validation engine.
export type Rule =
  | { t: "required"; col: string; severity?: Severity }
  | { t: "year"; col: string }
  | { t: "date"; col: string }
  | { t: "dateGte"; col: string; ref: string } // col date >= ref date
  | { t: "int"; col: string } // integer, >= 0
  | { t: "num"; col: string } // numeric, >= 0
  | { t: "sum"; col: string; parts: string[] } // col == sum(parts)
  | { t: "lte"; col: string; ref: string; soft?: boolean } // col <= value of ref col
  | { t: "usedLteRec"; used: string; rec: string; drug: string }
  | { t: "balance"; bal: string; rec: string; used: string; lost: string; drug: string }
  | { t: "ratio"; col: string; used: string; total: string; min: number; max: number; drug: string }
  | { t: "coverage"; col: string; treated: string; census: string; threshold: number }
  | { t: "geocov"; col: string; treated: string }
  | { t: "disease"; col: string; accepted: string[] };

export interface MdaConfig {
  id: MdaTypeId;
  label: string;
  sheet: string; // workbook sheet name
  diseaseAccepted: string[];
  coverageThreshold: number;
  columns: ColumnDef[];
  rules: Rule[];
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

// Shared geo/date + census/treatment rules
function commonRules(accepted: string[], threshold: number): Rule[] {
  return [
    { t: "required", col: "Reporting Year" },
    { t: "year", col: "Reporting Year" },
    { t: "required", col: "Target Disease(s)" },
    { t: "disease", col: "Target Disease(s)", accepted },
    { t: "required", col: "Start Date" },
    { t: "date", col: "Start Date" },
    { t: "required", col: "End Date" },
    { t: "date", col: "End Date" },
    { t: "dateGte", col: "End Date", ref: "Start Date" },
    { t: "required", col: "State" },
    { t: "required", col: "LGA" },
    { t: "required", col: "Ward" },
    { t: "required", col: "FLHF", severity: "high" },
    { t: "required", col: "Community" },
  ];
}

const DISABILITY_COLS = [
  "Visually impaired (Census)",
  "Hearing impaired (Census)",
  "Lymphoedema (Census)",
  "Other forms of disability (Census)",
];

function censusRules(): Rule[] {
  const out: Rule[] = [
    { t: "int", col: "No. of Males (Census)" },
    { t: "int", col: "No. of Females (Census)" },
    { t: "sum", col: "Total Census", parts: ["No. of Males (Census)", "No. of Females (Census)"] },
    { t: "int", col: "No. of Households/Arms of class" },
    { t: "int", col: "Total Children 0 - 4 Year (Census)" },
    { t: "int", col: "Total Children 5 - 14 Year (Census)" },
    { t: "int", col: "Total Persons Aged 15 Years and Above (Census)" },
  ];
  DISABILITY_COLS.forEach((col) => {
    out.push({ t: "int", col });
    out.push({ t: "lte", col, ref: "Total Census", soft: true });
  });
  out.push({ t: "int", col: "Hydrocele (Census)" });
  return out;
}

function treatRules(): Rule[] {
  return [
    { t: "int", col: "Total Males 5-14 Years Treated" },
    { t: "int", col: "Total Females 5 -14 Years Treated" },
    { t: "sum", col: "Total 5 -14 Years Treated", parts: ["Total Males 5-14 Years Treated", "Total Females 5 -14 Years Treated"] },
    { t: "int", col: "Total Males 15 Years Above Treated" },
    { t: "int", col: "Total Females 15 Years and Above Treated" },
    { t: "sum", col: "Total 15 Years and Above Treated", parts: ["Total Males 15 Years Above Treated", "Total Females 15 Years and Above Treated"] },
    { t: "sum", col: "Total Treated", parts: ["Total 5 -14 Years Treated", "Total 15 Years and Above Treated"] },
    { t: "lte", col: "Total Treated", ref: "Total Census" },
    { t: "int", col: "Number of Households/Arms of Class where at least one person was treated." },
    { t: "lte", col: "Number of Households/Arms of Class where at least one person was treated.", ref: "No. of Households/Arms of class", soft: true },
  ];
}

function cddRules(): Rule[] {
  return [
    { t: "int", col: "No. of Male CDDs" },
    { t: "int", col: "No. of Female CDDs" },
    { t: "sum", col: "Total CDDs", parts: ["No. of Male CDDs", "No. of Female CDDs"] },
    { t: "int", col: "Total No. of CDDs Trained" },
  ];
}

const EXTRA_COUNTS: ColumnDef[] = [
  c("Number of absentees", "int"),
  c("Number of refusals", "int"),
  c("Children 0-4 years", "int"),
  c("Sick", "int"),
  c("Stunted Growth", "int"),
  c("Pregnant", "int"),
];

function extraCountRules(): Rule[] {
  return EXTRA_COUNTS.map((x) => ({ t: "int", col: x.key } as Rule));
}

function drugBlock(drug: string, rec: string, used: string, lost: string, bal: string): { cols: ColumnDef[]; rules: Rule[] } {
  return {
    cols: [c(rec, "int"), c(used, "int"), c(lost, "int"), c(bal, "calc")],
    rules: [
      { t: "int", col: rec },
      { t: "int", col: used },
      { t: "usedLteRec", used, rec, drug },
      { t: "int", col: lost },
      { t: "balance", bal, rec, used, lost, drug },
    ],
  };
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
  const rules: Rule[] = [
    ...commonRules(["ONCHO Only", "Onchocerciasis", "ONCHO"], 80),
    ...censusRules(), ...treatRules(), ...extraCountRules(), ...ivm.rules,
    { t: "geocov", col: "Geographic Coverage (%)", treated: "Total Treated" },
    { t: "coverage", col: "Therapeutic Coverage (%)", treated: "Total Treated", census: "Total Census", threshold: 80 },
    ...cddRules(),
    { t: "ratio", col: "IVM Drug Ratio", used: "Number of IVM Used", total: "Total Treated", min: 1.0, max: 3.5, drug: "IVM" },
  ];
  return { id: "ONCHO", label: "ONCHO Only", sheet: "ONCHO Only", diseaseAccepted: ["ONCHO Only", "Onchocerciasis", "ONCHO"], coverageThreshold: 80, columns, rules };
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
  const rules: Rule[] = [
    ...commonRules(accepted, threshold), ...censusRules(), ...treatRules(), ...extraCountRules(),
    ...ivm.rules, ...alb.rules,
    { t: "geocov", col: "Geographic Coverage (%)", treated: "Total Treated" },
    { t: "coverage", col: "Therapeutic Coverage (%)", treated: "Total Treated", census: "Total Census", threshold },
    ...cddRules(),
    { t: "ratio", col: ratioIvmLabel, used: "Number of IVM Used", total: "Total Treated", min: 1.0, max: 3.5, drug: "IVM" },
    { t: "ratio", col: ratioAlbLabel, used: "Number of ALB Used", total: "Total Treated", min: 0.95, max: 1.05, drug: "ALB" },
  ];
  return { id, label, sheet, diseaseAccepted: accepted, coverageThreshold: threshold, columns, rules };
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
  const rules: Rule[] = [
    ...commonRules(accepted, 75), ...censusRules(), ...treatRules(),
    { t: "int", col: "Total Number of Adverse Events" },
    { t: "lte", col: "Total Number of Adverse Events", ref: "Total Treated", soft: true },
    { t: "int", col: "Number of cases referred to health the health facility" },
    { t: "lte", col: "Number of cases referred to health the health facility", ref: "Total Number of Adverse Events", soft: true },
    ...extraCountRules(), ...pzq.rules,
    ...(meb ? meb.rules : []),
    { t: "geocov", col: "Geographic Coverage (%)", treated: "Total Treated" },
    { t: "coverage", col: "Therapeutic Coverage (%)", treated: "Total 5 -14 Years Treated", census: "Total Children 5 - 14 Year (Census)", threshold: 75 },
    ...cddRules(),
    { t: "ratio", col: "PZQ Drug Ratio", used: "Number of PZQ Used", total: "Total Treated", min: 2.0, max: 3.0, drug: "PZQ" },
    ...(withMeb ? [{ t: "ratio", col: "MEB Drug Ratio", used: "Number of MEB Used", total: "Total Treated", min: 0.95, max: 1.05, drug: "MEB" } as Rule] : []),
  ];
  return { id, label, sheet, diseaseAccepted: accepted, coverageThreshold: 75, columns, rules };
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
  const rules: Rule[] = [
    ...commonRules(accepted, 80),
    { t: "int", col: "No. of Males (Census)" },
    { t: "int", col: "No. of Females (Census)" },
    { t: "sum", col: "Total Census", parts: ["No. of Males (Census)", "No. of Females (Census)"] },
    { t: "int", col: "No. of Households/Arms of class" },
    { t: "int", col: "Total Children 0 - 5 Months (Census)" },
    { t: "int", col: "Total Children 6 Months - 6 Years (Census)" },
    { t: "int", col: "Total Children 7 - 14 Years (Census)" },
    { t: "int", col: "Persons 15 Years and Above (Census)" },
    { t: "int", col: "Visually impaired (Census)" },
    { t: "lte", col: "Visually impaired (Census)", ref: "Total Census", soft: true },
    { t: "int", col: "Hearing impaired (Census)" },
    { t: "lte", col: "Hearing impaired (Census)", ref: "Total Census", soft: true },
    { t: "int", col: "Lymphoedema (Census)" },
    { t: "lte", col: "Lymphoedema (Census)", ref: "Total Census", soft: true },
    { t: "int", col: "Hydrocele (Census)" },
    { t: "int", col: "Other forms of disability (Census)" },
    { t: "lte", col: "Other forms of disability (Census)", ref: "Total Census", soft: true },
    { t: "int", col: "Visually impaired" },
    { t: "lte", col: "Visually impaired", ref: "Visually impaired (Census)", soft: true },
    { t: "int", col: "Hearing impaired" },
    { t: "lte", col: "Hearing impaired", ref: "Hearing impaired (Census)", soft: true },
    { t: "int", col: "Lymphoedema" },
    { t: "lte", col: "Lymphoedema", ref: "Lymphoedema (Census)", soft: true },
    { t: "int", col: "Hydrocele" },
    { t: "lte", col: "Hydrocele", ref: "Hydrocele (Census)", soft: true },
    { t: "int", col: "Others" },
    { t: "lte", col: "Others", ref: "Other forms of disability (Census)", soft: true },
    { t: "int", col: "Total treated with AZT Tabs (7 years and above) (Male)" },
    { t: "int", col: "Total treated with AZT Tabs (7 years and above) (Female)" },
    { t: "sum", col: "Total treated with AZT tabs", parts: ["Total treated with AZT Tabs (7 years and above) (Male)", "Total treated with AZT Tabs (7 years and above) (Female)"] },
    { t: "int", col: "Total treated with AZT POS (6 months to 6 years) (Male)" },
    { t: "int", col: "Total treated with AZT POS (6 months to 6 years) (Female)" },
    { t: "int", col: "Total treated with AZT POS (7 years and above) (Male)" },
    { t: "int", col: "Total treated with AZT POS (7 years and above) (Female)" },
    { t: "sum", col: "Total treated with AZT POS", parts: ["Total treated with AZT POS (6 months to 6 years) (Male)", "Total treated with AZT POS (6 months to 6 years) (Female)", "Total treated with AZT POS (7 years and above) (Male)", "Total treated with AZT POS (7 years and above) (Female)"] },
    { t: "int", col: "Total treated with TEO (0-5 Months) (Male)" },
    { t: "int", col: "Total treated with TEO (0-5 Months) (Female)" },
    { t: "int", col: "Total treated with TEO (6 months to 6 years) (Male)" },
    { t: "int", col: "Total treated with TEO (6 months to 6 years) (Female)" },
    { t: "int", col: "Total treated with TEO (7 years and above) (Male)" },
    { t: "int", col: "Total treated with TEO (7 years and above) (Female)" },
    { t: "sum", col: "Total treated with TEO", parts: ["Total treated with TEO (0-5 Months) (Male)", "Total treated with TEO (0-5 Months) (Female)", "Total treated with TEO (6 months to 6 years) (Male)", "Total treated with TEO (6 months to 6 years) (Female)", "Total treated with TEO (7 years and above) (Male)", "Total treated with TEO (7 years and above) (Female)"] },
    { t: "int", col: "Visually impaired - Total Treated" },
    { t: "int", col: "Hearing impaired - Total Treated" },
    { t: "int", col: "Lymphoedema - Total Treated" },
    { t: "int", col: "Hydrocele - Total Treated" },
    { t: "int", col: "Other forms of disability- Total Treated" },
    { t: "int", col: "Number of Households treated" },
    { t: "lte", col: "Number of Households treated", ref: "No. of Households/Arms of class", soft: true },
    { t: "sum", col: "Total Treated", parts: ["Total treated with AZT tabs", "Total treated with AZT POS", "Total treated with TEO"] },
    { t: "lte", col: "Total Treated", ref: "Total Census" },
    { t: "int", col: "Adverse Events - Total number" },
    { t: "lte", col: "Adverse Events - Total number", ref: "Total Treated", soft: true },
    { t: "int", col: "No. Of cases referred to the health facility" },
    { t: "lte", col: "No. Of cases referred to the health facility", ref: "Adverse Events - Total number", soft: true },
    { t: "int", col: "AZT - Received" },
    { t: "int", col: "AZT - Used" },
    { t: "usedLteRec", used: "AZT - Used", rec: "AZT - Received", drug: "AZT" },
    { t: "int", col: "AZT - Wasted" },
    { t: "balance", bal: "AZT- Remaining", rec: "AZT - Received", used: "AZT - Used", lost: "AZT - Wasted", drug: "AZT" },
    { t: "num", col: "POS - Received" },
    { t: "num", col: "POS - Used" },
    { t: "usedLteRec", used: "POS - Used", rec: "POS - Received", drug: "POS" },
    { t: "num", col: "POS - Wasted" },
    { t: "balance", bal: "POS- Remaining", rec: "POS - Received", used: "POS - Used", lost: "POS - Wasted", drug: "POS" },
    { t: "int", col: "TEO - Received" },
    { t: "int", col: "TEO - Used" },
    { t: "usedLteRec", used: "TEO - Used", rec: "TEO - Received", drug: "TEO" },
    { t: "int", col: "TEO - Wasted" },
    { t: "balance", bal: "TEO - Remaining", rec: "TEO - Received", used: "TEO - Used", lost: "TEO - Wasted", drug: "TEO" },
    { t: "int", col: "Number of CDDs (Male)" },
    { t: "int", col: "Number of CDDs (Female)" },
    { t: "sum", col: "Total Number of CDDs", parts: ["Number of CDDs (Male)", "Number of CDDs (Female)"] },
    { t: "int", col: "Number of Trained CDDs" },
    { t: "geocov", col: "Geographic Coverage (%)", treated: "Total Treated" },
    { t: "coverage", col: "Therapeutic Coverage (%)", treated: "Total Treated", census: "Total Census", threshold: 80 },
    { t: "ratio", col: "AZT Tabs Drug Ratio", used: "AZT - Used", total: "Total treated with AZT tabs", min: 3.0, max: 4.0, drug: "AZT Tabs" },
    { t: "ratio", col: "AZT POS Drug Ratio", used: "POS - Used", total: "Total treated with AZT POS", min: 4.0, max: 10.0, drug: "AZT POS" },
    { t: "ratio", col: "TEO Drug Ratio", used: "TEO - Used", total: "Total treated with TEO", min: 1.8, max: 2.2, drug: "TEO" },
  ];
  return { id: "TRACHOMA", label: "Trachoma", sheet: "Trachoma", diseaseAccepted: accepted, coverageThreshold: 80, columns, rules };
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
