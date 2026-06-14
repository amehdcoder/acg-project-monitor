// NTD Treatment Data Cleaner — validation & auto-correction engine.
import { MdaConfig, Rule, Severity, PRIMARY_KEY_COLS } from "./schemas";

export type IssueCategory =
  | "Missing primary key"
  | "Missing value"
  | "Invalid disease"
  | "Invalid year"
  | "Date error"
  | "Invalid number"
  | "Total mismatch"
  | "Treatment total mismatch"
  | "Treated exceeds census"
  | "Disability count impossible"
  | "Inventory mismatch"
  | "Drug used exceeds received"
  | "Drug ratio out of range"
  | "Coverage underperformance"
  | "Coverage recalculation"
  | "Geographic coverage"
  | "CDD total mismatch"
  | "Adverse-event inconsistency"
  | "Duplicate row";

export interface CellIssue {
  rowIndex: number;
  col: string;
  category: IssueCategory;
  severity: Severity;
  message: string;
  suggestedFix: string;
  original: any;
  autoFix?: any; // computed corrected value when available
}

export type RowStatus = "Validated" | "Auto-Corrected" | "Needs Review" | "Critical Alert";

export interface RowResult {
  index: number;
  values: Record<string, any>; // current (possibly cleaned) values
  original: Record<string, any>;
  issues: CellIssue[];
  status: RowStatus;
  autoCorrected: boolean;
}

export interface ValidationResult {
  rows: RowResult[];
  issues: CellIssue[];
  kpis: ReturnType<typeof emptyKpis>;
}

function emptyKpis() {
  return {
    totalRows: 0,
    validRows: 0,
    rowsWithIssues: 0,
    criticalIssues: 0,
    autoCorrections: 0,
    dataQualityScore: 0,
    completeness: 0,
    geographicIntegrity: 0,
    drugRatioCompliance: 0,
    inventoryBalanceCompliance: 0,
    duplicatesMerged: 0,
    coveragePassRate: 0,
    drugWastageRate: 0,
    auditTrailCompleteness: 100,
    coverageBuckets: { above: 0, below: 0, critical: 0 },
    issueCategoryCounts: {} as Record<string, number>,
  };
}

// ── value parsing ──────────────────────────────────────────────────────────
export function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function isBlank(v: any) {
  return v === null || v === undefined || String(v).trim() === "";
}
function isInteger(v: any) {
  const n = toNum(v);
  return n !== null && Number.isInteger(n);
}
function parseDate(v: any): Date | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return v;
  // Excel serial number
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const severityForRequired = (col: string): Severity =>
  PRIMARY_KEY_COLS.includes(col) ? "critical" : "high";

