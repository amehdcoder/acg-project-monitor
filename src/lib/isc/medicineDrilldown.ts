/**
 * Drill-down builders, alert-threshold engine and KPI documentation registry
 * for the Medicine Accountability dashboard.
 *
 * Every headline supply-integrity KPI (transit shrinkage, expiry risk index,
 * buffer retention ratio, facility equity index) can be exploded into the
 * state / LGA / facility / batch rows that drive it, so a supervisor can move
 * from "5.4% shrinkage" to "Ringim LGA lost 12,400 Ivermectin tablets on the
 * State → LGA leg" in one click.
 */
import type {
  Allocation, AccountabilitySummary, LogisticsDataset, SupplyIntegrity,
} from "./medicineAccountability";
import { medicineLabel } from "./medicineAccountability";

export type DrillKey = "shrinkage" | "expiry" | "buffer" | "equity";

export interface DrillColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** render value as a coloured severity badge */
  badge?: boolean;
}

export interface DrillRow {
  [k: string]: string | number | undefined;
  /** 0 = fine, 1 = watch, 2 = breach — drives row tinting */
  _sev?: number;
}

export interface DrillTable {
  id: string;
  title: string;
  note?: string;
  columns: DrillColumn[];
  rows: DrillRow[];
}

export interface DrillReport {
  key: DrillKey;
  title: string;
  subtitle: string;
  formula: string;
  quality: string[];
  tables: DrillTable[];
}

const pct = (n: number, d: number) => (d > 0 ? n / d : 0);
const p1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const r0 = (n: number) => Math.round(n);

/* ── shrinkage drivers ───────────────────────────────────────────────────── */

interface ScopeShrink {
  scope: string;
  state: string;
  lga: string;
  issued: number;
  received: number;
}

function shrinkageByScope(ds: LogisticsDataset, allocations: Allocation[]) {
  const byState = new Map<string, ScopeShrink>();
  const byLga = new Map<string, ScopeShrink>();
  const add = (m: Map<string, ScopeShrink>, key: string, state: string, lga: string, issued: number, received: number) => {
    const row = m.get(key) ?? { scope: key, state, lga, issued: 0, received: 0 };
    row.issued += issued;
    row.received += received;
    m.set(key, row);
  };

  // Leg A — dispatched allocation vs confirmed LGA receipt
  for (const a of allocations) {
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) continue;
    const rec = ds.receipts.filter(
      (r) => r.medicine === a.medicine && r.state === a.state && (!a.lga || r.lga === a.lga),
    );
    if (!rec.length) continue;
    const got = rec.reduce((s, r) => s + r.qtyReceived, 0);
    add(byState, a.state || "—", a.state || "—", "", qty, got);
    const lga = a.lga || rec[0].lga || "—";
    add(byLga, `${a.state}||${lga}`, a.state || "—", lga, qty, got);
  }

  // Leg C — issued to actively distributing facilities vs confirmed CDD issues
  const active = new Set(ds.cddIssues.map((c) => `${c.facility}||${c.lga}`));
  for (const i of ds.issues) {
    if (!active.has(`${i.facility}||${i.lga}`)) continue;
    add(byState, i.state || "—", i.state || "—", "", i.qtyIssued, 0);
    add(byLga, `${i.state}||${i.lga}`, i.state || "—", i.lga || "—", i.qtyIssued, 0);
  }
  for (const c of ds.cddIssues) {
    add(byState, c.state || "—", c.state || "—", "", 0, c.qtyIssued);
    add(byLga, `${c.state}||${c.lga}`, c.state || "—", c.lga || "—", 0, c.qtyIssued);
  }

  return { byState: Array.from(byState.values()), byLga: Array.from(byLga.values()) };
}

function facilityShrinkage(ds: LogisticsDataset) {
  const m = new Map<string, { state: string; lga: string; facility: string; issued: number; onward: number }>();
  const key = (s: string, l: string, f: string) => `${s}||${l}||${f}`;
  const active = new Set(ds.cddIssues.map((c) => `${c.facility}||${c.lga}`));
  for (const i of ds.issues) {
    if (!active.has(`${i.facility}||${i.lga}`)) continue;
    const k = key(i.state, i.lga, i.facility);
    const row = m.get(k) ?? { state: i.state, lga: i.lga, facility: i.facility || "—", issued: 0, onward: 0 };
    row.issued += i.qtyIssued;
    m.set(k, row);
  }
  for (const c of ds.cddIssues) {
    const k = key(c.state, c.lga, c.facility);
    const row = m.get(k) ?? { state: c.state, lga: c.lga, facility: c.facility || "—", issued: 0, onward: 0 };
    row.onward += c.qtyIssued;
    m.set(k, row);
  }
  return Array.from(m.values());
}

