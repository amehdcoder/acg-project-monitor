/**
 * Data-quality validation layer for the Medicine Accountability dashboard.
 *
 * Scans the parsed logistics dataset (plus manual allocations and the computed
 * indicator suite) for the three failure modes that silently distort supply
 * indicators:
 *
 *  1. Missing batch / quantity data  — a transaction was logged without a
 *     batch-lot number or without a usable quantity, so it cannot be traced or
 *     counted.
 *  2. Negative stock                 — a balance, prior balance or quantity is
 *     below zero, which is physically impossible and points to a data-entry
 *     or double-counting error.
 *  3. Zero-division                  — an indicator's denominator is zero, so
 *     the ratio shown is a placeholder (0 / "—") and must not be read as a
 *     real performance value.
 *
 * The output is consumed both by the KPI cards (inline warning chips) and by
 * the drill-down dialog (per-KPI "Data quality" tables).
 */
import {
  medicineLabel,
  type Allocation,
  type AccountabilitySummary,
  type LogisticsDataset,
  type SupplyIntegrity,
} from "./medicineAccountability";
import type { DrillColumn, DrillTable } from "./medicineDrilldown";

export type DqCategory = "missing_batch" | "missing_quantity" | "negative_stock" | "zero_division";

export const DQ_LABELS: Record<DqCategory, string> = {
  missing_batch: "Missing batch / lot number",
  missing_quantity: "Missing or zero quantity",
  negative_stock: "Negative stock",
  zero_division: "Zero denominator",
};

export interface DqIssue {
  category: DqCategory;
  /** 1 = warning (interpret with care), 2 = breach (figure is unreliable) */
  severity: 1 | 2;
  level: string;
  state: string;
  lga: string;
  facility: string;
  medicine: string;
  batch: string;
  date: string;
  submissionId: string;
  detail: string;
  /** doc ids of the KPIs this record distorts */
  kpis: string[];
}

export interface DqFlag {
  category: DqCategory;
  severity: 1 | 2;
  count: number;
  message: string;
}

export interface DataQualityReport {
  issues: DqIssue[];
  counts: Record<DqCategory, number>;
  totalRecords: number;
  affectedRecords: number;
  /** 0–1, share of transaction records with no detected defect */
  cleanRate: number;
  /** doc id → flags to render on that KPI card */
  byKpi: Record<string, DqFlag[]>;
}

const EMPTY_BATCH = new Set(["", "—", "-", "na", "n/a", "none", "null", "unknown", "0"]);
const isMissingBatch = (b: string) => EMPTY_BATCH.has(String(b ?? "").trim().toLowerCase());

const LEVEL_NAME: Record<string, string> = {
  level_1: "L1 State → LGA",
  level_2: "L2 LGA → Facility",
  level_3: "L3 Facility → CDD",
};

function push(list: DqIssue[], issue: DqIssue) { list.push(issue); }

/* ── main assessment ─────────────────────────────────────────────────────── */

