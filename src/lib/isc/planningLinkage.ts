/**
 * Planning ↔ Distribution linkage intelligence.
 *
 * Joins three independent sources into one end-to-end picture of a campaign:
 *
 *   1. Geo-enabled Microplanning  — the *denominator*: every community that was
 *      planned, its target (eligible) population, distance to its health
 *      facility, terrain and accessibility.
 *   2. Integrated Supervisory Checklist — the *process*: who visited, what was
 *      observed, which behavioural red flags were raised.
 *   3. Medicine Allocation & Accountability ledger — the *numerator*: what was
 *      actually pushed down the cascade and issued to community distributors.
 *
 * From these it derives programme-standard treatment coverage by Community,
 * Ward, LGA and State with confidence intervals, an end-to-end cascade funnel,
 * equity gradients (distance / terrain / accessibility), distributor workload
 * against the recommended population-per-distributor norm, and a ranked set of
 * near-real-time corrective actions sized by the population still untreated.
 *
 * All computation is local and offline — no server round-trip.
 */
import type { LogisticsDataset } from "./medicineAccountability";
import { dice, norm, type ChecklistSite, type CommunityDiagnosis, type NetworkStats } from "./humanPatterns";

/* ─────────────────────────────────────────────────────────── planning rows ── */

export interface PlanRow {
  key: string;            // fuzzy match key (lga + community)
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  targetPop: number;      // eligible / treatable population
  totalPop: number;
  distanceKm: number;
  accessibility: string;
  terrain: string;
}

