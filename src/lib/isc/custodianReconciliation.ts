/**
 * Custodian inventory reconciliation — WHO-standard stock-balance checks.
 *
 *  Leg A: State → LGA EDO receipts  vs  LGA EDO → FLHF issuance, by medicine.
 *  Leg B: LGA EDO → FLHF worker issues vs FLHF worker → CDD issues, by medicine.
 *
 * A negative balance (issued out > received in) is an accountability breach —
 * stock cannot leave a store that never received it. A large positive balance
 * is undistributed stock sitting at that level.
 */
import type { LogisticsDataset } from "./medicineAccountability";

export type ReconStatus = "balanced" | "under_distributed" | "idle" | "over_issued";

export interface ReconRow {
  key: string;
  /** Custodian holding the stock at this level. */
  holder: string;
  role: string;
  state: string;
  lga: string;
  ward: string;
  facility: string;
  medicine: string;
  /** Units received into this custodian's store. */
  inQty: number;
  /** Units damaged / unusable on receipt (leg A only). */
  damaged: number;
  /** Usable units available for onward issue. */
  usable: number;
  /** Units issued onward to the next level. */
  outQty: number;
  /** usable − outQty. Negative = issued more than held. */
  variance: number;
  /** outQty / usable. */
  pushRate: number;
  status: ReconStatus;
  inTxns: number;
  outTxns: number;
  batches: string[];
  earliestExpiry: string;
}

export interface ReconSummary {
  rows: ReconRow[];
  totals: { inQty: number; usable: number; outQty: number; variance: number; damaged: number };
  discrepancies: number;
  overIssued: number;
  idle: number;
}

const dash = (s?: string) => (s && s.trim() && s.trim() !== "—" ? s.trim() : "—");

function classify(usable: number, out: number): ReconStatus {
  if (out > usable + 0.5) return "over_issued";
  if (usable <= 0) return out > 0 ? "over_issued" : "balanced";
  const rate = out / usable;
  if (rate >= 0.95) return "balanced";
  if (rate <= 0.05) return "idle";
  return "under_distributed";
}

