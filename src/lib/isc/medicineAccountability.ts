/**
 * Medicine Accountability & Logistics Cascade analytics.
 *
 * Parses raw KoboToolbox submissions of the "MDA Medicine Logistics /
 * Accountability" XLSForm (3-tier: State→LGA, LGA→FLHF, FLHF→CDD) into
 * normalised transaction rows and computes the full indicator suite:
 * received vs distributed, wastage, tiered balances, stockout vulnerability,
 * cascade lead times, downstream push rate, batch/expiry traceability and
 * proof-of-delivery compliance.
 *
 * The parser is prefix-agnostic: Kobo nests fields under group paths
 * (e.g. `group_zp0ev88/group_ff5wt15/l1_qty_received`), so every lookup keys
 * off the leaf name and every repeat is discovered by leaf name too.
 */

/* ── medicine dictionary (from the XLSForm choice lists) ─────────────────── */

export const MEDICINE_LABELS: Record<string, string> = {
  ivermectin__ivm: "Ivermectin (IVM)",
  albendazole__alb: "Albendazole (ALB)",
  praziquantel: "Praziquantel",
  mebendazole: "Mebendazole",
  azithromycin_tablets: "Azithromycin Tablets",
  azithromycin_per_oral_suspension__pos: "Azithromycin POS",
  tetracycline_eye_ointment__teo: "Tetracycline Eye Ointment (TEO)",
};

export const MEDICINES = Object.keys(MEDICINE_LABELS);