// Evaluate a single rule for one row, mutating `values` for auto-fixes.
function evalRule(rule: Rule, idx: number, values: Record<string, any>): CellIssue[] {
  const out: CellIssue[] = [];
  const push = (i: Omit<CellIssue, "rowIndex">) => out.push({ rowIndex: idx, ...i });

  switch (rule.t) {
    case "required": {
      const col = rule.col;
      if (isBlank(values[col])) {
        const sev = rule.severity ?? severityForRequired(col);
        push({
          col,
          category: PRIMARY_KEY_COLS.includes(col) ? "Missing primary key" : "Missing value",
          severity: sev,
          message: `${col} is required but missing`,
          suggestedFix: `Enter a valid ${col}`,
          original: values[col],
        });
      }
      break;
    }
    case "year": {
      const v = values[rule.col];
      if (!isBlank(v)) {
        const n = toNum(v);
        if (n === null || !Number.isInteger(n) || n < 2020 || n > 2035 || String(Math.trunc(n)).length !== 4) {
          push({ col: rule.col, category: "Invalid year", severity: "critical", message: `Reporting Year "${v}" is not a valid 4-digit campaign year (2020–2035)`, suggestedFix: "Select valid campaign reporting year", original: v });
        }
      }
      break;
    }
    case "disease": {
      const v = values[rule.col];
      if (!isBlank(v)) {
        const norm = String(v).trim().toLowerCase();
        const ok = rule.accepted.some((a) => a.toLowerCase() === norm);
        if (!ok) {
          push({ col: rule.col, category: "Invalid disease", severity: "critical", message: `Target Disease "${v}" does not match selected MDA type`, suggestedFix: `Replace with: ${rule.accepted[0]}`, original: v, autoFix: rule.accepted[0] });
        }
      }
      break;
    }
    case "date": {
      const v = values[rule.col];
      if (!isBlank(v) && !parseDate(v)) {
        push({ col: rule.col, category: "Date error", severity: "critical", message: `${rule.col} "${v}" is not a valid date`, suggestedFix: `Enter a valid ${rule.col}`, original: v });
      }
      break;
    }
    case "dateGte": {
      const a = parseDate(values[rule.col]);
      const b = parseDate(values[rule.ref]);
      if (a && b && a < b) {
        push({ col: rule.col, category: "Date error", severity: "critical", message: `${rule.col} is before ${rule.ref}`, suggestedFix: `Correct campaign ${rule.col} (must be ≥ ${rule.ref})`, original: values[rule.col] });
      }
      break;
    }
    case "int":
    case "num": {
      const v = values[rule.col];
      if (!isBlank(v)) {
        const n = toNum(v);
        if (n === null) {
          push({ col: rule.col, category: "Invalid number", severity: "high", message: `${rule.col} "${v}" is not numeric`, suggestedFix: "Convert to a number or verify source", original: v });
        } else if (n < 0) {
          push({ col: rule.col, category: "Invalid number", severity: "high", message: `${rule.col} cannot be negative`, suggestedFix: "Enter a value ≥ 0", original: v, autoFix: Math.abs(n) });
        } else if (rule.t === "int" && !Number.isInteger(n)) {
          push({ col: rule.col, category: "Invalid number", severity: "high", message: `${rule.col} must be a whole number`, suggestedFix: "Round to integer or verify source", original: v, autoFix: Math.round(n) });
        }
      }
      break;
    }
    case "sum": {
      const parts = rule.parts.map((p) => toNum(values[p]));
      if (parts.every((p) => p !== null)) {
        const expected = parts.reduce((a, b) => (a || 0) + (b || 0), 0);
        const actual = toNum(values[rule.col]);
        if (actual === null || actual !== expected) {
          const cat: IssueCategory =
            rule.col === "Total Census"
              ? "Total mismatch"
              : rule.col.includes("CDD")
              ? "CDD total mismatch"
              : "Treatment total mismatch";
          push({ col: rule.col, category: cat, severity: "high", message: `${rule.col} (${actual ?? "blank"}) ≠ sum of components (${expected})`, suggestedFix: `Auto-recalculate to ${expected}`, original: values[rule.col], autoFix: expected });
        }
      }
      break;
    }
    case "lte": {
      const v = toNum(values[rule.col]);
      const ref = toNum(values[rule.ref]);
      if (v !== null && ref !== null && v > ref) {
        if (rule.col === "Total Treated") {
          push({ col: rule.col, category: "Treated exceeds census", severity: "critical", message: `Total Treated (${v}) exceeds Total Census (${ref})`, suggestedFix: "Critical review — verify treated/census; do not silently shrink", original: values[rule.col] });
        } else if (rule.col.toLowerCase().includes("referred") || rule.ref.toLowerCase().includes("adverse")) {
          push({ col: rule.col, category: "Adverse-event inconsistency", severity: "warning", message: `${rule.col} (${v}) exceeds ${rule.ref} (${ref})`, suggestedFix: "Review — referrals may include non-AE cases", original: values[rule.col] });
        } else {
          push({ col: rule.col, category: "Disability count impossible", severity: "warning", message: `${rule.col} (${v}) exceeds ${rule.ref} (${ref})`, suggestedFix: `Verify — should not exceed ${rule.ref}`, original: values[rule.col] });
        }
      }
      break;
    }
    case "usedLteRec": {
      const used = toNum(values[rule.used]);
      const rec = toNum(values[rule.rec]);
      if (used !== null && rec !== null && used > rec) {
        push({ col: rule.used, category: "Drug used exceeds received", severity: "critical", message: `${rule.drug} Used (${used}) exceeds Received (${rec})`, suggestedFix: "Critical alert — investigate drug accountability", original: values[rule.used] });
      }
      break;
    }
    case "balance": {
      const rec = toNum(values[rule.rec]);
      const used = toNum(values[rule.used]);
      const lost = toNum(values[rule.lost]);
      if (rec !== null && used !== null && lost !== null) {
        if (used + lost > rec) {
          push({ col: rule.lost, category: "Drug used exceeds received", severity: "critical", message: `${rule.drug} Used + Lost (${used + lost}) exceeds Received (${rec})`, suggestedFix: "Critical alert — investigate inventory", original: values[rule.lost] });
        }
        const expected = rec - used - lost;
        const actual = toNum(values[rule.bal]);
        if (actual === null || actual !== expected) {
          push({ col: rule.bal, category: "Inventory mismatch", severity: "critical", message: `${rule.drug} Balance (${actual ?? "blank"}) ≠ Received − Used − Lost (${expected})`, suggestedFix: `Auto-recalculate balance to ${expected}`, original: values[rule.bal], autoFix: expected });
        }
      }
      break;
    }
    case "ratio": {
      const used = toNum(values[rule.used]);
      const total = toNum(values[rule.total]);
      if (used !== null && total !== null && total > 0) {
        const expected = +(used / total).toFixed(2);
        const actual = toNum(values[rule.col]);
        if (actual === null || Math.abs(actual - expected) > 0.011) {
          push({ col: rule.col, category: "Drug ratio out of range", severity: "high", message: `${rule.drug} ratio (${actual ?? "blank"}) ≠ Used ÷ Total Treated (${expected})`, suggestedFix: `Recalculate ratio to ${expected}`, original: values[rule.col], autoFix: expected });
        }
        const check = actual !== null ? actual : expected;
        if (check < rule.min || check > rule.max) {
          push({ col: rule.col, category: "Drug ratio out of range", severity: "high", message: `${rule.drug} ratio ${check} is outside SOP range ${rule.min}–${rule.max}`, suggestedFix: "Flag drug accountability review", original: values[rule.col] });
        }
      }
      break;
    }
    case "coverage": {
      const treated = toNum(values[rule.treated]);
      const census = toNum(values[rule.census]);
      if (treated !== null && census !== null && census > 0) {
        const expected = +((treated / census) * 100).toFixed(2);
        const actual = toNum(values[rule.col]);
        if (actual === null || Math.abs(actual - expected) > 0.1) {
          push({ col: rule.col, category: "Coverage recalculation", severity: "high", message: `${rule.col} (${actual ?? "blank"}) ≠ Treated ÷ Census × 100 (${expected})`, suggestedFix: `Recalculate coverage to ${expected}%`, original: values[rule.col], autoFix: expected });
        }
        const eff = actual !== null ? actual : expected;
        if (eff < rule.threshold) {
          push({ col: rule.col, category: "Coverage underperformance", severity: "warning", message: `Therapeutic coverage ${eff}% is below threshold ${rule.threshold}%`, suggestedFix: "Flag for programme review — do not auto-inflate", original: values[rule.col] });
        }
      }
      break;
    }
    case "geocov": {
      const treated = toNum(values[rule.treated]);
      const v = toNum(values[rule.col]);
      if (treated !== null && treated > 0 && v !== 100) {
        push({ col: rule.col, category: "Geographic coverage", severity: "warning", message: `Geographic Coverage should be 100% where treatment occurred (Total Treated ${treated})`, suggestedFix: "Set Geographic Coverage to 100%", original: values[rule.col], autoFix: 100 });
      }
      break;
    }
  }
  return out;
}

