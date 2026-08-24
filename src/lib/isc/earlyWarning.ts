/**
 * Epidemiological Early Warning & Anomaly Detection
 * -------------------------------------------------
 * Two independent guards over the synced KoboToolbox supervisory data, both
 * computed locally (no server round-trip, no AI dependency):
 *
 *  1. SPATIAL-TEMPORAL OUTBREAK ALERTS — a Kulldorff space-time permutation
 *     scan statistic that flags localized spikes (SAE complaints, swallowing
 *     failures, stalled MDA) *before* they become a full outbreak, plus a
 *     coverage drop-off detector that compares each unit's latest field day
 *     against its own historical baseline with a two-proportion z-test.
 *
 *  2. REPORTING VELOCITY GUARDS — per-reporter and per-unit baselines of
 *     submission cadence and upload lag, so missing submissions, unexpected
 *     delays and erratic (bursty / back-dated) sync patterns surface as soon
 *     as they deviate from that reporter's own history.
 *
 * The space-time permutation model needs no population denominator: the
 * expected count for a (unit, day) cell is derived from the case marginals
 * themselves, which is exactly why it works for surveillance data where the
 * true population at risk on a given day is unknown.
 */

import { resolveChecklistValue } from "@/components/IntegratedSupervisory/checklistSchema";
import { mdaClass, twoProportionTest, type Row } from "./evidencePatterns";

export type { Row };

/* ------------------------------------------------------------------ utils */

const txt = (field: string, v: unknown) =>
  String(resolveChecklistValue(field, v) ?? v ?? "").trim();

const YES = /^(yes|available|true|1)$/i;

/** ISO day (YYYY-MM-DD) of the field visit — falls back to upload time. */
export function fieldDay(r: Row): string {
  const raw = String(r._end ?? r.end ?? r._submission_time ?? "").trim();
  return raw ? raw.slice(0, 10) : "";
}