export function assessDataQuality(
  ds: LogisticsDataset,
  allocations: Allocation[],
  summary: AccountabilitySummary,
  integrity: SupplyIntegrity,
): DataQualityReport {
  const issues: DqIssue[] = [];
  const affected = new Set<string>();
  const mark = (k: string) => affected.add(k);

  /* Level 1 — receipts */
  ds.receipts.forEach((r, i) => {
    const key = `r${i}`;
    const base = {
      level: LEVEL_NAME.level_1, state: r.state || "—", lga: r.lga || "—", facility: "—",
      medicine: medicineLabel(r.medicine), batch: r.batch || "—", date: r.date || "—",
      submissionId: r.submissionId,
    };
    if (isMissingBatch(r.batch)) {
      mark(key);
      push(issues, {
        ...base, category: "missing_batch", severity: r.qtyReceived > 0 ? 2 : 1,
        detail: `${Math.round(r.qtyReceived).toLocaleString()} units received with no batch/lot number — cannot be traced to an expiry date.`,
        kpis: ["expiry-exposure", "expiry-risk", "shrinkage"],
      });
    }
    if (r.qtyReceived <= 0) {
      mark(key);
      push(issues, {
        ...base, category: "missing_quantity", severity: 2,
        detail: "Receipt logged with a zero/blank quantity received — the consignment is invisible to received, wastage and push-rate totals.",
        kpis: ["received-distributed", "wastage", "push-rate", "shrinkage"],
      });
    }
    if (r.qtyReceived < 0 || r.qtyDamaged < 0 || r.netUsable < 0) {
      mark(key);
      push(issues, {
        ...base, category: "negative_stock", severity: 2,
        detail: `Negative values recorded (received ${Math.round(r.qtyReceived)}, damaged ${Math.round(r.qtyDamaged)}, net usable ${Math.round(r.netUsable)}).`,
        kpis: ["received-distributed", "wastage", "balances"],
      });
    }
    if (r.qtyDamaged > r.qtyReceived && r.qtyReceived > 0) {
      mark(key);
      push(issues, {
        ...base, category: "negative_stock", severity: 2,
        detail: `Damaged quantity (${Math.round(r.qtyDamaged).toLocaleString()}) exceeds quantity received (${Math.round(r.qtyReceived).toLocaleString()}) — implies negative usable stock.`,
        kpis: ["wastage", "balances", "buffer"],
      });
    }
    if (!r.expiry && !isMissingBatch(r.batch)) {
      mark(key);
      push(issues, {
        ...base, category: "missing_batch", severity: 1,
        detail: "Batch recorded without an expiry date — excluded from the expiry risk index.",
        kpis: ["expiry-exposure", "expiry-risk"],
      });
    }
  });

  /* Level 2 — LGA → facility issues */
  ds.issues.forEach((t, i) => {
    const key = `i${i}`;
    const base = {
      level: LEVEL_NAME.level_2, state: t.state || "—", lga: t.lga || "—", facility: t.facility || "—",
      medicine: medicineLabel(t.medicine), batch: t.batch || "—", date: t.date || "—",
      submissionId: t.submissionId,
    };
    if (isMissingBatch(t.batch)) {
      mark(key);
      push(issues, {
        ...base, category: "missing_batch", severity: t.qtyIssued > 0 ? 2 : 1,
        detail: `${Math.round(t.qtyIssued).toLocaleString()} units issued without a batch/lot number — breaks the batch chain from LGA store to facility.`,
        kpis: ["expiry-risk", "shrinkage", "pod"],
      });
    }
    if (t.qtyIssued <= 0) {
      mark(key);
      push(issues, {
        ...base, category: "missing_quantity", severity: 2,
        detail: "Facility issue logged with no quantity — understates the downstream push rate and facility equity.",
        kpis: ["received-distributed", "push-rate", "equity"],
      });
    }
    if (t.qtyIssued < 0 || t.priorBalance < 0 || t.remainingLga < 0) {
      mark(key);
      push(issues, {
        ...base, category: "negative_stock", severity: 2,
        detail: `Negative stock reported (issued ${Math.round(t.qtyIssued)}, opening balance ${Math.round(t.priorBalance)}, LGA remaining ${Math.round(t.remainingLga)}).`,
        kpis: ["balances", "stockout", "buffer"],
      });
    }
    if (t.priorBalance > 0 && t.qtyIssued > t.priorBalance) {
      mark(key);
      push(issues, {
        ...base, category: "negative_stock", severity: 1,
        detail: `Issued ${Math.round(t.qtyIssued).toLocaleString()} against an opening balance of ${Math.round(t.priorBalance).toLocaleString()} — drives the LGA balance below zero.`,
        kpis: ["balances", "buffer"],
      });
    }
  });

  /* Level 3 — facility → CDD */
  ds.cddIssues.forEach((c, i) => {
    const key = `c${i}`;
    const base = {
      level: LEVEL_NAME.level_3, state: c.state || "—", lga: c.lga || "—", facility: c.facility || "—",
      medicine: medicineLabel(c.medicine), batch: "—", date: c.date || "—", submissionId: c.submissionId,
    };
    if (c.qtyIssued <= 0) {
      mark(key);
      push(issues, {
        ...base, category: "missing_quantity", severity: c.qtyIssued < 0 ? 2 : 1,
        detail: `CDD issue for ${c.community || "an unnamed community"} logged with no quantity — reads as unconfirmed delivery and inflates transit shrinkage.`,
        kpis: ["shrinkage", "buffer", "received-distributed"],
      });
    }
    if (c.qtyIssued < 0) {
      mark(key);
      push(issues, {
        ...base, category: "negative_stock", severity: 2,
        detail: `Negative quantity issued to CDD (${Math.round(c.qtyIssued)}).`,
        kpis: ["balances", "shrinkage"],
      });
    }
  });

  /* Manual allocations */
  allocations.forEach((a, i) => {
    const qty = Number(a.quantity);
    if (Number.isFinite(qty) && qty > 0) return;
    mark(`a${i}`);
    push(issues, {
      category: Number.isFinite(qty) && qty < 0 ? "negative_stock" : "missing_quantity",
      severity: 2,
      level: "Allocation entry", state: a.state || "—", lga: a.lga || "— (state-level)", facility: "—",
      medicine: medicineLabel(a.medicine), batch: "—", date: a.dispatchDate || "—", submissionId: a.id,
      detail: `Allocation quantity is ${Number.isFinite(qty) ? Math.round(qty).toLocaleString() : "blank"} — allocation fulfilment and State → LGA shrinkage cannot be computed for this consignment.`,
      kpis: ["received-distributed", "shrinkage"],
    });
  });

  /* Computed balances below zero (aggregate level) */
  const balanceChecks: { label: string; value: number; kpis: string[] }[] = [
    { label: "LGA warehouse balance", value: summary.totals.lgaBalance, kpis: ["balances", "buffer"] },
    { label: "Facility store balance", value: summary.totals.flhfBalance, kpis: ["balances", "stockout", "buffer"] },
  ];
  for (const b of balanceChecks) {
    if (b.value >= 0) continue;
    push(issues, {
      category: "negative_stock", severity: 2, level: "Aggregate", state: "—", lga: "—", facility: "—",
      medicine: "All", batch: "—", date: "—", submissionId: "—",
      detail: `${b.label} is ${Math.round(b.value).toLocaleString()} units — more stock was issued downstream than was ever recorded as received.`,
      kpis: b.kpis,
    });
  }
  summary.byLga.forEach((row) => {
    if (row.lgaBalance >= 0 && row.flhfBalance >= 0) return;
    push(issues, {
      category: "negative_stock", severity: 2, level: "Aggregate", state: row.state || "—", lga: row.lga || "—",
      facility: "—", medicine: medicineLabel(row.medicine), batch: "—", date: "—", submissionId: "—",
      detail: `Negative balance in ${row.lga || "this LGA"} (LGA ${Math.round(row.lgaBalance).toLocaleString()}, facilities ${Math.round(row.flhfBalance).toLocaleString()}).`,
      kpis: ["balances", "stockout", "buffer"],
    });
  });

  /* Zero-division scenarios */
  const zeroDiv: { when: boolean; what: string; kpis: string[] }[] = [
    { when: summary.totals.received <= 0, what: "Wastage rate has a zero denominator (no units recorded as received) — the 0.0% shown is a placeholder, not clean stock.", kpis: ["wastage", "received-distributed"] },
    { when: summary.totals.netUsable <= 0, what: "Downstream push rate has a zero denominator (no net usable stock) — the percentage is undefined.", kpis: ["push-rate"] },
    { when: summary.totals.issuedToFlhf <= 0, what: "CDD push rate and facility equity have a zero denominator (nothing issued to facilities yet).", kpis: ["equity", "push-rate"] },
    { when: summary.byMedicine.every((m) => m.allocated <= 0), what: "No allocations entered — allocation fulfilment and the State → LGA shrinkage leg cannot be computed.", kpis: ["received-distributed", "shrinkage"] },
    { when: summary.stockoutIndex.facilities === 0, what: "Stockout vulnerability has no facility denominator — no facility has reported stock yet.", kpis: ["stockout"] },
    { when: (summary.podCompliance.l1n + summary.podCompliance.l2n + summary.podCompliance.l3n) === 0, what: "Proof-of-delivery compliance has no transactions to score.", kpis: ["pod"] },
    { when: summary.leadTimes.every((l) => l.n === 0), what: "No date pairs available — cascade lead times are undefined.", kpis: ["lead-time"] },
    { when: integrity.shrinkage.overall.issued <= 0, what: "Transit shrinkage has a zero denominator (no upstream issues matched a downstream confirmation).", kpis: ["shrinkage"] },
    { when: integrity.expiryRisk.totalStock <= 0, what: "Expiry risk index has a zero denominator (no stock on hand).", kpis: ["expiry-risk", "expiry-exposure"] },
    { when: integrity.buffer.deployedCdd <= 0, what: "Buffer retention ratio has a zero denominator (nothing deployed to CDDs yet).", kpis: ["buffer"] },
    { when: integrity.equity.rows.length === 0, what: "Facility equity index has no comparable facility groups (needs 2+ facilities issuing in the same LGA).", kpis: ["equity"] },
  ];
  for (const z of zeroDiv) {
    if (!z.when) continue;
    push(issues, {
      category: "zero_division", severity: 2, level: "Indicator", state: "—", lga: "—", facility: "—",
      medicine: "All", batch: "—", date: "—", submissionId: "—",
      detail: z.what, kpis: z.kpis,
    });
  }

  /* aggregate */
  const counts: Record<DqCategory, number> = {
    missing_batch: 0, missing_quantity: 0, negative_stock: 0, zero_division: 0,
  };
  for (const i of issues) counts[i.category] += 1;

  const byKpi: Record<string, DqFlag[]> = {};
  for (const issue of issues) {
    for (const k of issue.kpis) {
      const list = (byKpi[k] ??= []);
      const existing = list.find((f) => f.category === issue.category);
      if (existing) {
        existing.count += 1;
        existing.severity = Math.max(existing.severity, issue.severity) as 1 | 2;
        if (issue.category === "zero_division") existing.message = issue.detail;
      } else {
        list.push({
          category: issue.category,
          severity: issue.severity,
          count: 1,
          message: issue.category === "zero_division" ? issue.detail : DQ_LABELS[issue.category],
        });
      }
    }
  }

  const totalRecords = ds.receipts.length + ds.issues.length + ds.cddIssues.length + allocations.length;
  const affectedRecords = affected.size;

  return {
    issues,
    counts,
    totalRecords,
    affectedRecords,
    cleanRate: totalRecords > 0 ? 1 - affectedRecords / totalRecords : 1,
    byKpi,
  };
}