/* ── buffer drivers ──────────────────────────────────────────────────────── */

function bufferByScope(ds: LogisticsDataset, kickoff?: string) {
  const before = (d: string) => (!kickoff ? true : !!d && d <= kickoff);
  const m = new Map<string, { state: string; lga: string; net: number; toFlhf: number; toCdd: number }>();
  const touch = (state: string, lga: string) => {
    const k = `${state}||${lga}`;
    const row = m.get(k) ?? { state: state || "—", lga: lga || "—", net: 0, toFlhf: 0, toCdd: 0 };
    m.set(k, row);
    return row;
  };
  for (const r of ds.receipts) if (before(r.date)) touch(r.state, r.lga).net += r.netUsable;
  for (const i of ds.issues) if (before(i.date)) touch(i.state, i.lga).toFlhf += i.qtyIssued;
  for (const c of ds.cddIssues) if (before(c.date)) touch(c.state, c.lga).toCdd += c.qtyIssued;
  return Array.from(m.values());
}

/* ── equity drivers ──────────────────────────────────────────────────────── */

function facilityAllocations(ds: LogisticsDataset) {
  const m = new Map<string, { state: string; lga: string; facility: string; units: number; lines: number }>();
  for (const i of ds.issues) {
    const k = `${i.state}||${i.lga}||${i.facility}`;
    const row = m.get(k) ?? { state: i.state || "—", lga: i.lga || "—", facility: i.facility || "—", units: 0, lines: 0 };
    row.units += i.qtyIssued;
    row.lines += 1;
    m.set(k, row);
  }
  return Array.from(m.values());
}

/* ── public builder ──────────────────────────────────────────────────────── */