/** Upload timestamp (ms) or null. */
function uploadedAt(r: Row): number | null {
  const raw = String(r._submission_time ?? "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Visit end timestamp (ms) or null. */
function endedAt(r: Row): number | null {
  const raw = String(r._end ?? r.end ?? "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

const DAY_MS = 86_400_000;
const dayIndex = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation, scaled to be a robust σ estimate. */
function mad(xs: number[], center = median(xs)): number {
  if (xs.length < 2) return 0;
  return 1.4826 * median(xs.map((x) => Math.abs(x - center)));
}

/** Deterministic pseudo-random generator so alerts are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Parent GPS as [lat, lng] from Kobo `_geolocation` or a geopoint string. */
export function rowLatLng(r: Row): [number, number] | null {
  const g = r._geolocation as unknown;
  if (Array.isArray(g) && g.length >= 2) {
    const la = Number(g[0]), ln = Number(g[1]);
    if (Number.isFinite(la) && Number.isFinite(ln) && (la || ln)) return [la, ln];
  }
  const raw = String((r as Record<string, unknown>).GPS_of_Household ?? "").trim();
  if (raw) {
    const [la, ln] = raw.split(/\s+/).map(Number);
    if (Number.isFinite(la) && Number.isFinite(ln) && (la || ln)) return [la, ln];
  }
  return null;
}

/* ------------------------------------------------------- geography levels */

export type GeoLevel = "LGA" | "Ward" | "Community";

const LEVEL_KEYS: Record<GeoLevel, string[]> = {
  LGA: ["State", "LGA"],
  Ward: ["State", "LGA", "Ward"],
  Community: ["State", "LGA", "Ward", "COMMUNITIES"],
};

export function unitOf(r: Row, level: GeoLevel): string {
  const keys = LEVEL_KEYS[level];
  const parts = keys.map((k) => String(r[k] ?? "").trim());
  if (parts.some((p) => !p)) return "";
  return parts.join(" › ");
}

/* ------------------------------------------------ 1. case (signal) definitions */

export type SignalKey = "sae" | "not_swallowed" | "not_completed" | "no_medicine";

export interface SignalDef {
  key: SignalKey;
  label: string;
  /** Which record stream the signal is counted on. */
  source: "parents" | "respondents";
  description: string;
  /** 1 = case, 0 = observed non-case, null = unusable record. */
  read: (r: Row) => 0 | 1 | null;
}

export const SIGNALS: SignalDef[] = [
  {
    key: "sae",
    label: "Serious adverse events (SAE)",
    source: "parents",
    description: "Communities where the monitor recorded an SAE complaint after treatment.",
    read: (r) => {
      const s = txt("Any_SAE_Complain", r.Any_SAE_Complain);
      if (!s) return null;
      return YES.test(s) || /^yes/i.test(s) ? 1 : 0;
    },
  },
  {
    key: "not_swallowed",
    label: "Medicine not swallowed",
    source: "respondents",
    description: "Household respondents who did not swallow all of the medicine they were offered.",
    read: (r) => {
      const s = txt("swallow", (r as Record<string, unknown>).swallow);
      if (!s) return null;
      return /swallowed all offered/i.test(s) ? 0 : 1;
    },
  },
  {
    key: "not_completed",
    label: "MDA not completed",
    source: "parents",
    description: "Supervised communities whose MDA status was Not started, Ongoing or Halted.",
    read: (r) => {
      const c = mdaClass(r);
      if (c === "Unknown") return null;
      return c === "Completed" ? 0 : 1;
    },
  },
  {
    key: "no_medicine",
    label: "Insufficient CDD medicine",
    source: "parents",
    description: "Communities where the CDD did not hold enough medicine to treat the population.",
    read: (r) => {
      const s = txt("Does_CDI_CDD_have_sufficient_d", r.Does_CDI_CDD_have_sufficient_d);
      if (!s) return null;
      return /^(yes|sufficient)/i.test(s) ? 0 : 1;
    },
  },
];

export const signalDef = (k: SignalKey) => SIGNALS.find((s) => s.key === k) ?? SIGNALS[0];

/* ------------------------------------- 2. space-time permutation scan statistic */

export interface ScanOptions {
  level?: GeoLevel;
  /** Longest cluster duration considered, in days. */
  maxTemporalDays?: number;
  /** Max share of all cases a spatial window may hold (Kulldorff default 0.5). */
  maxSpatialFraction?: number;
  /** Monte Carlo replications for the permutation p-value. */
  replications?: number;
  /** Only clusters at or below this p-value are returned. */
  alpha?: number;
}

export interface OutbreakCluster {
  id: string;
  rank: number;
  units: string[];
  centre: string;
  radiusKm: number;
  startDay: string;
  endDay: string;
  durationDays: number;
  observed: number;
  expected: number;
  relativeRisk: number;
  llr: number;
  pValue: number;
  significant: boolean;
  severity: "critical" | "warning" | "watch";
  /** Case records inside the cluster window (drill-down evidence). */
  rows: Row[];
  narrative: string;
}

export interface ScanResult {
  signal: SignalDef;
  level: GeoLevel;
  totalCases: number;
  totalRecords: number;
  units: number;
  days: string[];
  clusters: OutbreakCluster[];
  replications: number;
  /** Set when the data is too thin for a defensible scan. */
  insufficient: string | null;
  /** Daily case curve for the whole study area. */
  curve: { day: string; cases: number; records: number }[];
}

interface Cell { unit: string; dayIdx: number; cases: Row[] }

/**
 * Kulldorff space-time permutation scan.
 *
 * Expected cases in a cylinder are μ = Σ (unit total × day total) / grand total,
 * and the Poisson generalized likelihood ratio
 *   LLR = c·ln(c/μ) + (C−c)·ln((C−c)/(C−μ))   (only when c > μ)
 * is maximised over all spatial × temporal windows. Significance comes from
 * Monte Carlo permutation of the day labels across cases, which preserves both
 * the spatial and temporal marginals exactly — so a cluster only survives when
 * the *joint* space-time concentration is unusual.
 */
export function runSpaceTimeScan(
  parents: Row[],
  respondents: Row[],
  signalKey: SignalKey,
  opts: ScanOptions = {},
): ScanResult {
  const signal = signalDef(signalKey);
  const level = opts.level ?? "Ward";
  const maxT = Math.max(1, opts.maxTemporalDays ?? 7);
  const maxFrac = Math.min(0.9, Math.max(0.1, opts.maxSpatialFraction ?? 0.5));
  const reps = Math.max(49, Math.min(999, opts.replications ?? 199));
  const alpha = opts.alpha ?? 0.05;

  const source = signal.source === "parents" ? parents : respondents;

  const caseRows: Row[] = [];
  const perUnitDay = new Map<string, Cell>();
  const unitCoords = new Map<string, { lat: number; lng: number; n: number }>();
  const dayRecords = new Map<string, number>();
  const dayCases = new Map<string, number>();
  let totalRecords = 0;

  for (const r of source) {
    const unit = unitOf(r, level);
    const day = fieldDay(r);
    if (!unit || !day) continue;
    const v = signal.read(r);
    if (v == null) continue;
    totalRecords++;
    dayRecords.set(day, (dayRecords.get(day) ?? 0) + 1);

    const ll = rowLatLng(r);
    if (ll) {
      const c = unitCoords.get(unit) ?? { lat: 0, lng: 0, n: 0 };
      c.lat += ll[0]; c.lng += ll[1]; c.n++;
      unitCoords.set(unit, c);
    }
    if (v !== 1) continue;

    caseRows.push(r);
    dayCases.set(day, (dayCases.get(day) ?? 0) + 1);
    const key = `${unit}|${day}`;
    const cell = perUnitDay.get(key) ?? { unit, dayIdx: dayIndex(day), cases: [] };
    cell.cases.push(r);
    perUnitDay.set(key, cell);
  }

  const days = Array.from(new Set([...dayRecords.keys()])).sort();
  const curve = days.map((day) => ({
    day,
    cases: dayCases.get(day) ?? 0,
    records: dayRecords.get(day) ?? 0,
  }));

  const units = Array.from(new Set(Array.from(perUnitDay.values()).map((c) => c.unit)));
  const C = caseRows.length;

  const base: ScanResult = {
    signal, level, totalCases: C, totalRecords, units: units.length,
    days, clusters: [], replications: reps, insufficient: null, curve,
  };

  if (C < 5) return { ...base, insufficient: `Only ${C} case${C === 1 ? "" : "s"} of “${signal.label}” — a scan needs at least 5.` };
  if (units.length < 2) return { ...base, insufficient: `Cases sit in a single ${level} — no spatial contrast to scan.` };
  if (days.length < 3) return { ...base, insufficient: "Fewer than 3 field days — no temporal contrast to scan." };

  // Marginals.
  const unitTotal = new Map<string, number>();
  const dayTotal = new Map<number, number>();
  const observations: { unit: string; dayIdx: number; row: Row }[] = [];
  for (const cell of perUnitDay.values()) {
    unitTotal.set(cell.unit, (unitTotal.get(cell.unit) ?? 0) + cell.cases.length);
    dayTotal.set(cell.dayIdx, (dayTotal.get(cell.dayIdx) ?? 0) + cell.cases.length);
    for (const row of cell.cases) observations.push({ unit: cell.unit, dayIdx: cell.dayIdx, row });
  }

  const dayIdxs = Array.from(new Set(observations.map((o) => o.dayIdx))).sort((a, b) => a - b);
  const centroid = (u: string) => {
    const c = unitCoords.get(u);
    return c && c.n ? ([c.lat / c.n, c.lng / c.n] as [number, number]) : null;
  };

  // Spatial neighbour ordering: GPS distance when available, otherwise the
  // administrative hierarchy (same parent unit first) as the adjacency proxy.
  const neighbours = new Map<string, string[]>();
  for (const u of units) {
    const cu = centroid(u);
    const parent = u.split(" › ").slice(0, -1).join(" › ");
    const ordered = units
      .map((v) => {
        const cv = centroid(v);
        const geo = cu && cv ? haversineKm(cu, cv) : null;
        const sameParent = v.split(" › ").slice(0, -1).join(" › ") === parent;
        return { v, d: geo ?? (v === u ? 0 : sameParent ? 1 : 1000) };
      })
      .sort((a, b) => a.d - b.d)
      .map((x) => x.v);
    neighbours.set(u, ordered);
  }

  const cellCases = new Map<string, number>();
  for (const cell of perUnitDay.values()) cellCases.set(`${cell.unit}|${cell.dayIdx}`, cell.cases.length);

  /** Best LLR over all cylinders for a given (unit,dayIdx)→count assignment. */
  function scan(counts: Map<string, number>, collect: boolean) {
    const uTot = new Map<string, number>();
    const dTot = new Map<number, number>();
    for (const [k, n] of counts) {
      const [u, d] = k.split("|");
      uTot.set(u, (uTot.get(u) ?? 0) + n);
      dTot.set(Number(d), (dTot.get(Number(d)) ?? 0) + n);
    }
    let best = 0;
    const found: OutbreakCluster[] = [];

    for (const u of units) {
      const ring = neighbours.get(u)!;
      const window: string[] = [];
      let windowCases = 0;
      for (const v of ring) {
        const vc = uTot.get(v) ?? 0;
        if (windowCases + vc > C * maxFrac && window.length) break;
        window.push(v);
        windowCases += vc;
        if (!windowCases) continue;

        for (let ei = 0; ei < dayIdxs.length; ei++) {
          for (let len = 1; len <= maxT; len++) {
            const si = ei - len + 1;
            if (si < 0) break;
            const span = dayIdxs.slice(si, ei + 1);
            let c = 0, dSum = 0;
            for (const d of span) dSum += dTot.get(d) ?? 0;
            for (const w of window) for (const d of span) c += counts.get(`${w}|${d}`) ?? 0;
            if (c < 2) continue;
            const mu = (windowCases * dSum) / C;
            if (!(c > mu) || mu <= 0 || c >= C) continue;
            const llr =
              c * Math.log(c / mu) + (C - c) * Math.log((C - c) / (C - mu));
            if (!Number.isFinite(llr) || llr <= 0) continue;
            if (llr > best) best = llr;
            if (collect) {
              const centre = centroid(u);
              const radiusKm = centre
                ? Math.max(...window.map((w) => {
                    const cw = centroid(w);
                    return cw ? haversineKm(centre, cw) : 0;
                  }))
                : 0;
              found.push({
                id: `${u}|${span[0]}|${span[span.length - 1]}|${window.length}`,
                rank: 0,
                units: window.slice(),
                centre: u,
                radiusKm,
                startDay: new Date(span[0] * DAY_MS).toISOString().slice(0, 10),
                endDay: new Date(span[span.length - 1] * DAY_MS).toISOString().slice(0, 10),
                durationDays: span[span.length - 1] - span[0] + 1,
                observed: c,
                expected: mu,
                relativeRisk: (c / mu) * ((C - mu) / Math.max(1e-9, C - c)),
                llr,
                pValue: 1,
                significant: false,
                severity: "watch",
                rows: [],
                narrative: "",
              });
            }
          }
        }
      }
    }
    return { best, found };
  }

  const real = scan(cellCases, true);
  if (!real.found.length) return { ...base, insufficient: "No space-time concentration above chance in the current data." };

  // Monte Carlo: shuffle the day labels across cases (permutation model).
  const rand = rng(C * 7919 + units.length * 104729 + dayIdxs.length);
  const caseDays = observations.map((o) => o.dayIdx);
  let exceed = 0;
  for (let r = 0; r < reps; r++) {
    const shuffled = caseDays.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const counts = new Map<string, number>();
    observations.forEach((o, i) => {
      const k = `${o.unit}|${shuffled[i]}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    if (scan(counts, false).best >= real.best) exceed++;
  }

  // Keep non-overlapping clusters, strongest first.
  const sorted = real.found.sort((a, b) => b.llr - a.llr);
  const claimed = new Set<string>();
  const clusters: OutbreakCluster[] = [];
  for (const c of sorted) {
    if (c.units.some((u) => claimed.has(u))) continue;
    c.units.forEach((u) => claimed.add(u));
    // p-value for the top cluster is exact under the permutation; secondary
    // clusters are conservatively scaled by their LLR ratio to the maximum.
    const pTop = (exceed + 1) / (reps + 1);
    c.pValue = clusters.length === 0 ? pTop : Math.min(1, pTop * Math.exp(Math.max(0, real.best - c.llr) / 2));
    c.significant = c.pValue <= alpha;
    c.severity = c.pValue <= 0.01 && c.relativeRisk >= 2 ? "critical" : c.significant ? "warning" : "watch";
    const inWindow = new Set<string>(c.units);
    const s = dayIndex(c.startDay), e = dayIndex(c.endDay);
    c.rows = caseRows.filter((r) => {
      const d = dayIndex(fieldDay(r));
      return inWindow.has(unitOf(r, level)) && d >= s && d <= e;
    });
    c.rank = clusters.length + 1;
    c.narrative =
      `${c.observed} ${signal.label.toLowerCase()} case${c.observed === 1 ? "" : "s"} in ` +
      `${c.units.length} ${level}${c.units.length === 1 ? "" : "s"} over ${c.durationDays} day${c.durationDays === 1 ? "" : "s"} ` +
      `(${c.startDay} → ${c.endDay}) against ${c.expected.toFixed(1)} expected — ` +
      `${c.relativeRisk.toFixed(1)}× the rest of the campaign` +
      (c.significant ? `, unlikely to be chance (p=${c.pValue < 0.001 ? "<0.001" : c.pValue.toFixed(3)}).` : ` (not yet statistically separable, p=${c.pValue.toFixed(3)}).`);
    clusters.push(c);
    if (clusters.length >= 8) break;
  }

  return { ...base, clusters };
}

/* --------------------------------------------- 3. coverage drop-off detector */

export interface CoverageDropoff {
  unit: string;
  day: string;
  latestRate: number;
  baselineRate: number;
  dropPoints: number;
  n: number;
  baselineN: number;
  z: number;
  pValue: number;
  severity: "critical" | "warning" | "watch";
  narrative: string;
  rows: Row[];
}

/**
 * Sudden coverage drop-off: each unit's most recent field day is tested against
 * its own pooled history with a two-proportion z-test, so a unit is only ever
 * compared with itself (no penalty for structurally harder geographies).
 */
export function detectCoverageDropoffs(
  respondents: Row[],
  level: GeoLevel = "Ward",
  opts: { minDrop?: number; minN?: number; alpha?: number } = {},
): CoverageDropoff[] {
  const minDrop = opts.minDrop ?? 0.1;
  const minN = opts.minN ?? 8;
  const alpha = opts.alpha ?? 0.05;

  const byUnit = new Map<string, Map<string, Row[]>>();
  for (const r of respondents) {
    const unit = unitOf(r, level);
    const day = fieldDay(r);
    const s = txt("swallow", (r as Record<string, unknown>).swallow);
    if (!unit || !day || !s) continue;
    const days = byUnit.get(unit) ?? new Map<string, Row[]>();
    (days.get(day) ?? days.set(day, []).get(day)!).push(r);
    byUnit.set(unit, days);
  }

  const swallowed = (rows: Row[]) =>
    rows.filter((r) => /swallowed all offered/i.test(txt("swallow", (r as Record<string, unknown>).swallow))).length;

  const alerts: CoverageDropoff[] = [];
  for (const [unit, days] of byUnit) {
    const ordered = Array.from(days.keys()).sort();
    if (ordered.length < 2) continue;
    const latestDay = ordered[ordered.length - 1];
    const latestRows = days.get(latestDay)!;
    const baseRows = ordered.slice(0, -1).flatMap((d) => days.get(d)!);
    if (latestRows.length < minN || baseRows.length < minN) continue;

    const x1 = swallowed(latestRows), n1 = latestRows.length;
    const x2 = swallowed(baseRows), n2 = baseRows.length;
    const latestRate = x1 / n1, baselineRate = x2 / n2;
    const drop = baselineRate - latestRate;
    if (drop < minDrop) continue;

    const { z, p } = twoProportionTest(x1, n1, x2, n2);
    if (p > alpha) continue;
    const severity: CoverageDropoff["severity"] =
      drop >= 0.25 && p <= 0.01 ? "critical" : drop >= 0.15 ? "warning" : "watch";
    alerts.push({
      unit, day: latestDay, latestRate, baselineRate, dropPoints: drop,
      n: n1, baselineN: n2, z, pValue: p, severity,
      rows: latestRows,
      narrative:
        `Swallowing fell from ${(baselineRate * 100).toFixed(0)}% (${n2} earlier respondents) to ` +
        `${(latestRate * 100).toFixed(0)}% on ${latestDay} (${n1} respondents) — a ${(drop * 100).toFixed(0)}-point drop ` +
        `that is larger than sampling noise (p=${p < 0.001 ? "<0.001" : p.toFixed(3)}).`,
    });
  }

  return alerts.sort((a, b) => b.dropPoints - a.dropPoints);
}

/* ------------------------------------------ 4. reporting velocity guards */

export type VelocityFlagType = "missing" | "delayed" | "erratic" | "backdated" | "burst";

export interface VelocityFlag {
  type: VelocityFlagType;
  severity: "critical" | "warning" | "watch";
  message: string;
}

export interface ReporterVelocity {
  reporter: string;
  designation: string;
  units: string[];
  submissions: number;
  activeDays: number;
  firstDay: string;
  lastDay: string;
  daysSilent: number;
  /** Typical gap (days) between this reporter's own field days. */
  expectedGapDays: number;
  perDayMedian: number;
  latestDayCount: number;
  /** Median upload lag in minutes (visit end → Kobo submission). */
  medianLagMin: number;
  latestLagMin: number;
  lagZ: number;
  /** Robust dispersion of daily volume — high means erratic cadence. */
  cadenceCv: number;
  status: "on-track" | "watch" | "breach";
  flags: VelocityFlag[];
  rows: Row[];
}

export interface UnitSilence {
  unit: string;
  lastDay: string;
  daysSilent: number;
  expectedGapDays: number;
  submissions: number;
  severity: "critical" | "warning";
  narrative: string;
  rows: Row[];
}

export interface VelocityReport {
  asOfDay: string;
  reporters: ReporterVelocity[];
  silentUnits: UnitSilence[];
  totals: {
    reporters: number;
    breaching: number;
    watching: number;
    missing: number;
    delayed: number;
    erratic: number;
    medianLagMin: number;
    onTimeRate: number;
  };
  /** Daily submission volume for the whole programme. */
  timeline: { day: string; submissions: number; reporters: number; medianLagMin: number }[];
}

const reporterOf = (r: Row) => {
  const im = txt("Independent_Monitor_s_Name", r.Independent_Monitor_s_Name);
  const sup = String(r.Name_of_Supervisor ?? "").trim();
  const name = im || sup;
  return name && !/^(unknown|n\/?a|none|-)$/i.test(name) ? name : "";
};

/**
 * Reporting velocity guards — every reporter is judged against their own
 * historical cadence and upload lag, never against a global average, so a
 * genuinely low-volume monitor is not flagged simply for being small.
 */
export function computeReportingVelocity(
  parents: Row[],
  opts: { asOf?: Date; graceDays?: number } = {},
): VelocityReport {
  const all = parents.filter((p) => fieldDay(p));
  const asOfMs = opts.asOf?.getTime()
    ?? Math.max(0, ...all.map((p) => uploadedAt(p) ?? endedAt(p) ?? 0));
  const asOfIdx = asOfMs ? Math.floor(asOfMs / DAY_MS) : 0;
  const asOfDay = asOfMs ? new Date(asOfMs).toISOString().slice(0, 10) : "";

  /* --- global timeline ---------------------------------------------------- */
  const byDay = new Map<string, Row[]>();
  for (const p of all) {
    const d = fieldDay(p);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p);
  }
  const lagOf = (p: Row) => {
    const e = endedAt(p), u = uploadedAt(p);
    return e != null && u != null ? (u - e) / 60000 : null;
  };
  const timeline = Array.from(byDay.keys()).sort().map((day) => {
    const rows = byDay.get(day)!;
    const lags = rows.map(lagOf).filter((x): x is number => x != null);
    return {
      day,
      submissions: rows.length,
      reporters: new Set(rows.map(reporterOf).filter(Boolean)).size,
      medianLagMin: Math.round(median(lags)),
    };
  });

  const globalLags = all.map(lagOf).filter((x): x is number => x != null);
  const globalMedianLag = median(globalLags);
  const globalLagMad = mad(globalLags, globalMedianLag) || Math.max(15, globalMedianLag * 0.5);

  /* --- per reporter ------------------------------------------------------- */
  const groups = new Map<string, Row[]>();
  for (const p of all) {
    const who = reporterOf(p);
    if (!who) continue;
    (groups.get(who) ?? groups.set(who, []).get(who)!).push(p);
  }

  const reporters: ReporterVelocity[] = [];
  for (const [reporter, rows] of groups) {
    const days = Array.from(new Set(rows.map(fieldDay))).sort();
    if (!days.length) continue;
    const idxs = days.map(dayIndex);
    const gaps = idxs.slice(1).map((d, i) => d - idxs[i]);
    const expectedGapDays = gaps.length ? Math.max(1, median(gaps)) : 1;
    const lastDay = days[days.length - 1];
    const daysSilent = asOfIdx ? Math.max(0, asOfIdx - dayIndex(lastDay)) : 0;

    const perDay = days.map((d) => rows.filter((r) => fieldDay(r) === d).length);
    const perDayMedian = median(perDay);
    const latestDayCount = perDay[perDay.length - 1];
    const cadenceCv = perDayMedian ? mad(perDay, perDayMedian) / perDayMedian : 0;

    const lags = rows.map(lagOf).filter((x): x is number => x != null);
    const medianLagMin = median(lags);
    const latestRows = rows.filter((r) => fieldDay(r) === lastDay);
    const latestLags = latestRows.map(lagOf).filter((x): x is number => x != null);
    const latestLagMin = median(latestLags);
    const lagZ = globalLagMad ? (latestLagMin - globalMedianLag) / globalLagMad : 0;

    const flags: VelocityFlag[] = [];
    const grace = opts.graceDays ?? 1;
    if (daysSilent > expectedGapDays + grace) {
      const over = daysSilent - expectedGapDays;
      flags.push({
        type: "missing",
        severity: over >= expectedGapDays * 2 ? "critical" : "warning",
        message: `Silent for ${daysSilent} day${daysSilent === 1 ? "" : "s"} — this reporter normally submits every ${expectedGapDays.toFixed(0)} day${expectedGapDays === 1 ? "" : "s"}. ${Math.round(over / expectedGapDays * perDayMedian) || 1} submission(s) look missing.`,
      });
    }
    if (latestLags.length && lagZ >= 3) {
      flags.push({
        type: "delayed",
        severity: lagZ >= 6 ? "critical" : "warning",
        message: `Last upload lagged ${formatLag(latestLagMin)} behind the visit versus a programme norm of ${formatLag(globalMedianLag)} (${lagZ.toFixed(1)}σ).`,
      });
    }
    const backdated = rows.filter((r) => {
      const e = endedAt(r), u = uploadedAt(r);
      return e != null && u != null && u - e > 3 * DAY_MS;
    }).length;
    if (backdated >= Math.max(2, rows.length * 0.15)) {
      flags.push({
        type: "backdated",
        severity: "warning",
        message: `${backdated} of ${rows.length} checklists were uploaded more than 3 days after the visit — the field record and the sync record disagree.`,
      });
    }
    if (days.length >= 3 && cadenceCv >= 1) {
      flags.push({
        type: "erratic",
        severity: cadenceCv >= 2 ? "warning" : "watch",
        message: `Daily volume swings wildly (robust CV ${cadenceCv.toFixed(1)}): ${perDay.join(", ")} submissions per field day.`,
      });
    }
    const bursts = countBursts(rows);
    if (bursts >= 5) {
      flags.push({
        type: "burst",
        severity: bursts >= 10 ? "warning" : "watch",
        message: `${bursts} checklists uploaded inside a single 10-minute window — consistent with bulk end-of-day entry rather than live field capture.`,
      });
    }

    const status: ReporterVelocity["status"] = flags.some((f) => f.severity === "critical")
      ? "breach"
      : flags.length ? "watch" : "on-track";

    reporters.push({
      reporter,
      designation: txt("Designation", rows[0]?.Designation) || "—",
      units: Array.from(new Set(rows.map((r) => unitOf(r, "LGA")).filter(Boolean))).slice(0, 6),
      submissions: rows.length,
      activeDays: days.length,
      firstDay: days[0],
      lastDay,
      daysSilent,
      expectedGapDays,
      perDayMedian,
      latestDayCount,
      medianLagMin,
      latestLagMin,
      lagZ,
      cadenceCv,
      status,
      flags,
      rows,
    });
  }

  reporters.sort((a, b) => {
    const rank = { breach: 0, watch: 1, "on-track": 2 } as const;
    return rank[a.status] - rank[b.status] || b.daysSilent - a.daysSilent;
  });

  /* --- silent units ------------------------------------------------------- */
  const unitRows = new Map<string, Row[]>();
  for (const p of all) {
    const u = unitOf(p, "Ward");
    if (!u) continue;
    (unitRows.get(u) ?? unitRows.set(u, []).get(u)!).push(p);
  }
  const silentUnits: UnitSilence[] = [];
  for (const [unit, rows] of unitRows) {
    const days = Array.from(new Set(rows.map(fieldDay))).sort();
    const idxs = days.map(dayIndex);
    const gaps = idxs.slice(1).map((d, i) => d - idxs[i]);
    const expectedGapDays = gaps.length ? Math.max(1, median(gaps)) : 2;
    const lastDay = days[days.length - 1];
    const daysSilent = asOfIdx ? Math.max(0, asOfIdx - dayIndex(lastDay)) : 0;
    if (daysSilent <= expectedGapDays + 1) continue;
    silentUnits.push({
      unit, lastDay, daysSilent, expectedGapDays, submissions: rows.length,
      severity: daysSilent >= expectedGapDays * 3 ? "critical" : "warning",
      narrative: `No checklist since ${lastDay} (${daysSilent} days) — this ward previously reported every ${expectedGapDays.toFixed(0)} day${expectedGapDays === 1 ? "" : "s"} across ${rows.length} submissions.`,
      rows,
    });
  }
  silentUnits.sort((a, b) => b.daysSilent - a.daysSilent);

  const onTime = globalLags.filter((l) => l <= 24 * 60).length;
  return {
    asOfDay,
    reporters,
    silentUnits,
    totals: {
      reporters: reporters.length,
      breaching: reporters.filter((r) => r.status === "breach").length,
      watching: reporters.filter((r) => r.status === "watch").length,
      missing: reporters.filter((r) => r.flags.some((f) => f.type === "missing")).length,
      delayed: reporters.filter((r) => r.flags.some((f) => f.type === "delayed" || f.type === "backdated")).length,
      erratic: reporters.filter((r) => r.flags.some((f) => f.type === "erratic" || f.type === "burst")).length,
      medianLagMin: Math.round(globalMedianLag),
      onTimeRate: globalLags.length ? onTime / globalLags.length : 0,
    },
    timeline,
  };
}

/** Largest number of uploads by one reporter inside any 10-minute window. */
function countBursts(rows: Row[]): number {
  const ts = rows.map(uploadedAt).filter((x): x is number => x != null).sort((a, b) => a - b);
  let best = 0, j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > 10 * 60000) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

export function formatLag(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${(m / 60).toFixed(1)} h`;
  return `${(m / 1440).toFixed(1)} days`;
}