function finalize(map: Map<string, ReconRow>): ReconSummary {
  const rows = [...map.values()].map((r) => {
    r.usable = r.usable || Math.max(0, r.inQty - r.damaged);
    r.variance = r.usable - r.outQty;
    r.pushRate = r.usable > 0 ? r.outQty / r.usable : 0;
    r.status = classify(r.usable, r.outQty);
    r.batches.sort();
    return r;
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totals = rows.reduce(
    (a, r) => ({
      inQty: a.inQty + r.inQty, usable: a.usable + r.usable, outQty: a.outQty + r.outQty,
      variance: a.variance + r.variance, damaged: a.damaged + r.damaged,
    }),
    { inQty: 0, usable: 0, outQty: 0, variance: 0, damaged: 0 },
  );

  return {
    rows,
    totals,
    discrepancies: rows.filter((r) => r.status !== "balanced").length,
    overIssued: rows.filter((r) => r.status === "over_issued").length,
    idle: rows.filter((r) => r.status === "idle").length,
  };
}

function blank(key: string, holder: string, role: string, state: string, lga: string, ward: string, facility: string, medicine: string): ReconRow {
  return {
    key, holder, role, state, lga, ward, facility, medicine,
    inQty: 0, damaged: 0, usable: 0, outQty: 0, variance: 0, pushRate: 0,
    status: "balanced", inTxns: 0, outTxns: 0, batches: [], earliestExpiry: "",
  };
}

const track = (row: ReconRow, batch?: string, expiry?: string) => {
  const b = dash(batch);
  if (b !== "—" && !row.batches.includes(b)) row.batches.push(b);
  if (expiry && (!row.earliestExpiry || expiry < row.earliestExpiry)) row.earliestExpiry = expiry;
};

/** Leg A — LGA EDO store: receipts from State vs issues out to FLHF workers. */
export function reconcileEdoVsFlhf(ds: LogisticsDataset): ReconSummary {
  const map = new Map<string, ReconRow>();
  const edoByLga = new Map<string, string>();
  for (const r of ds.receipts) {
    if (dash(r.edoName) !== "—") edoByLga.set(`${r.state}||${r.lga}`, r.edoName);
  }
  const keyOf = (state: string, lga: string, medicine: string) => `${state}||${lga}||${medicine}`;

  for (const r of ds.receipts) {
    const k = keyOf(r.state, r.lga, r.medicine);
    const row = map.get(k) ?? blank(k, dash(r.edoName) === "—" ? "Unnamed EDO / Logistic Officer" : r.edoName,
      "LGA EDO / Logistic Officer", r.state, r.lga, r.ward, "—", r.medicine);
    row.inQty += r.qtyReceived;
    row.damaged += r.qtyDamaged;
    row.usable += r.netUsable || Math.max(0, r.qtyReceived - r.qtyDamaged);
    row.inTxns += 1;
    track(row, r.batch, r.expiry);
    map.set(k, row);
  }
  for (const i of ds.issues) {
    const k = keyOf(i.state, i.lga, i.medicine);
    const row = map.get(k) ?? blank(k, edoByLga.get(`${i.state}||${i.lga}`) ?? "Unnamed EDO / Logistic Officer",
      "LGA EDO / Logistic Officer", i.state, i.lga, i.ward, "—", i.medicine);
    row.outQty += i.qtyIssued;
    row.outTxns += 1;
    track(row, i.batch, i.expiry);
    map.set(k, row);
  }
  return finalize(map);
}

/** Leg B — FLHF worker store: issues received from the LGA vs issues to CDDs. */
export function reconcileFlhfVsCdd(ds: LogisticsDataset): ReconSummary {
  const map = new Map<string, ReconRow>();
  const inChargeByFacility = new Map<string, string>();
  for (const i of ds.issues) {
    if (dash(i.inCharge) !== "—") inChargeByFacility.set(`${i.facility}||${i.lga}`, i.inCharge);
  }
  const keyOf = (facility: string, lga: string, medicine: string) => `${facility}||${lga}||${medicine}`;

  for (const i of ds.issues) {
    const k = keyOf(i.facility, i.lga, i.medicine);
    const row = map.get(k) ?? blank(k, dash(i.inCharge) === "—" ? "Unnamed facility in-charge" : i.inCharge,
      "FLHF health worker", i.state, i.lga, i.ward, dash(i.facility), i.medicine);
    row.inQty += i.qtyIssued;
    row.usable += i.qtyIssued;
    row.inTxns += 1;
    track(row, i.batch, i.expiry);
    map.set(k, row);
  }
  for (const c of ds.cddIssues) {
    const k = keyOf(c.facility, c.lga, c.medicine);
    const row = map.get(k) ?? blank(k, inChargeByFacility.get(`${c.facility}||${c.lga}`) ?? "Unnamed facility in-charge",
      "FLHF health worker", c.state, c.lga, c.ward, dash(c.facility), c.medicine);
    row.outQty += c.qtyIssued;
    row.outTxns += 1;
    track(row, c.batch, c.expiry);
    map.set(k, row);
  }
  return finalize(map);
}

/* ── expiry risk (WHO shelf-life bands) ──────────────────────────────────── */

export type ExpiryRisk = "expired" | "critical" | "watch" | "ok" | "unknown";

export interface ExpiryInfo {
  risk: ExpiryRisk;
  days: number | null;
  label: string;
}

const RISK_LABEL: Record<ExpiryRisk, string> = {
  expired: "Expired — quarantine",
  critical: "Expires ≤ 90 days",
  watch: "Expires ≤ 180 days",
  ok: "Within shelf life",
  unknown: "No expiry captured",
};

export function expiryInfo(expiry?: string, today = new Date().toISOString().slice(0, 10)): ExpiryInfo {
  if (!expiry) return { risk: "unknown", days: null, label: RISK_LABEL.unknown };
  const d = Date.parse(expiry);
  const t = Date.parse(today);
  if (Number.isNaN(d) || Number.isNaN(t)) return { risk: "unknown", days: null, label: RISK_LABEL.unknown };
  const days = Math.round((d - t) / 86_400_000);
  const risk: ExpiryRisk = days < 0 ? "expired" : days <= 90 ? "critical" : days <= 180 ? "watch" : "ok";
  return { risk, days, label: RISK_LABEL[risk] };
}

/** Inline WHO-style risk colours (token-free, chart palette parity). */
export const EXPIRY_TONE: Record<ExpiryRisk, { bg: string; fg: string; border: string }> = {
  expired: { bg: "hsl(0,78%,95%)", fg: "hsl(0,72%,38%)", border: "hsl(0,72%,60%)" },
  critical: { bg: "hsl(24,92%,95%)", fg: "hsl(24,88%,38%)", border: "hsl(24,88%,58%)" },
  watch: { bg: "hsl(45,94%,94%)", fg: "hsl(38,86%,34%)", border: "hsl(42,90%,55%)" },
  ok: { bg: "hsl(152,58%,95%)", fg: "hsl(152,62%,28%)", border: "hsl(152,52%,48%)" },
  unknown: { bg: "hsl(220,14%,95%)", fg: "hsl(220,10%,42%)", border: "hsl(220,12%,72%)" },
};

export const RECON_TONE: Record<ReconStatus, { label: string; bg: string; fg: string }> = {
  balanced: { label: "Balanced", bg: "hsl(152,58%,94%)", fg: "hsl(152,62%,26%)" },
  under_distributed: { label: "Under-distributed", bg: "hsl(45,94%,93%)", fg: "hsl(38,86%,32%)" },
  idle: { label: "Idle stock", bg: "hsl(210,90%,95%)", fg: "hsl(214,72%,32%)" },
  over_issued: { label: "Over-issued (breach)", bg: "hsl(0,78%,95%)", fg: "hsl(0,72%,38%)" },
};
