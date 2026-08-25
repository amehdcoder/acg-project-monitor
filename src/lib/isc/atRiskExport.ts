/**
 * Export contract for the at-risk community register (Medicine Accountability
 * dashboard). Kept as a pure module so the CSV / Excel payload can be asserted
 * in tests without rendering the table.
 */
import { medicineLabel } from "./medicineAccountability";
import type { AtRiskCommunity } from "./atRiskCommunities";

export interface AtRiskColumn { key: string; label: string }

export const AT_RISK_COLUMNS: AtRiskColumn[] = [
  { key: "community", label: "Community / settlement" },
  { key: "ward", label: "Ward" },
  { key: "lga", label: "LGA" },
  { key: "state", label: "State" },
  { key: "flhf", label: "FLHF" },
  { key: "statusLabel", label: "Status of MDA" },
  { key: "sufficiencyLabel", label: "Medicine sufficiency" },
  { key: "insufficientMedicines", label: "Medicine(s) reported insufficient" },
  { key: "medicinesIssued", label: "Medicine(s) issued to community" },
  { key: "totalIssued", label: "Total units issued" },
  { key: "cddList", label: "CDD(s)" },
  { key: "cddPhoneList", label: "CDD phone number(s)" },
  { key: "inCharge", label: "FLHF in-charge" },
  { key: "inChargePhone", label: "In-charge phone" },
  { key: "monitor", label: "Reported by" },
  { key: "visitDate", label: "Last visit" },
  { key: "reports", label: "Checklist reports" },
];

export const NOT_CAPTURED = "Not captured";
export const NONE_RECORDED = "None recorded";

export type AtRiskFlatRow = AtRiskCommunity & {
  medicinesIssued: string;
  cddList: string;
  cddPhoneList: string;
  inChargePhone: string;
};

/** Medicines issued to a community, summed per medicine and human-labelled. */
export function medicinesIssuedText(row: AtRiskCommunity): string {
  if (!row.issues.length) return NONE_RECORDED;
  const totals = new Map<string, number>();
  for (const i of row.issues) {
    const qty = Number.isFinite(i.qty) ? i.qty : 0;
    totals.set(i.medicine, (totals.get(i.medicine) ?? 0) + qty);
  }
  return Array.from(totals)
    .map(([m, qty]) => `${medicineLabel(m)} — ${Math.round(qty).toLocaleString()}`)
    .join("; ");
}

/** Flatten register rows into the display / export shape. */
export function flattenAtRisk(rows: AtRiskCommunity[]): AtRiskFlatRow[] {
  return rows.map((r) => ({
    ...r,
    medicinesIssued: medicinesIssuedText(r),
    cddList: r.cdds.join("; ") || "—",
    cddPhoneList: r.cddPhones.join("; ") || NOT_CAPTURED,
    inChargePhone: r.inChargePhone || NOT_CAPTURED,
  }));
}

/** Column-projected rows handed to exportCsv / exportXlsx. */
export function buildAtRiskExportRows(rows: AtRiskFlatRow[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of AT_RISK_COLUMNS) o[c.key] = (r as any)[c.key] ?? "";
    return o;
  });
}

/** Free-text haystack used by the register's quick community lookup. */
export const atRiskHaystack = (r: AtRiskFlatRow) =>
  AT_RISK_COLUMNS.map((c) => String((r as any)[c.key] ?? "")).join(" ").toLowerCase();