export function buildDrilldown(
  key: DrillKey,
  ds: LogisticsDataset,
  allocations: Allocation[],
  summary: AccountabilitySummary,
  integrity: SupplyIntegrity,
): DrillReport {
  if (key === "shrinkage") {
    const { byState, byLga } = shrinkageByScope(ds, allocations);
    const mk = (rows: ScopeShrink[], withLga: boolean) =>
      rows
        .filter((r) => r.issued > 0)
        .map((r) => {
          const variance = r.issued - r.received;
          const rate = pct(variance, r.issued);
          return {
            state: r.state,
            ...(withLga ? { lga: r.lga } : {}),
            issued: r0(r.issued),
            received: r0(r.received),
            variance: r0(variance),
            rate: p1(rate),
            _sev: rate > 0.05 ? 2 : rate > 0.02 ? 1 : 0,
          } as DrillRow;
        })
        .sort((a, b) => Number(b.variance) - Number(a.variance));

    const fac = facilityShrinkage(ds)
      .filter((f) => f.issued > 0)
      .map((f) => {
        const variance = f.issued - f.onward;
        const rate = pct(variance, f.issued);
        return {
          state: f.state, lga: f.lga, facility: f.facility,
          issued: r0(f.issued), onward: r0(f.onward), variance: r0(variance), rate: p1(rate),
          _sev: rate > 0.05 ? 2 : rate > 0.02 ? 1 : 0,
        } as DrillRow;
      })
      .sort((a, b) => Number(b.variance) - Number(a.variance));

    return {
      key,
      title: "Transit shrinkage — where the units are going missing",
      subtitle: `${r0(integrity.shrinkage.overall.variance).toLocaleString()} units unaccounted of ${r0(integrity.shrinkage.overall.issued).toLocaleString()} issued (${p1(integrity.shrinkage.overall.rate)})`,
      formula: "Shrinkage % = (Quantity issued upstream − Quantity confirmed received downstream) ÷ Quantity issued upstream × 100",
      quality: [
        "Legs with no matched consignment (no allocation entered, or no downstream confirmation yet) are excluded rather than counted as 100% loss.",
        "A negative variance means more was confirmed downstream than recorded upstream — usually an unlogged dispatch, not a gain.",
        "Facility rows only appear once the facility has started reporting CDD issues; facilities that have not begun distribution are not treated as losses.",
      ],
      tables: [
        {
          id: "legs", title: "By cascade leg",
          columns: [
            { key: "stage", label: "Cascade leg" },
            { key: "issued", label: "Issued upstream", align: "right" },
            { key: "received", label: "Confirmed downstream", align: "right" },
            { key: "variance", label: "Variance (units)", align: "right" },
            { key: "rate", label: "Shrinkage", align: "right", badge: true },
            { key: "n", label: "Consignments", align: "right" },
          ],
          rows: integrity.shrinkage.legs.map((l) => ({
            stage: l.stage, issued: r0(l.issued), received: r0(l.received), variance: r0(l.variance),
            rate: p1(l.rate), n: l.n, _sev: l.rate > 0.05 ? 2 : l.rate > 0.02 ? 1 : 0,
          })),
        },
        {
          id: "state", title: "By state",
          columns: [
            { key: "state", label: "State" },
            { key: "issued", label: "Issued", align: "right" },
            { key: "received", label: "Confirmed", align: "right" },
            { key: "variance", label: "Variance", align: "right" },
            { key: "rate", label: "Shrinkage", align: "right", badge: true },
          ],
          rows: mk(byState, false),
        },
        {
          id: "lga", title: "By LGA",
          note: "Ranked by absolute units unaccounted — the top rows are where supervision visits pay off most.",
          columns: [
            { key: "state", label: "State" },
            { key: "lga", label: "LGA" },
            { key: "issued", label: "Issued", align: "right" },
            { key: "received", label: "Confirmed", align: "right" },
            { key: "variance", label: "Variance", align: "right" },
            { key: "rate", label: "Shrinkage", align: "right", badge: true },
          ],
          rows: mk(byLga, true),
        },
        {
          id: "facility", title: "By health facility (FLHF → CDD leg)",
          columns: [
            { key: "state", label: "State" },
            { key: "lga", label: "LGA" },
            { key: "facility", label: "Health facility" },
            { key: "issued", label: "Received from LGA", align: "right" },
            { key: "onward", label: "Issued to CDDs", align: "right" },
            { key: "variance", label: "Variance", align: "right" },
            { key: "rate", label: "Shrinkage", align: "right", badge: true },
          ],
          rows: fac,
        },
      ],
    };
  }

  if (key === "expiry") {
    const batches = integrity.expiryRisk.batchesAtRisk;
    const byLga = new Map<string, { state: string; lga: string; atRisk: number; batches: number }>();
    for (const b of batches) {
      const k = `${b.state}||${b.lga}`;
      const row = byLga.get(k) ?? { state: b.state || "—", lga: b.lga || "—", atRisk: 0, batches: 0 };
      row.atRisk += Math.max(0, b.balance);
      row.batches += 1;
      byLga.set(k, row);
    }
    const stockByLga = new Map<string, number>();
    for (const b of summary.batches) {
      if (b.balance <= 0) continue;
      const k = `${b.state}||${b.lga}`;
      stockByLga.set(k, (stockByLga.get(k) ?? 0) + b.balance);
    }

    return {
      key,
      title: `Expiry risk — short-dated stock within ${integrity.expiryRisk.windowDays} days`,
      subtitle: `${r0(integrity.expiryRisk.stockAtRisk).toLocaleString()} of ${r0(integrity.expiryRisk.totalStock).toLocaleString()} units on hand (${p1(integrity.expiryRisk.index)}) sit in short-dated batches`,
      formula: `Expiry risk index = Units on hand in batches expiring ≤ ${integrity.expiryRisk.windowDays} days ÷ Total units on hand at LGA and facility stores × 100`,
      quality: [
        "Batches with no expiry date recorded on the Level 1 receipt cannot be classified and are excluded from the numerator — the index is therefore a lower bound.",
        "Balance = quantity received − quantity issued onward for the batch; batches already fully issued (balance ≤ 0) carry no risk and are excluded.",
        "When no stock is on hand at all the index is reported as 0% rather than dividing by zero.",
      ],
      tables: [
        {
          id: "batches", title: "Batch-level register",
          columns: [
            { key: "batch", label: "Batch / lot" },
            { key: "medicine", label: "Medicine" },
            { key: "state", label: "State" },
            { key: "lga", label: "LGA" },
            { key: "expiry", label: "Expiry date" },
            { key: "days", label: "Days left", align: "right", badge: true },
            { key: "received", label: "Received", align: "right" },
            { key: "issued", label: "Issued", align: "right" },
            { key: "balance", label: "Units at risk", align: "right" },
            { key: "facilities", label: "Facilities served", align: "right" },
          ],
          rows: batches.map((b) => ({
            batch: b.batch, medicine: medicineLabel(b.medicine), state: b.state || "—", lga: b.lga || "—",
            expiry: b.expiry || "not recorded",
            days: b.daysToExpiry === null ? "—" : b.daysToExpiry < 0 ? `${Math.abs(b.daysToExpiry)}d expired` : `${b.daysToExpiry}d`,
            received: r0(b.received), issued: r0(b.issued), balance: r0(b.balance),
            facilities: b.facilities.length,
            _sev: (b.daysToExpiry ?? 999) < 0 ? 2 : (b.daysToExpiry ?? 999) <= 30 ? 1 : 0,
          })),
        },
        {
          id: "lga", title: "By LGA",
          columns: [
            { key: "state", label: "State" },
            { key: "lga", label: "LGA" },
            { key: "batches", label: "Short-dated batches", align: "right" },
            { key: "atRisk", label: "Units at risk", align: "right" },
            { key: "stock", label: "Units on hand", align: "right" },
            { key: "index", label: "Expiry risk index", align: "right", badge: true },
          ],
          rows: Array.from(byLga.entries()).map(([k, r]) => {
            const stock = stockByLga.get(k) ?? r.atRisk;
            const idx = pct(r.atRisk, stock);
            return {
              state: r.state, lga: r.lga, batches: r.batches, atRisk: r0(r.atRisk), stock: r0(stock),
              index: p1(idx), _sev: idx > 0.15 ? 2 : idx > 0.05 ? 1 : 0,
            } as DrillRow;
          }).sort((a, b) => Number(b.atRisk) - Number(a.atRisk)),
        },
      ],
    };
  }

  if (key === "buffer") {
    const scopes = bufferByScope(ds, integrity.buffer.kickoff || undefined);
    const rowsLga = scopes.map((s) => {
      const retainedLga = Math.max(0, s.net - s.toFlhf);
      const retainedFlhf = Math.max(0, s.toFlhf - s.toCdd);
      const retained = retainedLga + retainedFlhf;
      const ratio = s.toCdd > 0 ? retained / s.toCdd : null;
      const share = retained + s.toCdd > 0 ? retained / (retained + s.toCdd) : 0;
      return {
        state: s.state, lga: s.lga,
        retainedLga: r0(retainedLga), retainedFlhf: r0(retainedFlhf), retained: r0(retained),
        deployed: r0(s.toCdd),
        ratio: ratio === null ? "—" : `${ratio.toFixed(2)} : 1`,
        share: p1(share),
        band: share > 0.6 ? "under-deployed" : share < 0.2 ? "over-deployed" : "balanced",
        _sev: share > 0.6 ? 2 : share < 0.2 ? 1 : 0,
      } as DrillRow;
    }).sort((a, b) => Number(b.retained) - Number(a.retained));

    const byState = new Map<string, { retained: number; deployed: number }>();
    for (const r of rowsLga) {
      const k = String(r.state);
      const cur = byState.get(k) ?? { retained: 0, deployed: 0 };
      cur.retained += Number(r.retained);
      cur.deployed += Number(r.deployed);
      byState.set(k, cur);
    }

    return {
      key,
      title: "Buffer retention — where stock is being held back",
      subtitle: `${r0(integrity.buffer.retained).toLocaleString()} units retained versus ${r0(integrity.buffer.deployedCdd).toLocaleString()} deployed to CDDs (${p1(integrity.buffer.retainedShare)} retained)`,
      formula: "Buffer retention ratio = (LGA balance + Health facility balance) ÷ Quantity deployed to CDDs",
      quality: [
        integrity.buffer.kickoff
          ? `Only transactions dated on or before the campaign kickoff (${integrity.buffer.kickoff}) are counted, so post-kickoff resupply does not distort pre-campaign readiness.`
          : "No campaign kickoff date is set, so all synced transactions are counted. Set a kickoff date to measure pre-campaign readiness only.",
        "Balances are floored at zero: an LGA that reports issuing more than it received shows 0 retained rather than a negative buffer.",
        "Where nothing has been deployed to CDDs yet the ratio is undefined (shown as —) instead of dividing by zero; the retained share is still reported.",
      ],
      tables: [
        {
          id: "state", title: "By state",
          columns: [
            { key: "state", label: "State" },
            { key: "retained", label: "Retained (LGA + HF)", align: "right" },
            { key: "deployed", label: "Deployed to CDDs", align: "right" },
            { key: "ratio", label: "Buffer ratio", align: "right", badge: true },
            { key: "share", label: "Retained share", align: "right" },
          ],
          rows: Array.from(byState.entries()).map(([state, v]) => {
            const share = v.retained + v.deployed > 0 ? v.retained / (v.retained + v.deployed) : 0;
            return {
              state, retained: r0(v.retained), deployed: r0(v.deployed),
              ratio: v.deployed > 0 ? `${(v.retained / v.deployed).toFixed(2)} : 1` : "—",
              share: p1(share), _sev: share > 0.6 ? 2 : share < 0.2 ? 1 : 0,
            } as DrillRow;
          }).sort((a, b) => Number(b.retained) - Number(a.retained)),
        },
        {
          id: "lga", title: "By LGA",
          note: "Under-deployed LGAs are still holding medicines in stores when CDDs should already be mobilised.",
          columns: [
            { key: "state", label: "State" },
            { key: "lga", label: "LGA" },
            { key: "retainedLga", label: "LGA store", align: "right" },
            { key: "retainedFlhf", label: "Facility stores", align: "right" },
            { key: "deployed", label: "To CDDs", align: "right" },
            { key: "ratio", label: "Buffer ratio", align: "right", badge: true },
            { key: "share", label: "Retained share", align: "right" },
            { key: "band", label: "Readiness" },
          ],
          rows: rowsLga,
        },
      ],
    };
  }

  /* equity */
  const facs = facilityAllocations(ds);
  const meanByLga = new Map<string, number>();
  for (const r of integrity.equity.rows) meanByLga.set(`${r.state}||${r.lga}`, r.mean);

  const facRows = facs.map((f) => {
    const mean = meanByLga.get(`${f.state}||${f.lga}`) ?? 0;
    const ratio = mean > 0 ? f.units / mean : 0;
    return {
      state: f.state, lga: f.lga, facility: f.facility,
      units: r0(f.units), lines: f.lines,
      mean: r0(mean),
      ratio: mean > 0 ? `${ratio.toFixed(2)}×` : "—",
      status: mean <= 0 ? "—" : ratio > 1.5 ? "Over-served" : ratio < 0.5 ? "Under-served" : "Within band",
      _sev: mean <= 0 ? 0 : ratio < 0.5 ? 2 : ratio > 1.5 ? 1 : 0,
    } as DrillRow;
  }).sort((a, b) => Number(b.units) - Number(a.units));

  return {
    key: "equity",
    title: "Facility allocation equity — over-served and under-served catchments",
    subtitle: `Volume-weighted CV ${integrity.equity.weightedCv.toFixed(2)} across ${integrity.equity.facilities} facilities in ${integrity.equity.lgas} LGAs`,
    formula: "Facility equity index (CV) = σ(units issued per facility) ÷ mean(units issued per facility), computed within each LGA and volume-weighted across LGAs",
    quality: [
      "LGAs with fewer than two reporting facilities are excluded — dispersion is undefined for a single facility.",
      "The index measures dispersion of issued volumes, not need. A high CV is only inequitable where catchment populations are comparable.",
      "Facilities that received stock but have not yet been captured under an LGA with a computable mean show '—' instead of a fabricated ratio.",
    ],
    tables: [
      {
        id: "lga", title: "Dispersion by LGA",
        columns: [
          { key: "state", label: "State" },
          { key: "lga", label: "LGA" },
          { key: "facilities", label: "Facilities", align: "right" },
          { key: "total", label: "Total issued", align: "right" },
          { key: "mean", label: "Mean per facility", align: "right" },
          { key: "sd", label: "Std deviation", align: "right" },
          { key: "cv", label: "CV", align: "right", badge: true },
          { key: "gini", label: "Gini", align: "right" },
          { key: "min", label: "Min", align: "right" },
          { key: "max", label: "Max", align: "right" },
          { key: "over", label: "Over-served", align: "right" },
          { key: "under", label: "Under-served", align: "right" },
        ],
        rows: integrity.equity.rows.map((r) => ({
          state: r.state, lga: r.lga, facilities: r.facilities, total: r0(r.total), mean: r0(r.mean),
          sd: r0(r.sd), cv: r.cv.toFixed(2), gini: r.gini.toFixed(2), min: r0(r.min), max: r0(r.max),
          over: r.overServed, under: r.underServed,
          _sev: r.band === "inequitable" ? 2 : r.band === "moderate" ? 1 : 0,
        })),
      },
      {
        id: "facility", title: "Facility-level allocations",
        note: "Ratio compares each facility to the mean allocation of its own LGA.",
        columns: [
          { key: "state", label: "State" },
          { key: "lga", label: "LGA" },
          { key: "facility", label: "Health facility" },
          { key: "units", label: "Units issued", align: "right" },
          { key: "lines", label: "Consignments", align: "right" },
          { key: "mean", label: "LGA mean", align: "right" },
          { key: "ratio", label: "vs LGA mean", align: "right", badge: true },
          { key: "status", label: "Assessment" },
        ],
        rows: facRows,
      },
    ],
  };
}