const AUTO_FIX_CATEGORIES = new Set<IssueCategory>([
  "Total mismatch",
  "Treatment total mismatch",
  "CDD total mismatch",
  "Inventory mismatch",
  "Coverage recalculation",
  "Geographic coverage",
]);

export function validateDataset(config: MdaConfig, rawRows: Record<string, any>[], opts?: { autoApply?: boolean }): ValidationResult {
  const autoApply = opts?.autoApply ?? true;
  const rows: RowResult[] = [];
  const allIssues: CellIssue[] = [];

  // Duplicate detection
  const seen = new Map<string, number>();

  rawRows.forEach((raw, idx) => {
    const values: Record<string, any> = { ...raw };
    const original: Record<string, any> = { ...raw };
    let issues: CellIssue[] = [];
    for (const rule of config.rules) issues.push(...evalRule(rule, idx, values));

    // Duplicate key check
    const key = PRIMARY_KEY_COLS.map((k) => String(values[k] ?? "").trim().toLowerCase()).join("|");
    if (key.replace(/\|/g, "") !== "") {
      if (seen.has(key)) {
        issues.push({ rowIndex: idx, col: "Community", category: "Duplicate row", severity: "high", message: `Duplicate of row ${(seen.get(key) as number) + 1} (same Year+Disease+State+LGA+Ward+FLHF+Community)`, suggestedFix: "Merge into Golden Row; preserve originals in audit log", original: values["Community"] });
      } else {
        seen.set(key, idx);
      }
    }

    // Apply auto-fixes (for auto-fixable categories with an autoFix value)
    let autoCorrected = false;
    if (autoApply) {
      for (const iss of issues) {
        if (iss.autoFix !== undefined && (AUTO_FIX_CATEGORIES.has(iss.category) || iss.category === "Invalid disease")) {
          values[iss.col] = iss.autoFix;
          autoCorrected = true;
        }
      }
      // Re-validate after auto-fix to drop resolved mismatch issues but keep flags (underperformance, out-of-range)
      if (autoCorrected) {
        const refreshed: CellIssue[] = [];
        for (const rule of config.rules) refreshed.push(...evalRule(rule, idx, values));
        const dup = issues.filter((i) => i.category === "Duplicate row");
        issues = [...refreshed, ...dup];
      }
    }

    const hasCritical = issues.some((i) => i.severity === "critical");
    const hasOther = issues.some((i) => i.severity !== "critical");
    let status: RowStatus;
    if (hasCritical) status = "Critical Alert";
    else if (issues.length > 0 && hasOther) status = autoCorrected ? "Needs Review" : "Needs Review";
    else if (autoCorrected) status = "Auto-Corrected";
    else status = "Validated";
    if (issues.length === 0) status = autoCorrected ? "Auto-Corrected" : "Validated";

    allIssues.push(...issues);
    rows.push({ index: idx, values, original, issues, status, autoCorrected });
  });

  return { rows, issues: allIssues, kpis: computeKpis(config, rows, allIssues) };
}