/* ── presentation helpers ────────────────────────────────────────────────── */

export function flagSummary(flags: DqFlag[] | undefined): string {
  if (!flags?.length) return "";
  return flags
    .map((f) => (f.category === "zero_division" ? `⚠ ${f.message}` : `⚠ ${DQ_LABELS[f.category]}: ${f.count.toLocaleString()} record${f.count === 1 ? "" : "s"} affected.`))
    .join("\n");
}

export function flagTone(flags: DqFlag[] | undefined): "danger" | "warn" | null {
  if (!flags?.length) return null;
  return flags.some((f) => f.severity === 2) ? "danger" : "warn";
}

const DQ_COLUMNS: DrillColumn[] = [
  { key: "category", label: "Issue" },
  { key: "level", label: "Level" },
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "facility", label: "Facility" },
  { key: "medicine", label: "Medicine" },
  { key: "batch", label: "Batch" },
  { key: "detail", label: "What is wrong" },
  { key: "submissionId", label: "Submission" },
  { key: "severityLabel", label: "Severity", align: "right", badge: true },
];

/** A "Data quality" table scoped to the KPI a drill-down report belongs to. */
export function dataQualityTable(dq: DataQualityReport, kpiDocId?: string): DrillTable {
  const rows = (kpiDocId ? dq.issues.filter((i) => i.kpis.includes(kpiDocId)) : dq.issues)
    .sort((a, b) => b.severity - a.severity)
    .map((i) => ({
      category: DQ_LABELS[i.category],
      level: i.level,
      state: i.state,
      lga: i.lga,
      facility: i.facility,
      medicine: i.medicine,
      batch: i.batch,
      detail: i.detail,
      submissionId: i.submissionId,
      severityLabel: i.severity === 2 ? "Unreliable" : "Check",
      _sev: i.severity,
    }));

  return {
    id: "data-quality",
    title: "Data quality",
    note: rows.length
      ? "Records below distort this indicator. Rows marked “Unreliable” should be corrected in KoboToolbox (or in the allocation register) before the figure is quoted in a supervision meeting."
      : "No missing batch quantities, negative stock values or zero-division cases detected for this indicator.",
    columns: DQ_COLUMNS,
    rows,
  };
}
