/**
 * Level 0 cascade verification & barcode / QR traceability.
 *
 * Level 0 captures what the State medical store *dispatched* to each LGA.
 * Level 1 captures what the EDO / Logistic Officer at the LGA *confirms
 * receiving*. Comparing the two closes the biggest accountability gap in the
 * cascade, and — combined with the Federal Medical Store (Oshodi) allocations
 * entered manually — gives a live balance at every tier:
 *
 *   Federal allocated → State store balance → LGA store balance →
 *   Health-facility balance → deployed to CDDs
 */
import {
  FEDERAL_SOURCE, medicineLabel,
  type Allocation, type LogisticsDataset,
} from "./medicineAccountability";

export { FEDERAL_SOURCE };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

/* ── level balances (national / filtered scope) ──────────────────────────── */

export interface LevelBalance {
  level: string;
  label: string;
  inflow: number;
  outflow: number;
  balance: number;
  custodian: string;
}

export function computeLevelBalances(ds: LogisticsDataset, allocations: Allocation[]): LevelBalance[] {
  const allocated = sum(allocations.map((a) => Number(a.quantity) || 0));
  const dispatched = sum(ds.dispatches.map((d) => d.qtyDispatched));
  const received = sum(ds.receipts.map((r) => r.qtyReceived));
  const netUsable = sum(ds.receipts.map((r) => r.netUsable));
  const toFlhf = sum(ds.issues.map((i) => i.qtyIssued));
  const toCdd = sum(ds.cddIssues.map((c) => c.qtyIssued));

  return [
    {
      level: "federal", label: `Federal store (${FEDERAL_SOURCE})`, custodian: "National logistics unit",
      inflow: allocated, outflow: allocated, balance: 0,
    },
    {
      level: "state", label: "State medical store", custodian: "State Logistics Officer (SLO)",
      inflow: allocated, outflow: dispatched, balance: allocated - dispatched,
    },
    {
      level: "lga", label: "LGA store", custodian: "EDO / Logistic Officer",
      inflow: netUsable, outflow: toFlhf, balance: netUsable - toFlhf,
    },
    {
      level: "flhf", label: "Health-facility store", custodian: "Facility in-charge",
      inflow: toFlhf, outflow: toCdd, balance: toFlhf - toCdd,
    },
    {
      level: "cdd", label: "Deployed to CDDs", custodian: "Community drug distributors",
      inflow: toCdd, outflow: 0, balance: toCdd,
    },
  ].map((r) => ({ ...r, balance: Math.round(r.balance) }));
}

/* ── State → LGA verification ledger ─────────────────────────────────────── */

export type VerifyStatus = "verified" | "short" | "over" | "unconfirmed" | "unrecorded";

export interface CascadeRow {
  state: string;
  lga: string;
  medicine: string;
  allocated: number;    // Federal → State (manual entry)
  dispatched: number;   // Level 0 — State → LGA
  confirmed: number;    // Level 1 — confirmed by the EDO / Logistic Officer
  damaged: number;
  variance: number;     // dispatched − confirmed
  varianceRate: number;
  stateBalance: number; // allocated − dispatched (state store)
  lgaBalance: number;   // net usable − issued to facilities
  edo: string;
  slo: string;
  dispatchDate: string;
  receiptDate: string;
  leadDays: number | null;
  matchedBarcode: boolean;
  status: VerifyStatus;
}

export interface CascadeSummary {
  rows: CascadeRow[];
  totals: {
    allocated: number; dispatched: number; confirmed: number;
    variance: number; varianceRate: number;
    fulfilment: number;   // dispatched ÷ allocated
    verification: number; // confirmed ÷ dispatched
  };
  counts: Record<VerifyStatus, number>;
  verifiedRate: number;   // share of dispatch lines confirmed within tolerance
  avgLeadDays: number | null;
}

const dayDiff = (a?: string, b?: string) => {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime(); const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86_400_000);
};

/**
 * @param tolerance fractional variance treated as a clean match (default 2%).
 */