function computeKpis(config: MdaConfig, rows: RowResult[], issues: CellIssue[]) {
  const k = emptyKpis();
  k.totalRows = rows.length;
  k.validRows = rows.filter((r) => r.status === "Validated").length;
  k.rowsWithIssues = rows.filter((r) => r.issues.length > 0).length;
  k.criticalIssues = issues.filter((i) => i.severity === "critical").length;
  k.autoCorrections = rows.filter((r) => r.autoCorrected).length;
  k.duplicatesMerged = issues.filter((i) => i.category === "Duplicate row").length;

  for (const i of issues) k.issueCategoryCounts[i.category] = (k.issueCategoryCounts[i.category] || 0) + 1;

  // Completeness: non-blank required cells
  const reqCols = config.rules.filter((r) => r.t === "required").map((r: any) => r.col);
  let reqTotal = 0, reqFilled = 0;
  for (const r of rows) for (const col of reqCols) { reqTotal++; if (String(r.values[col] ?? "").trim() !== "") reqFilled++; }
  k.completeness = reqTotal ? +((reqFilled / reqTotal) * 100).toFixed(1) : 100;

  // Geographic integrity: rows without geo issues
  const geoBad = new Set(issues.filter((i) => ["Missing primary key", "Geographic coverage"].includes(i.category)).map((i) => i.rowIndex));
  k.geographicIntegrity = rows.length ? +(((rows.length - geoBad.size) / rows.length) * 100).toFixed(1) : 100;

  // Drug ratio compliance
  const ratioBad = new Set(issues.filter((i) => i.category === "Drug ratio out of range").map((i) => i.rowIndex));
  k.drugRatioCompliance = rows.length ? +(((rows.length - ratioBad.size) / rows.length) * 100).toFixed(1) : 100;

  // Inventory balance compliance
  const invBad = new Set(issues.filter((i) => i.category === "Inventory mismatch" || i.category === "Drug used exceeds received").map((i) => i.rowIndex));
  k.inventoryBalanceCompliance = rows.length ? +(((rows.length - invBad.size) / rows.length) * 100).toFixed(1) : 100;

  // Coverage buckets / pass rate
  let above = 0, below = 0, crit = 0, covRows = 0;
  for (const r of rows) {
    const t = toNum(r.values["Therapeutic Coverage (%)"]);
    if (t === null) continue;
    covRows++;
    if (t >= config.coverageThreshold) above++;
    else if (t >= config.coverageThreshold * 0.6) below++;
    else crit++;
  }
  k.coverageBuckets = { above, below, critical: crit };
  k.coveragePassRate = covRows ? +((above / covRows) * 100).toFixed(1) : 0;

  // Drug wastage rate (sum lost / sum received across known drugs)
  let lost = 0, recv = 0;
  const drugPairs: [string, string][] = [
    ["Number of IVM Lost", "Number of IVM Received"],
    ["Number of ALB Lost", "Number of ALB Received"],
    ["Number of PZQ Lost", "Number of PZQ Received"],
    ["Number of MEB Lost", "Number of MEB Received"],
    ["AZT - Wasted", "AZT - Received"],
    ["POS - Wasted", "POS - Received"],
    ["TEO - Wasted", "TEO - Received"],
  ];
  for (const r of rows) for (const [l, rc] of drugPairs) {
    const lv = toNum(r.values[l]); const rv = toNum(r.values[rc]);
    if (lv !== null) lost += lv; if (rv !== null) recv += rv;
  }
  k.drugWastageRate = recv ? +((lost / recv) * 100).toFixed(1) : 0;

  // Data quality score: weighted blend
  const validShare = rows.length ? (k.validRows + k.autoCorrections * 0.7) / rows.length : 1;
  k.dataQualityScore = +(((validShare * 0.5 + k.completeness / 100 * 0.2 + k.drugRatioCompliance / 100 * 0.15 + k.inventoryBalanceCompliance / 100 * 0.15)) * 100).toFixed(1);

  return k;
}
