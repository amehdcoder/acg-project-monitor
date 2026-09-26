// NTD Treatment Data Cleaner — result builder. There are NO hand-written
// validation rules: every flag comes from the neural brain (autoencoder +
// transformer reconstruction error, learned presence, learned category density).
import type { MdaConfig, Severity } from "./schemas";
import type { ScoredRow, CellKind } from "./neural/protocol";
import { toNum } from "./neural/features";
export { toNum } from "./neural/features";

export type IssueCategory =
  | "Reconstruction anomaly"
  | "Unexpected blank"
  | "Unreadable value"
  | "Unusual category";

const CAT: Record<CellKind, IssueCategory> = {
  reconstruction: "Reconstruction anomaly", missing: "Unexpected blank",
  unreadable: "Unreadable value", category: "Unusual category",
};

export interface CellIssue {
  rowIndex: number; col: string; category: IssueCategory; severity: Severity;
  message: string; suggestedFix: string; original: any; autoFix?: any; score: number;
}
export type RowStatus = "Validated" | "Auto-Corrected" | "Needs Review" | "Critical Alert";
export interface RowResult {
  index: number; values: Record<string, any>; original: Record<string, any>;
  issues: CellIssue[]; status: RowStatus; autoCorrected: boolean; rowScore: number;
}
export interface ValidationResult { rows: RowResult[]; issues: CellIssue[]; kpis: ReturnType<typeof computeKpis> }

function statusOf(r: Pick<RowResult, "issues" | "autoCorrected" | "rowScore">, q95: number, q995: number): RowStatus {
  const open = r.issues;
  if (open.some((i) => i.severity === "critical") || r.rowScore > q995) return "Critical Alert";
  if (open.length || r.rowScore > q95) return "Needs Review";
  return r.autoCorrected ? "Auto-Corrected" : "Validated";
}

export function buildResult(config: MdaConfig, raw: Record<string, any>[], scored: ScoredRow[]): ValidationResult {
  const rows: RowResult[] = raw.map((r, idx) => {
    const sc = scored[idx];
    const issues: CellIssue[] = sc.cells.map((c) => ({
      rowIndex: idx, col: c.col, category: CAT[c.kind], severity: c.severity, message: c.message,
      suggestedFix: c.suggested !== undefined ? `Model reconstruction: ${c.suggested}` : "Verify against source",
      original: c.original, autoFix: c.suggested, score: c.score,
    }));
    const row: RowResult = { index: idx, values: { ...r }, original: { ...r }, issues, autoCorrected: false, rowScore: sc.rowScore, status: "Validated" };
    row.status = statusOf(row, sc.rowQ95, sc.rowQ995);
    return row;
  });
  return finalize(config, rows, scored[0]?.rowQ95 ?? 1, scored[0]?.rowQ995 ?? 2);
}

/** Accept the model's reconstructions for flagged cells (optionally only some severities). */
export function applySuggestions(config: MdaConfig, res: ValidationResult, sev: Severity[] = ["critical", "high", "warning"]): ValidationResult {
  const q95 = res.kpis.rowQ95, q995 = res.kpis.rowQ995;
  const rows = res.rows.map((r) => {
    const values = { ...r.values }; let fixed = r.autoCorrected;
    const remaining = r.issues.filter((i) => {
      if (i.autoFix !== undefined && sev.includes(i.severity)) { values[i.col] = i.autoFix; fixed = true; return false; }
      return true;
    });
    const nr: RowResult = { ...r, values, autoCorrected: fixed, issues: remaining, rowScore: fixed ? Math.min(r.rowScore, q95) : r.rowScore };
    nr.status = statusOf(nr, q95, q995);
    return nr;
  });
  return finalize(config, rows, q95, q995);
}

function finalize(config: MdaConfig, rows: RowResult[], q95: number, q995: number): ValidationResult {
  const issues = rows.flatMap((r) => r.issues);
  return { rows, issues, kpis: computeKpis(config, rows, issues, q95, q995) };
}

function computeKpis(config: MdaConfig, rows: RowResult[], issues: CellIssue[], rowQ95: number, rowQ995: number) {
  const n = rows.length;
  const issueCategoryCounts: Record<string, number> = {};
  const columnAnomalyCounts: Record<string, number> = {};
  for (const i of issues) {
    issueCategoryCounts[i.category] = (issueCategoryCounts[i.category] || 0) + 1;
    columnAnomalyCounts[i.col] = (columnAnomalyCounts[i.col] || 0) + 1;
  }
  let cells = 0, filled = 0;
  for (const r of rows) for (const c of config.columns) { cells++; if (String(r.values[c.key] ?? "").trim() !== "") filled++; }
  const validRows = rows.filter((r) => r.status === "Validated" || r.status === "Auto-Corrected").length;
  const completeness = cells ? +((filled / cells) * 100).toFixed(1) : 100;
  const meanRowScore = n ? rows.reduce((a, r) => a + r.rowScore, 0) / n : 0;
  // Coverage buckets are descriptive reporting (programme threshold), not cleaning rules.
  let above = 0, below = 0, crit = 0, covRows = 0;
  for (const r of rows) {
    const t = toNum(r.values["Therapeutic Coverage (%)"]); if (t === null) continue; covRows++;
    if (t >= config.coverageThreshold) above++; else if (t >= config.coverageThreshold * 0.6) below++; else crit++;
  }
  return {
    totalRows: n, validRows,
    rowsWithIssues: rows.filter((r) => r.issues.length > 0).length,
    criticalIssues: issues.filter((i) => i.severity === "critical").length,
    criticalRows: rows.filter((r) => r.status === "Critical Alert").length,
    autoCorrections: rows.filter((r) => r.autoCorrected).length,
    anomalousCells: issues.length,
    meanRowScore: +meanRowScore.toFixed(2),
    completeness,
    dataQualityScore: n ? +(((validRows / n) * 0.75 + (completeness / 100) * 0.25) * 100).toFixed(1) : 0,
    coverageBuckets: { above, below, critical: crit },
    coveragePassRate: covRows ? +((above / covRows) * 100).toFixed(1) : 0,
    issueCategoryCounts, columnAnomalyCounts, rowQ95, rowQ995,
  };
}