export function computeCascade(
  ds: LogisticsDataset,
  allocations: Allocation[],
  tolerance = 0.02,
): CascadeSummary {
  const key = (s: string, l: string, m: string) => `${s}||${l}||${m}`;
  const keys = new Set<string>();

  for (const d of ds.dispatches) keys.add(key(d.state, d.destinationLga || d.lga, d.medicine));
  for (const r of ds.receipts) keys.add(key(r.state, r.lga, r.medicine));
  for (const a of allocations) if (a.lga) keys.add(key(a.state, a.lga, a.medicine));

  const rows: CascadeRow[] = Array.from(keys).map((k) => {
    const [state, lga, medicine] = k.split("||");
    const disp = ds.dispatches.filter((d) => d.state === state && (d.destinationLga || d.lga) === lga && d.medicine === medicine);
    const recs = ds.receipts.filter((r) => r.state === state && r.lga === lga && r.medicine === medicine);
    const iss = ds.issues.filter((i) => i.state === state && i.lga === lga && i.medicine === medicine);

    const allocMatch = allocations.filter((a) => a.state === state && a.medicine === medicine && (!a.lga || a.lga === lga));
    const allocated = sum(allocMatch.map((a) => Number(a.quantity) || 0));
    const dispatched = sum(disp.map((d) => d.qtyDispatched));
    const confirmed = sum(recs.map((r) => r.qtyReceived));
    const damaged = sum(recs.map((r) => r.qtyDamaged));
    const netUsable = sum(recs.map((r) => r.netUsable));
    const toFlhf = sum(iss.map((i) => i.qtyIssued));

    const dispatchDate = disp.map((d) => d.date).filter(Boolean).sort()[0]
      ?? allocMatch.map((a) => a.dispatchDate).filter(Boolean).sort()[0] ?? "";
    const receiptDate = recs.map((r) => r.date).filter(Boolean).sort()[0] ?? "";

    const dispCodes = new Set(disp.map((d) => d.barcode).filter(Boolean));
    const recCodes = recs.map((r) => r.barcode).filter(Boolean);
    const matchedBarcode = recCodes.some((c) => dispCodes.has(c));

    const variance = dispatched - confirmed;
    const varianceRate = rate(Math.abs(variance), dispatched || confirmed);

    let status: VerifyStatus;
    if (!dispatched && confirmed) status = "unrecorded";        // LGA received stock the State never logged
    else if (dispatched && !confirmed) status = "unconfirmed";  // dispatched but no EDO confirmation
    else if (varianceRate <= tolerance) status = "verified";
    else status = variance > 0 ? "short" : "over";

    return {
      state, lga, medicine, allocated, dispatched, confirmed, damaged,
      variance, varianceRate,
      stateBalance: allocated - dispatched,
      lgaBalance: netUsable - toFlhf,
      edo: recs.find((r) => r.edoName && r.edoName !== "—")?.edoName ?? "—",
      slo: disp.find((d) => d.sloName && d.sloName !== "—")?.sloName
        ?? recs.find((r) => r.sloName && r.sloName !== "—")?.sloName ?? "—",
      dispatchDate, receiptDate,
      leadDays: dayDiff(dispatchDate, receiptDate),
      matchedBarcode,
      status,
    };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const counts = { verified: 0, short: 0, over: 0, unconfirmed: 0, unrecorded: 0 } as Record<VerifyStatus, number>;
  rows.forEach((r) => { counts[r.status]++; });

  const allocated = sum(allocations.map((a) => Number(a.quantity) || 0));
  const dispatched = sum(rows.map((r) => r.dispatched));
  const confirmed = sum(rows.map((r) => r.confirmed));
  const leads = rows.map((r) => r.leadDays).filter((d): d is number => d !== null && d >= 0);

  return {
    rows,
    totals: {
      allocated, dispatched, confirmed,
      variance: dispatched - confirmed,
      varianceRate: rate(dispatched - confirmed, dispatched),
      fulfilment: rate(dispatched, allocated),
      verification: rate(confirmed, dispatched),
    },
    counts,
    verifiedRate: rate(counts.verified, rows.length),
    avgLeadDays: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null,
  };
}

/** Per-state roll-up of the cascade ledger (for state store balances). */
export interface StateLedgerRow {
  state: string;
  allocated: number;
  dispatched: number;
  confirmed: number;
  stateBalance: number;
  variance: number;
  varianceRate: number;
  fulfilment: number;
  verification: number;
  lgas: number;
}

export function stateLedger(cascade: CascadeSummary, allocations: Allocation[]): StateLedgerRow[] {
  const states = Array.from(new Set([
    ...cascade.rows.map((r) => r.state),
    ...allocations.map((a) => a.state),
  ])).filter(Boolean);

  return states.map((state) => {
    const rs = cascade.rows.filter((r) => r.state === state);
    const allocated = sum(allocations.filter((a) => a.state === state).map((a) => Number(a.quantity) || 0));
    const dispatched = sum(rs.map((r) => r.dispatched));
    const confirmed = sum(rs.map((r) => r.confirmed));
    return {
      state, allocated, dispatched, confirmed,
      stateBalance: allocated - dispatched,
      variance: dispatched - confirmed,
      varianceRate: rate(dispatched - confirmed, dispatched),
      fulfilment: rate(dispatched, allocated),
      verification: rate(confirmed, dispatched),
      lgas: new Set(rs.map((r) => r.lga).filter(Boolean)).size,
    };
  }).sort((a, b) => b.allocated - a.allocated);
}

/* ── barcode / QR traceability ───────────────────────────────────────────── */

export type TraceStatus = "complete" | "in_transit" | "at_lga" | "at_facility" | "unmatched" | "duplicate";

export interface BarcodeTraceRow {
  code: string;
  medicine: string;
  batch: string;
  expiry: string;
  state: string;
  lga: string;
  levels: ("level_0" | "level_1" | "level_2" | "level_3")[];
  dispatched: number;
  confirmed: number;
  issuedToFlhf: number;
  issuedToCdd: number;
  balance: number;
  variance: number;
  firstSeen: string;
  lastSeen: string;
  scans: number;
  facilities: string[];
  status: TraceStatus;
}

export interface BarcodeSummary {
  rows: BarcodeTraceRow[];
  scannedTx: number;
  totalTx: number;
  scanRate: number;
  uniqueCodes: number;
  duplicates: number;
  unmatched: number;      // scanned at LGA but never scanned at State dispatch
  fullyTraced: number;    // codes seen at every tier they should reach
  traceRate: number;
  unitsTraced: number;
  byLevel: { level: string; label: string; scanned: number; total: number; rate: number }[];
}

const LEVEL_NAME: Record<string, string> = {
  level_0: "State dispatch", level_1: "LGA receipt", level_2: "Facility issue", level_3: "CDD issue",
};

export function computeBarcodeTrace(ds: LogisticsDataset): BarcodeSummary {
  type Acc = BarcodeTraceRow & { levelSet: Set<BarcodeTraceRow["levels"][number]> };
  const map = new Map<string, Acc>();

  const touch = (code: string, medicine: string, state: string, lga: string, date: string) => {
    const row = map.get(code) ?? {
      code, medicine: medicine || "unspecified", batch: "—", expiry: "", state, lga,
      levels: [], dispatched: 0, confirmed: 0, issuedToFlhf: 0, issuedToCdd: 0,
      balance: 0, variance: 0, firstSeen: date, lastSeen: date, scans: 0, facilities: [],
      status: "unmatched" as TraceStatus, levelSet: new Set<BarcodeTraceRow["levels"][number]>(),
    };
    if (date && (!row.firstSeen || date < row.firstSeen)) row.firstSeen = date;
    if (date && date > row.lastSeen) row.lastSeen = date;
    row.scans++;
    map.set(code, row);
    return row;
  };

  for (const d of ds.dispatches) {
    if (!d.barcode) continue;
    const r = touch(d.barcode, d.medicine, d.state, d.destinationLga || d.lga, d.date);
    r.levelSet.add("level_0");
    r.dispatched += d.qtyDispatched;
    if (d.batch && d.batch !== "—") r.batch = d.batch;
    if (d.expiry && !r.expiry) r.expiry = d.expiry;
  }
  for (const x of ds.receipts) {
    if (!x.barcode) continue;
    const r = touch(x.barcode, x.medicine, x.state, x.lga, x.date);
    r.levelSet.add("level_1");
    r.confirmed += x.qtyReceived;
    if (x.batch && x.batch !== "—") r.batch = x.batch;
    if (x.expiry && !r.expiry) r.expiry = x.expiry;
  }
  for (const x of ds.issues) {
    if (!x.barcode) continue;
    const r = touch(x.barcode, x.medicine, x.state, x.lga, x.date);
    r.levelSet.add("level_2");
    r.issuedToFlhf += x.qtyIssued;
    if (x.facility && !r.facilities.includes(x.facility)) r.facilities.push(x.facility);
  }
  for (const x of ds.cddIssues) {
    if (!x.barcode) continue;
    const r = touch(x.barcode, x.medicine, x.state, x.lga, x.date);
    r.levelSet.add("level_3");
    r.issuedToCdd += x.qtyIssued;
    if (x.facility && !r.facilities.includes(x.facility)) r.facilities.push(x.facility);
  }

  const rows: BarcodeTraceRow[] = Array.from(map.values()).map(({ levelSet, ...r }) => {
    const levels = (["level_0", "level_1", "level_2", "level_3"] as const).filter((l) => levelSet.has(l));
    const base = r.confirmed || r.dispatched;
    const balance = base - r.issuedToFlhf;
    const variance = r.dispatched && r.confirmed ? r.dispatched - r.confirmed : 0;
    let status: TraceStatus;
    if (levels.includes("level_3")) status = "complete";
    else if (levels.includes("level_2")) status = "at_facility";
    else if (levels.includes("level_1")) status = levels.includes("level_0") ? "at_lga" : "unmatched";
    else if (levels.includes("level_0")) status = "in_transit";
    else status = "unmatched";
    return { ...r, levels: [...levels], balance, variance, status };
  }).sort((a, b) => b.scans - a.scans || b.dispatched - a.dispatched);

  const all = [
    ...ds.dispatches.map((t) => ({ level: "level_0", code: t.barcode })),
    ...ds.receipts.map((t) => ({ level: "level_1", code: t.barcode })),
    ...ds.issues.map((t) => ({ level: "level_2", code: t.barcode })),
    ...ds.cddIssues.map((t) => ({ level: "level_3", code: t.barcode })),
  ];
  const byLevel = (["level_0", "level_1", "level_2", "level_3"] as const).map((level) => {
    const set = all.filter((t) => t.level === level);
    const scanned = set.filter((t) => !!t.code).length;
    return { level, label: LEVEL_NAME[level], scanned, total: set.length, rate: rate(scanned, set.length) };
  });

  const scannedTx = all.filter((t) => !!t.code).length;
  const duplicates = rows.filter((r) => r.scans > 1 && r.levels.length === 1).length;
  const unmatched = rows.filter((r) => r.status === "unmatched").length;
  const fullyTraced = rows.filter((r) => r.levels.includes("level_0") && r.levels.includes("level_1")).length;

  return {
    rows,
    scannedTx,
    totalTx: all.length,
    scanRate: rate(scannedTx, all.length),
    uniqueCodes: rows.length,
    duplicates,
    unmatched,
    fullyTraced,
    traceRate: rate(fullyTraced, rows.length),
    unitsTraced: sum(rows.map((r) => r.confirmed || r.dispatched)),
    byLevel,
  };
}

export const traceStatusLabel: Record<TraceStatus, string> = {
  complete: "Traced to CDD",
  at_facility: "At health facility",
  at_lga: "Confirmed at LGA",
  in_transit: "Dispatched — awaiting LGA scan",
  unmatched: "No matching State dispatch scan",
  duplicate: "Duplicate scan",
};

export const verifyStatusLabel: Record<VerifyStatus, string> = {
  verified: "Verified",
  short: "Short delivery",
  over: "Over-receipt",
  unconfirmed: "Awaiting EDO confirmation",
  unrecorded: "No State dispatch record",
};

export const cascadeCsv = (rows: CascadeRow[]) => [
  ["State", "LGA", "Medicine", "Allocated (Federal)", "Dispatched (L0)", "Confirmed (L1)", "Variance", "Variance %",
    "State balance", "LGA balance", "SLO", "EDO / Logistic Officer", "Dispatch date", "Receipt date", "Lead days",
    "Barcode matched", "Status"].join(","),
  ...rows.map((r) => [
    r.state, r.lga, medicineLabel(r.medicine), r.allocated, r.dispatched, r.confirmed, r.variance,
    (r.varianceRate * 100).toFixed(1), r.stateBalance, r.lgaBalance, r.slo, r.edo, r.dispatchDate, r.receiptDate,
    r.leadDays ?? "", r.matchedBarcode ? "Yes" : "No", verifyStatusLabel[r.status],
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
].join("\n");