/* ── alert thresholds & notifications ────────────────────────────────────── */

export interface AlertThresholds {
  shrinkageWarn: number;   // fraction, e.g. 0.02
  shrinkageCrit: number;
  expiryWarn: number;
  expiryCrit: number;
  bufferMin: number;       // retained share below this = over-deployed (thin buffer)
  bufferMax: number;       // retained share above this = under-deployed
  equityWarn: number;      // CV
  equityCrit: number;
  notifyEmails: string[];
  emailEnabled: boolean;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  shrinkageWarn: 0.02, shrinkageCrit: 0.05,
  expiryWarn: 0.05, expiryCrit: 0.15,
  bufferMin: 0.2, bufferMax: 0.6,
  equityWarn: 0.25, equityCrit: 0.5,
  notifyEmails: [], emailEnabled: false,
};

const THRESH_KEY = "amehnities.isc.medicineAlertThresholds";

export function loadThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(THRESH_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_THRESHOLDS, ...parsed, notifyEmails: Array.isArray(parsed?.notifyEmails) ? parsed.notifyEmails : [] };
  } catch { return { ...DEFAULT_THRESHOLDS }; }
}

export function saveThresholds(t: AlertThresholds) {
  try { localStorage.setItem(THRESH_KEY, JSON.stringify(t)); } catch { /* quota */ }
}