export const medicineLabel = (code: string) =>
  MEDICINE_LABELS[code] ?? (code ? code.replace(/_+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Unspecified");

export const LEVEL_LABELS: Record<string, string> = {
  level_1: "Level 1 — State → LGA receipt",
  level_2: "Level 2 — LGA → Health Facility",
  level_3: "Level 3 — Facility → CDD",
};

/* ── low-level helpers ───────────────────────────────────────────────────── */

const leaf = (k: string) => k.slice(k.lastIndexOf("/") + 1);

/** Deep-search a submission (or repeat item) for a leaf field name. */
function get(obj: any, name: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (leaf(k) === name && v !== null && v !== "") return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const hit = get(v, name);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

const str = (v: any) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: any) => {
  const n = Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Collect every repeat array whose key leaf matches `name` (any depth). */
function repeats(obj: any, name: string): any[] {
  const out: any[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) {
        if (leaf(k) === name) out.push(...v.filter((i) => i && typeof i === "object"));
        v.forEach((i) => walk(i));
      } else if (v && typeof v === "object") walk(v);
    }
  };
  walk(obj);
  return out;
}

const hasMedia = (v: any) => {
  const s = str(v);
  return !!s && s !== "0" && s.toLowerCase() !== "null";
};

const dayDiff = (a?: string, b?: string) => {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
};

/* ── normalised transaction shapes ───────────────────────────────────────── */

export interface BaseTx {
  submissionId: string;
  uuid: string;
  date: string;
  state: string;
  lga: string;
  ward: string;
  level: "level_1" | "level_2" | "level_3";
  submittedBy: string;
}

export interface ReceiptTx extends BaseTx {
  level: "level_1";
  medicine: string;
  batch: string;
  expiry: string;
  qtyReceived: number;
  qtyDamaged: number;
  netUsable: number;
  edoName: string;
  sloName: string;
  hasWaybill: boolean;
  hasSignature: boolean;
}

export interface IssueTx extends BaseTx {
  level: "level_2";
  medicine: string;
  batch: string;
  facility: string;
  inCharge: string;
  priorBalance: number;
  qtyIssued: number;
  remainingLga: number;
  hasSignature: boolean;
}

export interface CddTx extends BaseTx {
  level: "level_3";
  medicine: string;
  facility: string;
  community: string;
  cddName: string;
  qtyIssued: number;
  hasPhoto: boolean;
}

export interface LogisticsDataset {
  receipts: ReceiptTx[];
  issues: IssueTx[];
  cddIssues: CddTx[];
  submissions: number;
}

/* ── parsing ─────────────────────────────────────────────────────────────── */

export function parseLogistics(raws: any[]): LogisticsDataset {
  const receipts: ReceiptTx[] = [];
  const issues: IssueTx[] = [];
  const cddIssues: CddTx[] = [];

  for (const raw of raws ?? []) {
    const base = {
      submissionId: str(raw?._id) || "—",
      uuid: str(raw?._uuid),
      date: str(get(raw, "trans_date")) || str(raw?._submission_time).slice(0, 10),
      state: str(get(raw, "State")),
      lga: str(get(raw, "LGA")),
      ward: str(get(raw, "Ward")),
      submittedBy: str(get(raw, "username")) || str(raw?._submitted_by) || "—",
    };
    const roleRaw = str(get(raw, "Transaction_Level_User_Role")).toLowerCase();
    const hasWaybill = hasMedia(get(raw, "Proof_of_Delivery_Waybill_Photo"));
    const hasSignature = hasMedia(get(raw, "EDO_Acknowledgment_Signature"));

    // Level 1 — receipt at LGA
    for (const item of repeats(raw, "group_ff5wt15")) {
      const medicine = str(get(item, "Medicine_Allocated"));
      if (!medicine && !get(item, "l1_qty_received")) continue;
      const qtyReceived = num(get(item, "l1_qty_received"));
      const qtyDamaged = num(get(item, "l1_qty_damaged"));
      receipts.push({
        ...base,
        level: "level_1",
        medicine: medicine || "unspecified",
        batch: str(get(item, "Batch_Lot_Number")) || "—",
        expiry: str(get(item, "l1_expiry_date")),
        qtyReceived,
        qtyDamaged,
        netUsable: Math.max(0, num(get(item, "l1_net_usable_qty")) || qtyReceived - qtyDamaged),
        edoName: str(get(raw, "LGA_Essential_Drug_Officer_EDO_Name")) || "—",
        sloName: str(get(raw, "State_Logistics_Officer_SLO_Name")) || "—",
        hasWaybill,
        hasSignature,
      });
    }

    // Level 2 — LGA → health facility
    for (const item of repeats(raw, "group_nu6dr93")) {
      const medicine = str(get(item, "Medicine_IssuedtoFLHF"));
      if (!medicine && !get(item, "qiflhf")) continue;
      issues.push({
        ...base,
        level: "level_2",
        medicine: medicine || "unspecified",
        batch: str(get(item, "Batch_Lot_Number_001")) || "—",
        facility: str(get(raw, "Health_Facility_Name")) || "—",
        inCharge: str(get(raw, "Health_Facility_In_Charge_Name")) || "—",
        priorBalance: num(get(item, "current_balanace")),
        qtyIssued: num(get(item, "qiflhf")),
        remainingLga: num(get(item, "l2_lga_rem_stock")),
        hasSignature: hasMedia(get(item, "FLHF_In_Charge_Confirmation_Signature")),
      });
    }

    // Level 3 — facility → CDD (repeat of communities, each with medicine repeat)
    for (const community of repeats(raw, "group_xm3rz84")) {
      const facility = str(get(community, "Health_Facility_Name_001")) || str(get(raw, "Health_Facility_Name")) || "—";
      const communityName = str(get(community, "Target_Community_Settlement")) || "—";
      const cddName = str(get(community, "CDD_Name")) || "—";
      for (const item of repeats(community, "group_je4ry53")) {
        const medicine = str(get(item, "Medicine_IssuedtoCDD"));
        if (!medicine && !get(item, "Quantity_Issued_to_CDD")) continue;
        cddIssues.push({
          ...base,
          level: "level_3",
          medicine: medicine || "unspecified",
          facility,
          community: communityName,
          cddName,
          qtyIssued: num(get(item, "Quantity_Issued_to_CDD")),
          hasPhoto: hasMedia(get(item, "CDD_Receipt_Photo_Confirmation")),
        });
      }
    }

    if (!roleRaw) continue; // role is only used for context; parsing is data-driven
  }

  return { receipts, issues, cddIssues, submissions: (raws ?? []).length };
}

/* ── manual allocations (entered by programme managers) ──────────────────── */

export interface Allocation {
  id: string;
  state: string;
  lga: string;          // "" = state-level allocation
  medicine: string;
  quantity: number;
  dispatchDate: string; // state dispatch date → powers State→LGA lead time
  note?: string;
}

/* ── indicator computation ───────────────────────────────────────────────── */

export interface Filters {
  state?: string;
  lga?: string;
  medicine?: string;
  from?: string;
  to?: string;
}

const inRange = (d: string, f: Filters) =>
  (!f.from || d >= f.from) && (!f.to || d <= f.to);

const matches = (t: { state: string; lga: string; medicine: string; date: string }, f: Filters) =>
  (!f.state || t.state === f.state) &&
  (!f.lga || t.lga === f.lga) &&
  (!f.medicine || t.medicine === f.medicine) &&
  inRange(t.date, f);

export function applyFilters(ds: LogisticsDataset, f: Filters): LogisticsDataset {
  return {
    receipts: ds.receipts.filter((t) => matches(t, f)),
    issues: ds.issues.filter((t) => matches(t, f)),
    cddIssues: ds.cddIssues.filter((t) => matches(t, f)),
    submissions: ds.submissions,
  };
}

export interface MedicineRollup {
  medicine: string;
  allocated: number;
  received: number;
  damaged: number;
  netUsable: number;
  issuedToFlhf: number;
  issuedToCdd: number;
  lgaBalance: number;
  flhfBalance: number;
  wastageRate: number;   // damaged / received
  pushRate: number;      // issuedToFlhf / netUsable
  cddPushRate: number;   // issuedToCdd / issuedToFlhf
  allocationFulfilment: number; // received / allocated
}

export interface BatchRow {
  batch: string;
  medicine: string;
  state: string;
  lga: string;
  expiry: string;
  daysToExpiry: number | null;
  received: number;
  damaged: number;
  issued: number;
  balance: number;
  facilities: string[];
  status: "expired" | "critical" | "watch" | "ok" | "unknown";
}

export interface FacilityRow {
  facility: string;
  state: string;
  lga: string;
  ward: string;
  received: number;
  issuedToCdd: number;
  balance: number;
  coverageRatio: number; // balance / received
  lastActivity: string;
  status: "stockout" | "critical" | "low" | "healthy";
}

export interface LeadTimeRow {
  stage: "State → LGA" | "LGA → FLHF" | "FLHF → CDD";
  avgDays: number | null;
  medianDays: number | null;
  n: number;
  slowest: number | null;
}

export interface AccountabilitySummary {
  totals: {
    allocated: number; received: number; damaged: number; netUsable: number;
    issuedToFlhf: number; issuedToCdd: number; lgaBalance: number; flhfBalance: number;
  };
  wastageRate: number;
  pushRate: number;
  pushRateOnTime: number;      // receipts pushed downstream within target window
  targetWindowDays: number;
  stockoutIndex: { facilities: number; atRisk: number; stockout: number; pct: number };
  podCompliance: { l1: number; l2: number; l3: number; overall: number; l1n: number; l2n: number; l3n: number };
  expiry: { expired: number; within90: number; within180: number; unitsAtRisk: number };
  byMedicine: MedicineRollup[];
  byLga: (MedicineRollup & { state: string; lga: string })[];
  byState: (MedicineRollup & { state: string })[];
  batches: BatchRow[];
  facilities: FacilityRow[];
  leadTimes: LeadTimeRow[];
  timeline: { date: string; received: number; toFlhf: number; toCdd: number }[];
}

const pct = (n: number, d: number) => (d > 0 ? n / d : 0);

function avg(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function rollup(
  key: string,
  receipts: ReceiptTx[], issues: IssueTx[], cdd: CddTx[], allocated: number,
): MedicineRollup {
  const received = receipts.reduce((a, r) => a + r.qtyReceived, 0);
  const damaged = receipts.reduce((a, r) => a + r.qtyDamaged, 0);
  const netUsable = receipts.reduce((a, r) => a + r.netUsable, 0);
  const issuedToFlhf = issues.reduce((a, r) => a + r.qtyIssued, 0);
  const issuedToCdd = cdd.reduce((a, r) => a + r.qtyIssued, 0);
  return {
    medicine: key,
    allocated,
    received,
    damaged,
    netUsable,
    issuedToFlhf,
    issuedToCdd,
    lgaBalance: netUsable - issuedToFlhf,
    flhfBalance: issuedToFlhf - issuedToCdd,
    wastageRate: pct(damaged, received),
    pushRate: pct(issuedToFlhf, netUsable),
    cddPushRate: pct(issuedToCdd, issuedToFlhf),
    allocationFulfilment: pct(received, allocated),
  };
}

export interface ComputeOptions {
  targetWindowDays?: number;   // downstream push target (default 7)
  lowStockThreshold?: number;  // facility balance ratio flagged as low (default 0.15)
}

export function computeAccountability(
  ds: LogisticsDataset,
  allocations: Allocation[],
  opts: ComputeOptions = {},
): AccountabilitySummary {
  const targetWindowDays = opts.targetWindowDays ?? 7;
  const lowThreshold = opts.lowStockThreshold ?? 0.15;
  const { receipts, issues, cddIssues } = ds;

  const allocFor = (pred: (a: Allocation) => boolean) =>
    allocations.filter(pred).reduce((a, x) => a + (Number(x.quantity) || 0), 0);

  /* by medicine */
  const medKeys = Array.from(new Set([
    ...receipts.map((r) => r.medicine),
    ...issues.map((r) => r.medicine),
    ...cddIssues.map((r) => r.medicine),
    ...allocations.map((a) => a.medicine),
  ])).filter(Boolean);

  const byMedicine = medKeys.map((m) => rollup(
    m,
    receipts.filter((r) => r.medicine === m),
    issues.filter((r) => r.medicine === m),
    cddIssues.filter((r) => r.medicine === m),
    allocFor((a) => a.medicine === m),
  )).sort((a, b) => b.received - a.received);

  /* by LGA / State */
  const lgaKeys = Array.from(new Set([
    ...receipts.map((r) => `${r.state}||${r.lga}`),
    ...issues.map((r) => `${r.state}||${r.lga}`),
    ...cddIssues.map((r) => `${r.state}||${r.lga}`),
  ])).filter((k) => k !== "||");

  const byLga = lgaKeys.map((k) => {
    const [state, lga] = k.split("||");
    const r = rollup(
      lga,
      receipts.filter((x) => x.state === state && x.lga === lga),
      issues.filter((x) => x.state === state && x.lga === lga),
      cddIssues.filter((x) => x.state === state && x.lga === lga),
      allocFor((a) => a.state === state && a.lga === lga),
    );
    return { ...r, state, lga };
  }).sort((a, b) => b.received - a.received);

  const stateKeys = Array.from(new Set([...receipts, ...issues, ...cddIssues].map((r) => r.state))).filter(Boolean);
  const byState = stateKeys.map((state) => {
    const r = rollup(
      state,
      receipts.filter((x) => x.state === state),
      issues.filter((x) => x.state === state),
      cddIssues.filter((x) => x.state === state),
      allocFor((a) => a.state === state),
    );
    return { ...r, state };
  }).sort((a, b) => b.received - a.received);

  /* batches */
  const today = new Date().toISOString().slice(0, 10);
  const batchMap = new Map<string, BatchRow>();
  for (const r of receipts) {
    const key = `${r.batch}||${r.medicine}||${r.state}||${r.lga}`;
    const row = batchMap.get(key) ?? {
      batch: r.batch, medicine: r.medicine, state: r.state, lga: r.lga,
      expiry: r.expiry, daysToExpiry: null, received: 0, damaged: 0, issued: 0,
      balance: 0, facilities: [], status: "unknown" as const,
    };
    row.received += r.qtyReceived;
    row.damaged += r.qtyDamaged;
    if (!row.expiry && r.expiry) row.expiry = r.expiry;
    batchMap.set(key, row);
  }
  for (const i of issues) {
    const key = `${i.batch}||${i.medicine}||${i.state}||${i.lga}`;
    const row = batchMap.get(key);
    if (!row) continue;
    row.issued += i.qtyIssued;
    if (i.facility && !row.facilities.includes(i.facility)) row.facilities.push(i.facility);
  }
  const batches = Array.from(batchMap.values()).map((b) => {
    const d = b.expiry ? dayDiff(today, b.expiry) : null;
    const status: BatchRow["status"] =
      d === null ? "unknown" : d < 0 ? "expired" : d <= 90 ? "critical" : d <= 180 ? "watch" : "ok";
    return { ...b, daysToExpiry: d, balance: b.received - b.damaged - b.issued, status };
  }).sort((a, b) => (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9));

  /* facilities */
  const facMap = new Map<string, FacilityRow>();
  const touch = (facility: string, state: string, lga: string, ward: string, date: string) => {
    const key = `${facility}||${state}||${lga}`;
    const row = facMap.get(key) ?? {
      facility, state, lga, ward, received: 0, issuedToCdd: 0, balance: 0,
      coverageRatio: 0, lastActivity: date, status: "healthy" as const,
    };
    if (date > row.lastActivity) row.lastActivity = date;
    if (!row.ward && ward) row.ward = ward;
    facMap.set(key, row);
    return row;
  };
  for (const i of issues) touch(i.facility, i.state, i.lga, i.ward, i.date).received += i.qtyIssued;
  for (const c of cddIssues) touch(c.facility, c.state, c.lga, c.ward, c.date).issuedToCdd += c.qtyIssued;
  const facilities = Array.from(facMap.values()).map((f) => {
    const balance = f.received - f.issuedToCdd;
    const ratio = pct(balance, f.received);
    const status: FacilityRow["status"] =
      balance <= 0 ? "stockout" : ratio < lowThreshold ? "critical" : ratio < lowThreshold * 2 ? "low" : "healthy";
    return { ...f, balance, coverageRatio: ratio, status };
  }).sort((a, b) => a.coverageRatio - b.coverageRatio);

  /* lead times */
  // State → LGA: manual dispatch date (per state/LGA/medicine) → receipt date
  const l1Lead: number[] = [];
  for (const r of receipts) {
    const alloc = allocations.find(
      (a) => a.medicine === r.medicine && a.state === r.state && (a.lga === r.lga || !a.lga) && a.dispatchDate,
    );
    const d = alloc ? dayDiff(alloc.dispatchDate, r.date) : null;
    if (d !== null && d >= 0) l1Lead.push(d);
  }
  // LGA → FLHF: first receipt of a batch → first onward issue of that batch
  const firstReceipt = new Map<string, string>();
  for (const r of receipts) {
    const k = `${r.batch}||${r.medicine}||${r.lga}`;
    const cur = firstReceipt.get(k);
    if (!cur || r.date < cur) firstReceipt.set(k, r.date);
  }
  const firstIssue = new Map<string, string>();
  const l2Lead: number[] = [];
  for (const i of issues) {
    const k = `${i.batch}||${i.medicine}||${i.lga}`;
    const start = firstReceipt.get(k);
    const cur = firstIssue.get(`${i.facility}||${i.medicine}||${i.lga}`);
    if (!cur || i.date < cur) firstIssue.set(`${i.facility}||${i.medicine}||${i.lga}`, i.date);
    const d = start ? dayDiff(start, i.date) : null;
    if (d !== null && d >= 0) l2Lead.push(d);
  }
  // FLHF → CDD
  const l3Lead: number[] = [];
  for (const c of cddIssues) {
    const start = firstIssue.get(`${c.facility}||${c.medicine}||${c.lga}`);
    const d = start ? dayDiff(start, c.date) : null;
    if (d !== null && d >= 0) l3Lead.push(d);
  }
  const mkLead = (stage: LeadTimeRow["stage"], xs: number[]): LeadTimeRow => ({
    stage, avgDays: avg(xs), medianDays: median(xs), n: xs.length, slowest: xs.length ? Math.max(...xs) : null,
  });
  const leadTimes = [
    mkLead("State → LGA", l1Lead),
    mkLead("LGA → FLHF", l2Lead),
    mkLead("FLHF → CDD", l3Lead),
  ];

  /* on-time downstream push */
  let onTime = 0;
  let pushable = 0;
  for (const [k, start] of firstReceipt) {
    const [batch, medicine, lga] = k.split("||");
    pushable++;
    const hit = issues.find(
      (i) => i.batch === batch && i.medicine === medicine && i.lga === lga &&
        (dayDiff(start, i.date) ?? 1e9) <= targetWindowDays,
    );
    if (hit) onTime++;
  }

  /* proof of delivery */
  const l1Forms = Array.from(new Map(receipts.map((r) => [r.uuid || r.submissionId, r])).values());
  const l1ok = l1Forms.filter((r) => r.hasWaybill || r.hasSignature).length;
  const l2ok = issues.filter((i) => i.hasSignature).length;
  const l3ok = cddIssues.filter((c) => c.hasPhoto).length;
  const podN = l1Forms.length + issues.length + cddIssues.length;

  /* timeline */
  const tl = new Map<string, { date: string; received: number; toFlhf: number; toCdd: number }>();
  const bump = (date: string, field: "received" | "toFlhf" | "toCdd", qty: number) => {
    if (!date) return;
    const row = tl.get(date) ?? { date, received: 0, toFlhf: 0, toCdd: 0 };
    row[field] += qty;
    tl.set(date, row);
  };
  receipts.forEach((r) => bump(r.date, "received", r.qtyReceived));
  issues.forEach((i) => bump(i.date, "toFlhf", i.qtyIssued));
  cddIssues.forEach((c) => bump(c.date, "toCdd", c.qtyIssued));
  const timeline = Array.from(tl.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totals = {
    allocated: allocations.reduce((a, x) => a + (Number(x.quantity) || 0), 0),
    received: byMedicine.reduce((a, m) => a + m.received, 0),
    damaged: byMedicine.reduce((a, m) => a + m.damaged, 0),
    netUsable: byMedicine.reduce((a, m) => a + m.netUsable, 0),
    issuedToFlhf: byMedicine.reduce((a, m) => a + m.issuedToFlhf, 0),
    issuedToCdd: byMedicine.reduce((a, m) => a + m.issuedToCdd, 0),
    lgaBalance: 0,
    flhfBalance: 0,
  };
  totals.lgaBalance = totals.netUsable - totals.issuedToFlhf;
  totals.flhfBalance = totals.issuedToFlhf - totals.issuedToCdd;

  const atRisk = facilities.filter((f) => f.status !== "healthy").length;
  const stockout = facilities.filter((f) => f.status === "stockout").length;

  return {
    totals,
    wastageRate: pct(totals.damaged, totals.received),
    pushRate: pct(totals.issuedToFlhf, totals.netUsable),
    pushRateOnTime: pct(onTime, pushable),
    targetWindowDays,
    stockoutIndex: { facilities: facilities.length, atRisk, stockout, pct: pct(atRisk, facilities.length) },
    podCompliance: {
      l1: pct(l1ok, l1Forms.length), l2: pct(l2ok, issues.length), l3: pct(l3ok, cddIssues.length),
      overall: pct(l1ok + l2ok + l3ok, podN),
      l1n: l1Forms.length, l2n: issues.length, l3n: cddIssues.length,
    },
    expiry: {
      expired: batches.filter((b) => b.status === "expired").length,
      within90: batches.filter((b) => b.status === "critical").length,
      within180: batches.filter((b) => b.status === "watch").length,
      unitsAtRisk: batches.filter((b) => b.status === "expired" || b.status === "critical")
        .reduce((a, b) => a + Math.max(0, b.balance), 0),
    },
    byMedicine,
    byLga,
    byState,
    batches,
    facilities,
    leadTimes,
    timeline,
  };
}

/* ── manual allocation persistence ───────────────────────────────────────── */

const ALLOC_KEY = "amehnities.isc.medicineAllocations";

export function loadAllocations(scope = "default"): Allocation[] {
  try {
    const raw = localStorage.getItem(`${ALLOC_KEY}:${scope}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveAllocations(rows: Allocation[], scope = "default") {
  try { localStorage.setItem(`${ALLOC_KEY}:${scope}`, JSON.stringify(rows)); } catch { /* quota */ }
}