const txt = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Normalise raw `microplan_entries` rows into planning denominators. */
export function normalizePlanRows(
  entries: Record<string, unknown>[] | null | undefined,
  calcTargetPop: (e: Record<string, unknown>) => number,
): PlanRow[] {
  const out: PlanRow[] = [];
  for (const e of entries ?? []) {
    const community = txt(e.settlement_name) || txt(e.community_name);
    const lga = txt(e.lga);
    if (!community && !lga) continue;
    const targetPop = Math.max(0, Math.round(calcTargetPop(e) || 0));
    out.push({
      key: norm(`${lga} ${community}`),
      state: txt(e.state),
      lga,
      ward: txt(e.ward),
      flhf: txt(e.flhf_name),
      community,
      targetPop,
      totalPop: num(e.estimated_total_population),
      distanceKm: num(e.settlement_distance_to_flhf_km) || num(e.community_distance_to_flhf_km),
      accessibility: txt(e.accessibility),
      terrain: txt(e.terrain_type),
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────── coverage estimation ── */

export type GeoLevel = "State" | "LGA" | "Ward" | "Community";

export interface CoverageNode {
  level: GeoLevel;
  id: string;
  name: string;
  parent: string;         // display path of the parent level
  state: string;
  lga: string;
  ward: string;
  plannedCommunities: number;
  servedCommunities: number;
  visitedCommunities: number;
  targetPop: number;
  issuedUnits: number;    // units issued to distributors (Level 3)
  returnedUnits: number;
  facilityUnits: number;  // units pushed to facilities (Level 2)
  treated: number;        // estimated persons treated
  coverage: number;       // treated / targetPop
  ciLow: number;
  ciHigh: number;
  reachRate: number;      // served communities / planned communities
  status: CoverageStatus;
  untreated: number;
}

export type CoverageStatus = "on_target" | "acceptable" | "sub_optimal" | "critical" | "no_data";

/** Programme-standard effective-coverage bands. */
export const COVERAGE_BANDS: { status: CoverageStatus; label: string; min: number; tone: string }[] = [
  { status: "on_target", label: "On target (≥80%)", min: 0.8, tone: "emerald" },
  { status: "acceptable", label: "Acceptable (65–79%)", min: 0.65, tone: "sky" },
  { status: "sub_optimal", label: "Sub-optimal (50–64%)", min: 0.5, tone: "amber" },
  { status: "critical", label: "Critical (<50%)", min: 0, tone: "rose" },
];

export const bandOf = (coverage: number, hasData: boolean): CoverageStatus =>
  !hasData ? "no_data" : (COVERAGE_BANDS.find((b) => coverage >= b.min)?.status ?? "critical");

/** Wilson score interval for a proportion — stable at small denominators. */
export function wilson(x: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 0];
  const p = Math.min(1, Math.max(0, x / n));
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

interface Served {
  issued: number;
  returned: number;
  facility: number;
  cdds: Set<string>;
  firstDay: string;
}

const blankServed = (): Served => ({ issued: 0, returned: 0, facility: 0, cdds: new Set(), firstDay: "" });

export interface LinkageOptions {
  /** Average units (tablets) consumed per person treated. */
  unitsPerPerson?: number;
  /** Fuzzy-match floor for joining a ledger/checklist site to a planned community. */
  matchFloor?: number;
  /** Recommended target population per community distributor. */
  popPerDistributor?: number;
}

/* Fuzzy resolver: exact key first, then best Dice match inside the same LGA. */
function makeResolver(plan: PlanRow[], floor: number) {
  const exact = new Map<string, PlanRow>();
  const byLga = new Map<string, PlanRow[]>();
  for (const p of plan) {
    if (!exact.has(p.key)) exact.set(p.key, p);
    const l = norm(p.lga);
    const arr = byLga.get(l) ?? [];
    arr.push(p);
    byLga.set(l, arr);
  }
  const cache = new Map<string, { row: PlanRow; score: number } | null>();
  return (lga: string, community: string): { row: PlanRow; score: number } | null => {
    const k = norm(`${lga} ${community}`);
    if (!k) return null;
    if (cache.has(k)) return cache.get(k)!;
    let hit: { row: PlanRow; score: number } | null = null;
    const e = exact.get(k);
    if (e) hit = { row: e, score: 1 };
    else {
      const pool = byLga.get(norm(lga)) ?? plan;
      let best: { row: PlanRow; score: number } | null = null;
      for (const p of pool) {
        const s = dice(community, p.community);
        if (s >= floor && (!best || s > best.score)) best = { row: p, score: s };
      }
      hit = best;
    }
    cache.set(k, hit);
    return hit;
  };
}

export interface PlanningLinkage {
  plan: PlanRow[];
  nodes: Record<GeoLevel, CoverageNode[]>;
  /** Planned communities with no medicine issued and no supervisory visit. */
  untouched: PlanRow[];
  /** Communities served in the ledger that do not exist in the microplan. */
  unplanned: { lga: string; community: string; issued: number }[];
  funnel: { stage: string; communities: number; population: number; rate: number }[];
  equity: EquityBand[];
  workload: WorkloadRow[];
  actions: ProgramAction[];
  totals: {
    plannedCommunities: number;
    targetPop: number;
    treated: number;
    coverage: number;
    ciLow: number;
    ciHigh: number;
    untreated: number;
    matchRate: number;
    unitsPerPerson: number;
  };
}

export interface EquityBand {
  band: string;
  dimension: "Distance to facility" | "Terrain" | "Accessibility";
  communities: number;
  targetPop: number;
  treated: number;
  coverage: number;
}

export interface WorkloadRow {
  cdd: string;
  communities: number;
  targetPop: number;
  issued: number;
  loadRatio: number;      // targetPop / recommended norm
  overStretched: boolean;
}

export interface ProgramAction {
  id: string;
  priority: "immediate" | "high" | "watch";
  title: string;
  rationale: string;
  where: string[];
  populationAtRisk: number;
  owner: string;
}

const dayOf = (d: unknown) => (d ? String(d).slice(0, 10) : "");

export function computePlanningLinkage(
  plan: PlanRow[],
  ds: LogisticsDataset,
  sites: ChecklistSite[],
  opts: LinkageOptions = {},
): PlanningLinkage {
  const unitsPerPerson = Math.max(0.1, opts.unitsPerPerson ?? 1);
  const floor = opts.matchFloor ?? 0.7;
  const popPerDistributor = Math.max(1, opts.popPerDistributor ?? 500);
  const resolve = makeResolver(plan, floor);

  /* 1 ── attach ledger + checklist activity to planned communities */
  const served = new Map<string, Served>();
  const visited = new Set<string>();
  const unplanned = new Map<string, { lga: string; community: string; issued: number }>();
  const cddLoad = new Map<string, { communities: Set<string>; issued: number }>();
  let matched = 0, attempts = 0;

  for (const c of ds.cddIssues ?? []) {
    attempts++;
    const hit = resolve(c.lga, c.community);
    const qty = Number(c.qtyIssued) || 0;
    if (!hit) {
      const k = norm(`${c.lga} ${c.community}`);
      if (!k) continue;
      const u = unplanned.get(k) ?? { lga: c.lga, community: c.community, issued: 0 };
      u.issued += qty;
      unplanned.set(k, u);
      continue;
    }
    matched++;
    const e = served.get(hit.row.key) ?? blankServed();
    e.issued += qty;
    const d = dayOf(c.date);
    if (d && (!e.firstDay || d < e.firstDay)) e.firstDay = d;
    const cdd = txt(c.cddName);
    if (cdd) {
      e.cdds.add(cdd);
      const w = cddLoad.get(cdd) ?? { communities: new Set<string>(), issued: 0 };
      w.communities.add(hit.row.key);
      w.issued += qty;
      cddLoad.set(cdd, w);
    }
    served.set(hit.row.key, e);
  }

  for (const r of ds.returns ?? []) {
    const hit = resolve(r.lga, r.community);
    if (!hit) continue;
    const e = served.get(hit.row.key) ?? blankServed();
    e.returned += Number(r.qtyReturned) || 0;
    served.set(hit.row.key, e);
  }

  /* Level 2 supply is per-facility — spread across that facility's planned communities. */
  const facilityUnits = new Map<string, number>();
  for (const i of ds.issues ?? []) {
    const k = norm(`${i.lga} ${i.facility}`);
    facilityUnits.set(k, (facilityUnits.get(k) ?? 0) + (Number(i.qtyIssued) || 0));
  }
  const planByFacility = new Map<string, PlanRow[]>();
  for (const p of plan) {
    const k = norm(`${p.lga} ${p.flhf}`);
    const arr = planByFacility.get(k) ?? [];
    arr.push(p);
    planByFacility.set(k, arr);
  }
  for (const [fk, units] of facilityUnits) {
    const rows = planByFacility.get(fk);
    if (!rows?.length) continue;
    const totalTp = rows.reduce((s, r) => s + r.targetPop, 0);
    for (const r of rows) {
      const share = totalTp > 0 ? r.targetPop / totalTp : 1 / rows.length;
      const e = served.get(r.key) ?? blankServed();
      e.facility += units * share;
      served.set(r.key, e);
    }
  }

  for (const s of sites ?? []) {
    const hit = resolve(s.lga, s.community || s.ward);
    if (hit) visited.add(hit.row.key);
  }

  /* 2 ── per-community coverage */
  const communityNodes: CoverageNode[] = plan.map((p) => {
    const s = served.get(p.key) ?? blankServed();
    const netUnits = Math.max(0, s.issued - s.returned);
    const treated = Math.min(p.targetPop || Infinity, netUnits / unitsPerPerson);
    const hasData = s.issued > 0 || s.facility > 0;
    const coverage = p.targetPop > 0 ? treated / p.targetPop : 0;
    const [lo, hi] = wilson(Math.round(treated), Math.max(1, p.targetPop));
    return {
      level: "Community" as GeoLevel,
      id: p.key,
      name: p.community || "—",
      parent: [p.flhf, p.ward, p.lga].filter(Boolean).join(" · "),
      state: p.state, lga: p.lga, ward: p.ward,
      plannedCommunities: 1,
      servedCommunities: s.issued > 0 ? 1 : 0,
      visitedCommunities: visited.has(p.key) ? 1 : 0,
      targetPop: p.targetPop,
      issuedUnits: s.issued,
      returnedUnits: s.returned,
      facilityUnits: s.facility,
      treated,
      coverage,
      ciLow: lo, ciHigh: hi,
      reachRate: s.issued > 0 ? 1 : 0,
      status: bandOf(coverage, hasData),
      untreated: Math.max(0, p.targetPop - treated),
    };
  });

  const rollup = (level: GeoLevel, keyOf: (n: CoverageNode) => string, nameOf: (n: CoverageNode) => string,
                  parentOf: (n: CoverageNode) => string): CoverageNode[] => {
    const m = new Map<string, CoverageNode>();
    for (const n of communityNodes) {
      const k = keyOf(n);
      if (!k) continue;
      let e = m.get(k);
      if (!e) {
        e = {
          ...n, level, id: k, name: nameOf(n), parent: parentOf(n),
          plannedCommunities: 0, servedCommunities: 0, visitedCommunities: 0,
          targetPop: 0, issuedUnits: 0, returnedUnits: 0, facilityUnits: 0,
          treated: 0, coverage: 0, ciLow: 0, ciHigh: 0, reachRate: 0,
          status: "no_data", untreated: 0,
        };
        m.set(k, e);
      }
      e.plannedCommunities += 1;
      e.servedCommunities += n.servedCommunities;
      e.visitedCommunities += n.visitedCommunities;
      e.targetPop += n.targetPop;
      e.issuedUnits += n.issuedUnits;
      e.returnedUnits += n.returnedUnits;
      e.facilityUnits += n.facilityUnits;
      e.treated += n.treated;
    }
    for (const e of m.values()) {
      e.coverage = e.targetPop > 0 ? e.treated / e.targetPop : 0;
      const [lo, hi] = wilson(Math.round(e.treated), Math.max(1, e.targetPop));
      e.ciLow = lo; e.ciHigh = hi;
      e.reachRate = e.plannedCommunities > 0 ? e.servedCommunities / e.plannedCommunities : 0;
      e.untreated = Math.max(0, e.targetPop - e.treated);
      e.status = bandOf(e.coverage, e.issuedUnits > 0 || e.facilityUnits > 0);
    }
    return Array.from(m.values()).sort((a, b) => b.untreated - a.untreated);
  };

  const nodes: Record<GeoLevel, CoverageNode[]> = {
    State: rollup("State", (n) => norm(n.state), (n) => n.state || "—", () => "National"),
    LGA: rollup("LGA", (n) => norm(`${n.state}|${n.lga}`), (n) => n.lga || "—", (n) => n.state || "—"),
    Ward: rollup("Ward", (n) => norm(`${n.state}|${n.lga}|${n.ward}`), (n) => n.ward || "—",
      (n) => [n.lga, n.state].filter(Boolean).join(" · ")),
    Community: communityNodes.slice().sort((a, b) => b.untreated - a.untreated),
  };

  /* 3 ── end-to-end funnel */
  const plannedPop = plan.reduce((s, p) => s + p.targetPop, 0);
  const visitedRows = plan.filter((p) => visited.has(p.key));
  const suppliedRows = plan.filter((p) => (served.get(p.key)?.facility ?? 0) > 0);
  const issuedRows = plan.filter((p) => (served.get(p.key)?.issued ?? 0) > 0);
  const treatedPop = communityNodes.reduce((s, n) => s + n.treated, 0);
  const onTargetRows = communityNodes.filter((n) => n.coverage >= 0.8);
  const stage = (label: string, rows: { targetPop: number }[], popOverride?: number) => ({
    stage: label,
    communities: rows.length,
    population: popOverride ?? rows.reduce((s, r) => s + r.targetPop, 0),
    rate: plannedPop > 0 ? (popOverride ?? rows.reduce((s, r) => s + r.targetPop, 0)) / plannedPop : 0,
  });
  const funnel = [
    stage("Planned (microplan)", plan),
    stage("Facility stocked", suppliedRows),
    stage("Issued to distributors", issuedRows),
    stage("Supervised visit", visitedRows),
    stage("Estimated treated", communityNodes, treatedPop),
    stage("Reached ≥80% coverage", onTargetRows),
  ];

  /* 4 ── equity gradients */
  const bandFor = (p: PlanRow): string =>
    p.distanceKm <= 0 ? "Unknown distance"
      : p.distanceKm < 5 ? "<5 km"
      : p.distanceKm < 10 ? "5–10 km"
      : p.distanceKm < 20 ? "10–20 km" : "≥20 km";
  const equityAgg = (dimension: EquityBand["dimension"], of: (p: PlanRow) => string): EquityBand[] => {
    const m = new Map<string, EquityBand>();
    plan.forEach((p, i) => {
      const band = of(p) || "Not recorded";
      const e = m.get(band) ?? { band, dimension, communities: 0, targetPop: 0, treated: 0, coverage: 0 };
      e.communities += 1;
      e.targetPop += p.targetPop;
      e.treated += communityNodes[i]?.treated ?? 0;
      m.set(band, e);
    });
    return Array.from(m.values())
      .map((e) => ({ ...e, coverage: e.targetPop > 0 ? e.treated / e.targetPop : 0 }))
      .sort((a, b) => b.targetPop - a.targetPop);
  };
  const equity = [
    ...equityAgg("Distance to facility", bandFor),
    ...equityAgg("Terrain", (p) => p.terrain),
    ...equityAgg("Accessibility", (p) => p.accessibility),
  ];

  /* 5 ── distributor workload against the population-per-distributor norm */
  const planByKey = new Map(plan.map((p) => [p.key, p]));
  const workload: WorkloadRow[] = Array.from(cddLoad, ([cdd, w]) => {
    const targetPop = Array.from(w.communities).reduce((s, k) => s + (planByKey.get(k)?.targetPop ?? 0), 0);
    const loadRatio = targetPop / popPerDistributor;
    return {
      cdd, communities: w.communities.size, targetPop, issued: w.issued,
      loadRatio, overStretched: loadRatio > 1.25,
    };
  }).sort((a, b) => b.loadRatio - a.loadRatio);

  /* 6 ── near-real-time corrective actions, sized by untreated population */
  const untouched = plan.filter((p) => !served.get(p.key)?.issued && !visited.has(p.key));
  const actions: ProgramAction[] = [];
  const topNames = (rows: { community?: string; name?: string; lga: string }[], n = 5) =>
    rows.slice(0, n).map((r) => `${r.community ?? r.name} (${r.lga})`);

  if (untouched.length) {
    const pop = untouched.reduce((s, p) => s + p.targetPop, 0);
    actions.push({
      id: "untouched",
      priority: "immediate",
      title: `Dispatch to ${untouched.length.toLocaleString()} planned communities with no recorded activity`,
      rationale: "These communities exist in the microplan but have no medicine issue and no supervisory visit — the highest-certainty zero-coverage pocket.",
      where: topNames([...untouched].sort((a, b) => b.targetPop - a.targetPop)),
      populationAtRisk: pop,
      owner: "LGA logistics officer / EDO",
    });
  }

  const criticalLgas = nodes.LGA.filter((n) => n.status === "critical" && n.targetPop > 0).slice(0, 8);
  if (criticalLgas.length) {
    actions.push({
      id: "critical-lga",
      priority: "immediate",
      title: `Mount recovery rounds in ${criticalLgas.length} LGA${criticalLgas.length === 1 ? "" : "s"} below 50% coverage`,
      rationale: "Estimated treatments fall far short of the planned eligible population; a mop-up round is required before the campaign closes.",
      where: criticalLgas.map((n) => `${n.name} — ${(n.coverage * 100).toFixed(0)}% of ${Math.round(n.targetPop).toLocaleString()} eligible`),
      populationAtRisk: criticalLgas.reduce((s, n) => s + n.untreated, 0),
      owner: "State coordinator",
    });
  }

  const stretched = workload.filter((w) => w.overStretched).slice(0, 10);
  if (stretched.length) {
    actions.push({
      id: "workload",
      priority: "high",
      title: `Add distributors where ${stretched.length} are carrying more than the recommended ${popPerDistributor.toLocaleString()} people each`,
      rationale: "Over-stretched distributors correlate with truncated house-to-house rounds and under-treatment in the tail of their catchment.",
      where: stretched.map((w) => `${w.cdd} — ${Math.round(w.targetPop).toLocaleString()} eligible across ${w.communities} communities (${w.loadRatio.toFixed(1)}× norm)`),
      populationAtRisk: stretched.reduce((s, w) => s + Math.max(0, w.targetPop - popPerDistributor), 0),
      owner: "Ward supervisor",
    });
  }

  const farBand = equity.find((e) => e.dimension === "Distance to facility" && e.band === "≥20 km");
  const nearBand = equity.find((e) => e.dimension === "Distance to facility" && e.band === "<5 km");
  if (farBand && nearBand && nearBand.coverage - farBand.coverage > 0.1) {
    actions.push({
      id: "distance-equity",
      priority: "high",
      title: "Fund outreach for communities furthest from their health facility",
      rationale: `Coverage falls from ${(nearBand.coverage * 100).toFixed(0)}% within 5 km to ${(farBand.coverage * 100).toFixed(0)}% beyond 20 km — a distance-driven equity gap, not a demand problem.`,
      where: [`${farBand.communities.toLocaleString()} communities ≥20 km from their facility`],
      populationAtRisk: Math.max(0, farBand.targetPop - farBand.treated),
      owner: "LGA supervisor",
    });
  }

  if (unplanned.size) {
    const rows = Array.from(unplanned.values()).sort((a, b) => b.issued - a.issued);
    actions.push({
      id: "unplanned",
      priority: "watch",
      title: `Reconcile ${rows.length.toLocaleString()} communities served but absent from the microplan`,
      rationale: "Medicines were issued to places the plan does not contain — either the microplan is incomplete or the ledger geography is mis-keyed. Both distort the denominator.",
      where: rows.slice(0, 5).map((r) => `${r.community} (${r.lga}) — ${Math.round(r.issued).toLocaleString()} units`),
      populationAtRisk: 0,
      owner: "Data manager",
    });
  }

  const unsupervised = plan.filter((p) => (served.get(p.key)?.issued ?? 0) > 0 && !visited.has(p.key));
  if (unsupervised.length) {
    actions.push({
      id: "unsupervised",
      priority: "watch",
      title: `Schedule supervision for ${unsupervised.length.toLocaleString()} communities that received medicines unsupervised`,
      rationale: "Distribution happened with no checklist visit, so reported coverage there rests on unverified distributor self-report.",
      where: topNames([...unsupervised].sort((a, b) => b.targetPop - a.targetPop)),
      populationAtRisk: unsupervised.reduce((s, p) => s + p.targetPop, 0),
      owner: "Ward supervisor",
    });
  }

  const [lo, hi] = wilson(Math.round(treatedPop), Math.max(1, plannedPop));
  return {
    plan,
    nodes,
    untouched: untouched.sort((a, b) => b.targetPop - a.targetPop),
    unplanned: Array.from(unplanned.values()).sort((a, b) => b.issued - a.issued),
    funnel,
    equity,
    workload,
    actions: actions.sort((a, b) =>
      ({ immediate: 0, high: 1, watch: 2 })[a.priority] - ({ immediate: 0, high: 1, watch: 2 })[b.priority] ||
      b.populationAtRisk - a.populationAtRisk),
    totals: {
      plannedCommunities: plan.length,
      targetPop: plannedPop,
      treated: treatedPop,
      coverage: plannedPop > 0 ? treatedPop / plannedPop : 0,
      ciLow: lo, ciHigh: hi,
      untreated: Math.max(0, plannedPop - treatedPop),
      matchRate: attempts > 0 ? matched / attempts : 0,
      unitsPerPerson,
    },
  };
}

/* ───────────────────────────────────────── planning-aware intelligence Q&A ── */

export interface LinkedAnswer {
  id: string;
  question: string;
  answer: string;
  detail: string[];
  tone: "info" | "warn" | "danger" | "success";
  metric?: string;
}

const pctS = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Answers the human-patterns questions that only become answerable once the
 * plan (denominator) is joined to the checklist (process) and the ledger
 * (numerator).
 */
export function answerLinkedQuestions(
  link: PlanningLinkage,
  net: NetworkStats,
  diagnoses: CommunityDiagnosis[],
  sites: ChecklistSite[],
): LinkedAnswer[] {
  const out: LinkedAnswer[] = [];
  const t = link.totals;

  out.push({
    id: "expected-coverage",
    question: "What should treatment coverage actually be, against the planned eligible population?",
    answer: t.targetPop > 0
      ? `Estimated ${pctS(t.coverage)} coverage — ${Math.round(t.treated).toLocaleString()} of ${Math.round(t.targetPop).toLocaleString()} eligible people (95% CI ${pctS(t.ciLow)}–${pctS(t.ciHigh)}), leaving ${Math.round(t.untreated).toLocaleString()} untreated.`
      : "No planned target population in the selected project — pick a project whose microplan carries population estimates.",
    metric: t.targetPop > 0 ? pctS(t.coverage) : "n/a",
    tone: t.coverage >= 0.8 ? "success" : t.coverage >= 0.65 ? "info" : t.coverage >= 0.5 ? "warn" : "danger",
    detail: link.nodes.LGA.slice(0, 6).map((n) =>
      `${n.name} — ${pctS(n.coverage)} (CI ${pctS(n.ciLow)}–${pctS(n.ciHigh)}) · ${Math.round(n.untreated).toLocaleString()} untreated`),
  });

  const reached = link.funnel.find((f) => f.stage === "Issued to distributors");
  out.push({
    id: "cascade-leak",
    question: "Where does the cycle leak between planning and the household?",
    answer: reached
      ? `${pctS(reached.rate)} of the planned eligible population sits in a community that actually received medicines; the biggest single drop in the cascade is ${largestDrop(link)}.`
      : "The cascade cannot be traced yet.",
    metric: `${link.untouched.length} untouched communities`,
    tone: link.untouched.length ? "danger" : "success",
    detail: link.funnel.map((f) => `${f.stage} — ${f.communities.toLocaleString()} communities · ${Math.round(f.population).toLocaleString()} people (${pctS(f.rate)})`),
  });

  const far = link.equity.find((e) => e.dimension === "Distance to facility" && e.band === "≥20 km");
  const near = link.equity.find((e) => e.dimension === "Distance to facility" && e.band === "<5 km");
  out.push({
    id: "equity",
    question: "Is under-treatment driven by geography rather than by people?",
    answer: far && near
      ? `Coverage is ${pctS(near.coverage)} within 5 km of a facility and ${pctS(far.coverage)} beyond 20 km — a ${((near.coverage - far.coverage) * 100).toFixed(1)} point access gradient.`
      : "Not enough distance-tagged communities to test the access gradient.",
    metric: far && near ? `${((near.coverage - far.coverage) * 100).toFixed(0)} pt gap` : "n/a",
    tone: far && near && near.coverage - far.coverage > 0.15 ? "warn" : "info",
    detail: link.equity.filter((e) => e.dimension !== "Distance to facility").slice(0, 6)
      .map((e) => `${e.dimension}: ${e.band} — ${pctS(e.coverage)} across ${e.communities.toLocaleString()} communities`),
  });

  const stretched = link.workload.filter((w) => w.overStretched);
  out.push({
    id: "workload-norm",
    question: "Is the distributor workforce sized correctly for the planned population?",
    answer: link.workload.length
      ? `${stretched.length} of ${link.workload.length} distributors carry more eligible people than the recommended norm; the heaviest carries ${Math.round(link.workload[0].targetPop).toLocaleString()} across ${link.workload[0].communities} communities.`
      : "No distributor could be linked to a planned community yet.",
    metric: `${stretched.length} over-stretched`,
    tone: stretched.length ? "warn" : "success",
    detail: link.workload.slice(0, 6).map((w) =>
      `${w.cdd} — ${Math.round(w.targetPop).toLocaleString()} eligible · ${w.communities} communities · ${w.loadRatio.toFixed(1)}× norm`),
  });

  /* Behavioural evidence weighted by the population it puts at risk. */
  const planByKey = new Map(link.plan.map((p) => [norm(`${p.lga} ${p.community}`), p]));
  const causePop = new Map<string, { n: number; pop: number }>();
  for (const s of sites) {
    const p = planByKey.get(norm(`${s.lga} ${s.community || s.ward}`));
    const pop = p?.targetPop ?? 0;
    for (const f of s.flags) {
      const e = causePop.get(f.label) ?? { n: 0, pop: 0 };
      e.n += 1; e.pop += pop;
      causePop.set(f.label, e);
    }
  }
  const ranked = Array.from(causePop.entries()).sort((a, b) => b[1].pop - a[1].pop || b[1].n - a[1].n);
  out.push({
    id: "cause-weighted",
    question: "Which behaviours block the most people, not just the most sites?",
    answer: ranked.length
      ? `“${ranked[0][0]}” is observed at ${ranked[0][1].n} sites covering ${Math.round(ranked[0][1].pop).toLocaleString()} planned eligible people — the largest population exposed to a single behavioural failure.`
      : "No checklist red flag could be matched to a planned community yet.",
    metric: `${ranked.length} weighted causes`,
    tone: ranked.length ? "warn" : "info",
    detail: ranked.slice(0, 8).map(([label, v]) => `${label} — ${v.n} sites · ${Math.round(v.pop).toLocaleString()} people exposed`),
  });

  /* Do socially well-connected communities get better coverage? */
  const netByCommunity = new Map(diagnoses.map((d) => [norm(`${d.lga} ${d.community}`), d]));
  const xs: number[] = [], ys: number[] = [];
  for (const n of link.nodes.Community) {
    const d = netByCommunity.get(norm(`${n.lga} ${n.name}`));
    if (!d || n.targetPop <= 0) continue;
    const degree = d.cdds.reduce((s, c) => s + (net.actors.find((a) => a.id === norm(c))?.partners.length ?? 0), 0);
    xs.push(degree); ys.push(n.coverage);
  }
  const r = pearson(xs, ys);
  out.push({
    id: "social-coverage",
    question: "Does a community's position in the human network change its coverage?",
    answer: xs.length < 5
      ? "Not enough communities are simultaneously present in the plan, the ledger and the network to test this."
      : `Across ${xs.length} matched communities, the correlation between distributor connectedness and coverage is r = ${r.toFixed(2)} — ${Math.abs(r) < 0.2 ? "socially isolated distributors perform no differently" : r > 0 ? "better-connected distributors do reach more people" : "well-connected distributors are, counter-intuitively, under-performing"}.`,
    metric: xs.length >= 5 ? `r = ${r.toFixed(2)}` : "n/a",
    tone: r > 0.3 ? "success" : "info",
    detail: [`${xs.length} communities matched across all three sources.`,
      `Geography fuzzy-match rate from ledger to microplan: ${pctS(link.totals.matchRate)}.`],
  });

  out.push({
    id: "denominator-integrity",
    question: "Can the coverage figure be trusted?",
    answer: `${pctS(link.totals.matchRate)} of distributor issues resolved to a planned community; ${link.unplanned.length.toLocaleString()} served communities are missing from the microplan.`,
    metric: `${link.plan.length.toLocaleString()} planned communities`,
    tone: link.totals.matchRate > 0.85 && link.unplanned.length === 0 ? "success"
      : link.totals.matchRate > 0.6 ? "warn" : "danger",
    detail: [
      `Denominator: ${Math.round(t.targetPop).toLocaleString()} eligible people from the selected project's microplan.`,
      `Numerator: net units issued to distributors ÷ ${t.unitsPerPerson} unit(s) per person treated, capped at the planned eligible population.`,
      `${link.unplanned.slice(0, 3).map((u) => `${u.community} (${u.lga})`).join(", ") || "No unplanned communities."}`,
    ],
  });

  return out;
}

function largestDrop(link: PlanningLinkage): string {
  let worst = { from: "", to: "", drop: 0 };
  for (let i = 1; i < link.funnel.length; i++) {
    const drop = link.funnel[i - 1].rate - link.funnel[i].rate;
    if (drop > worst.drop) worst = { from: link.funnel[i - 1].stage, to: link.funnel[i].stage, drop };
  }
  return worst.drop > 0
    ? `“${worst.from}” → “${worst.to}” (−${(worst.drop * 100).toFixed(1)} points)`
    : "not yet detectable";
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