export interface MedicineAlert {
  id: string;
  kpi: DrillKey;
  severity: "critical" | "warning";
  scope: string;
  title: string;
  detail: string;
  value: string;
  threshold: string;
  action: string;
}

export function evaluateAlerts(
  integrity: SupplyIntegrity,
  drillCache: { shrinkageLga?: DrillRow[]; expiryLga?: DrillRow[]; bufferLga?: DrillRow[] },
  t: AlertThresholds,
): MedicineAlert[] {
  const out: MedicineAlert[] = [];

  /* transit shrinkage */
  const sr = integrity.shrinkage.overall.rate;
  if (sr >= t.shrinkageWarn && integrity.shrinkage.overall.issued > 0) {
    out.push({
      id: "shrinkage-overall",
      kpi: "shrinkage",
      severity: sr >= t.shrinkageCrit ? "critical" : "warning",
      scope: "Programme-wide",
      title: "Transit shrinkage above tolerance",
      detail: `${r0(integrity.shrinkage.overall.variance).toLocaleString()} units issued upstream were never confirmed downstream.`,
      value: p1(sr),
      threshold: `≥ ${p1(sr >= t.shrinkageCrit ? t.shrinkageCrit : t.shrinkageWarn)}`,
      action: "Audit waybills and EDO / Logistic Officer acknowledgements for the worst-performing LGAs before the next dispatch round.",
    });
  }
  for (const r of integrity.shrinkage.legs) {
    if (r.issued > 0 && r.rate >= t.shrinkageWarn) {
      out.push({
        id: `shrinkage-leg-${r.stage}`,
        kpi: "shrinkage",
        severity: r.rate >= t.shrinkageCrit ? "critical" : "warning",
        scope: r.stage,
        title: `High loss on the ${r.stage} leg`,
        detail: `${r0(r.variance).toLocaleString()} units unaccounted across ${r.n} consignments.`,
        value: p1(r.rate),
        threshold: `≥ ${p1(r.rate >= t.shrinkageCrit ? t.shrinkageCrit : t.shrinkageWarn)}`,
        action: "Reconcile the ledger for this leg with the physical stock count.",
      });
    }
  }
  for (const r of (drillCache.shrinkageLga ?? []).slice(0, 8)) {
    const rate = Number(String(r.rate).replace("%", "")) / 100;
    if (!Number.isFinite(rate) || rate < t.shrinkageWarn) continue;
    out.push({
      id: `shrinkage-lga-${r.state}-${r.lga}`,
      kpi: "shrinkage",
      severity: rate >= t.shrinkageCrit ? "critical" : "warning",
      scope: `${r.lga}, ${r.state}`,
      title: "LGA transit shrinkage above tolerance",
      detail: `${Number(r.variance).toLocaleString()} units unaccounted between dispatch and confirmed receipt.`,
      value: String(r.rate),
      threshold: `≥ ${p1(rate >= t.shrinkageCrit ? t.shrinkageCrit : t.shrinkageWarn)}`,
      action: "Schedule a verification visit to the LGA store and re-count the affected batches.",
    });
  }

  /* expiry risk */
  const ei = integrity.expiryRisk.index;
  if (ei >= t.expiryWarn && integrity.expiryRisk.totalStock > 0) {
    out.push({
      id: "expiry-overall",
      kpi: "expiry",
      severity: ei >= t.expiryCrit ? "critical" : "warning",
      scope: "Programme-wide",
      title: `Short-dated stock within ${integrity.expiryRisk.windowDays} days`,
      detail: `${r0(integrity.expiryRisk.stockAtRisk).toLocaleString()} units across ${integrity.expiryRisk.batchesAtRisk.length} batches are close to expiry.`,
      value: p1(ei),
      threshold: `≥ ${p1(ei >= t.expiryCrit ? t.expiryCrit : t.expiryWarn)}`,
      action: "Prioritise short-dated batches for first issue (FEFO) and redistribute to high-throughput facilities.",
    });
  }
  for (const r of (drillCache.expiryLga ?? []).slice(0, 8)) {
    const idx = Number(String(r.index).replace("%", "")) / 100;
    if (!Number.isFinite(idx) || idx < t.expiryWarn) continue;
    out.push({
      id: `expiry-lga-${r.state}-${r.lga}`,
      kpi: "expiry",
      severity: idx >= t.expiryCrit ? "critical" : "warning",
      scope: `${r.lga}, ${r.state}`,
      title: "LGA holding short-dated stock",
      detail: `${Number(r.atRisk).toLocaleString()} of ${Number(r.stock).toLocaleString()} units on hand expire soon.`,
      value: String(r.index),
      threshold: `≥ ${p1(idx >= t.expiryCrit ? t.expiryCrit : t.expiryWarn)}`,
      action: "Move short-dated batches to the highest-volume facilities in the LGA immediately.",
    });
  }

  /* buffer retention */
  const share = integrity.buffer.retainedShare;
  if (integrity.buffer.retained + integrity.buffer.deployedCdd > 0) {
    if (share > t.bufferMax) {
      out.push({
        id: "buffer-under-deployed",
        kpi: "buffer",
        severity: "critical",
        scope: "Programme-wide",
        title: "Medicines still held in stores — CDDs under-supplied",
        detail: `${r0(integrity.buffer.retained).toLocaleString()} units retained versus ${r0(integrity.buffer.deployedCdd).toLocaleString()} deployed to CDDs.`,
        value: p1(share),
        threshold: `> ${p1(t.bufferMax)}`,
        action: "Release warehouse stock to facilities and CDDs before the campaign window closes.",
      });
    } else if (share < t.bufferMin) {
      out.push({
        id: "buffer-thin",
        kpi: "buffer",
        severity: "warning",
        scope: "Programme-wide",
        title: "Buffer stock too thin for resupply",
        detail: `Only ${r0(integrity.buffer.retained).toLocaleString()} units remain in LGA and facility stores.`,
        value: p1(share),
        threshold: `< ${p1(t.bufferMin)}`,
        action: "Confirm a resupply plan — there is little contingency if uptake exceeds projections.",
      });
    }
  }
  for (const r of (drillCache.bufferLga ?? []).slice(0, 8)) {
    const s = Number(String(r.share).replace("%", "")) / 100;
    if (!Number.isFinite(s)) continue;
    if (s > t.bufferMax) {
      out.push({
        id: `buffer-lga-${r.state}-${r.lga}`,
        kpi: "buffer",
        severity: "warning",
        scope: `${r.lga}, ${r.state}`,
        title: "LGA holding back stock from CDDs",
        detail: `${Number(r.retained).toLocaleString()} units retained versus ${Number(r.deployed).toLocaleString()} deployed.`,
        value: String(r.share),
        threshold: `> ${p1(t.bufferMax)}`,
        action: "Follow up with the LGA EDO / Logistic Officer on the outstanding facility dispatch plan.",
      });
    }
  }

  /* equity */
  const cv = integrity.equity.weightedCv;
  if (integrity.equity.rows.length && cv >= t.equityWarn) {
    out.push({
      id: "equity-overall",
      kpi: "equity",
      severity: cv >= t.equityCrit ? "critical" : "warning",
      scope: "Programme-wide",
      title: "Uneven allocation across facilities",
      detail: `${integrity.equity.rows.reduce((a, r) => a + r.underServed, 0)} facilities are under-served and ${integrity.equity.rows.reduce((a, r) => a + r.overServed, 0)} over-served relative to their LGA mean.`,
      value: cv.toFixed(2),
      threshold: `≥ ${(cv >= t.equityCrit ? t.equityCrit : t.equityWarn).toFixed(2)}`,
      action: "Rebalance the next dispatch towards under-served catchments.",
    });
  }
  for (const r of integrity.equity.rows.filter((x) => x.cv >= t.equityWarn).slice(0, 8)) {
    out.push({
      id: `equity-lga-${r.state}-${r.lga}`,
      kpi: "equity",
      severity: r.cv >= t.equityCrit ? "critical" : "warning",
      scope: `${r.lga}, ${r.state}`,
      title: "Inequitable facility allocation within LGA",
      detail: `${r.underServed} under-served and ${r.overServed} over-served of ${r.facilities} facilities (Gini ${r.gini.toFixed(2)}).`,
      value: r.cv.toFixed(2),
      threshold: `≥ ${(r.cv >= t.equityCrit ? t.equityCrit : t.equityWarn).toFixed(2)}`,
      action: "Review the LGA distribution plan against facility catchment populations.",
    });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

export function alertsToHtml(alerts: MedicineAlert[], context: string): string {
  const row = (a: MedicineAlert) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;color:${a.severity === "critical" ? "#b91c1c" : "#b45309"}">
        ${a.severity.toUpperCase()}
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.scope}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.title}<br/><span style="color:#6b7280;font-size:12px">${a.detail}</span></td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${a.value}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">${a.threshold}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#374151">${a.action}</td>
    </tr>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
    <h2 style="margin:0 0 4px">Medicine Accountability — supply integrity alerts</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:13px">${context}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="background:#f3f4f6">
          <th align="left" style="padding:8px">Severity</th>
          <th align="left" style="padding:8px">Scope</th>
          <th align="left" style="padding:8px">Finding</th>
          <th align="right" style="padding:8px">Value</th>
          <th align="right" style="padding:8px">Threshold</th>
          <th align="left" style="padding:8px">Recommended action</th>
        </tr>
      </thead>
      <tbody>${alerts.map(row).join("")}</tbody>
    </table>
    <p style="margin-top:16px;color:#6b7280;font-size:12px">
      Generated by the Amehnities Integrated Supervisory Checklist · Medicine Accountability dashboard.
    </p>
  </div>`;
}
