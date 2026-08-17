/**
 * Decision Intelligence — four operational questions answered from the three
 * live sources already joined on the Human patterns & networks tab
 * (Medicine Accountability ledger · Integrated Supervisory Checklist ·
 * Geo-enabled Microplanning):
 *
 *   1. "Who delays us?"   — Brandes betweenness centrality over the handover
 *                            graph, weighted by observed delay attribution.
 *   2. "Why coverage low?"— OLS multiple regression of community coverage on
 *                            programme drivers (standardised betas, p, R²).
 *   3. "Is this diversion?"— Z-score of issued-vs-peer-expected combined with
 *                            unaccounted foil % (issued − distributed − returned).
 *   4. "Will we fail?"     — Naive Bayes with Laplace smoothing giving
 *                            P(Fail | Delay, NoSupervision).
 *
 * Everything is local, dependency-free and recomputed on every render.
 */
import type { LogisticsDataset } from "./medicineAccountability";
import type { CommunityDiagnosis, NetworkStats, ChecklistSite, Actor } from "./humanPatterns";
import { norm, ROLE_SHORT } from "./humanPatterns";
import { tTestPValue } from "@/lib/statisticalInference";

/* ────────────────────────────────────────── 1. Who delays us? (centrality) ── */

export interface DelayBroker {
  id: string;
  name: string;
  role: string;
  /** Share of all shortest supply paths that pass through this actor (0…1). */
  pathShare: number;
  betweenness: number;
  degree: number;
  /** Communities reachable through this actor. */
  communities: number;
  /** Mean commencement lag (days) of the communities they touch. */
  meanLagDays: number;
  /** Mean lag of every other community — the counterfactual. */
  baselineLagDays: number;
  /** Excess delay attributable to this actor's paths, in days. */
  excessLagDays: number;
  lateCommunities: number;
  statement: string;
}

/** Brandes betweenness centrality on the undirected handover graph. */
export function betweenness(nodes: string[], edges: { a: string; b: string }[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (!adj.has(e.a) || !adj.has(e.b)) continue;
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const cb = new Map<string, number>(nodes.map((n) => [n, 0]));

  for (const s of nodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>(nodes.map((n) => [n, []]));
    const sigma = new Map<string, number>(nodes.map((n) => [n, 0]));
    const dist = new Map<string, number>(nodes.map((n) => [n, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];
    let qi = 0;
    while (qi < queue.length) {
      const v = queue[qi++];
      stack.push(v);
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) { dist.set(w, dist.get(v)! + 1); queue.push(w); }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }
    const delta = new Map<string, number>(nodes.map((n) => [n, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
    }
  }
  // undirected → each pair counted twice
  for (const [k, v] of cb) cb.set(k, v / 2);
  return cb;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function whoDelaysUs(
  net: NetworkStats,
  diag: CommunityDiagnosis[],
  lateStartDays = 3,
): DelayBroker[] {
  const nodes = net.actors.map((a) => a.id);
  if (nodes.length < 3) return [];
  const cb = betweenness(nodes, net.ties.map((t) => ({ a: t.a, b: t.b })));
  const n = nodes.length;
  const pairs = (n - 1) * (n - 2) / 2;   // normalising constant for undirected graphs

  const realLag = diag.filter((d) => d.lagDays > 0 && d.lagDays < 900);
  const globalLag = mean(realLag.map((d) => d.lagDays));

  const byActor = new Map<string, CommunityDiagnosis[]>();
  for (const d of diag) {
    for (const c of d.cdds) {
      const id = norm(c);
      (byActor.get(id) ?? byActor.set(id, []).get(id)!).push(d);
    }
  }
  // an actor also "touches" every community in the facilities/LGAs they serve
  const touch = (a: Actor): CommunityDiagnosis[] => {
    const direct = byActor.get(a.id) ?? [];
    if (direct.length) return direct;
    const facs = new Set(a.facilities.map(norm));
    const lgas = new Set(a.lgas.map(norm));
    return diag.filter((d) => (facs.size && facs.has(norm(d.facility))) || (lgas.size && lgas.has(norm(d.lga))));
  };

  const out: DelayBroker[] = net.actors.map((a) => {
    const b = cb.get(a.id) ?? 0;
    const pathShare = pairs > 0 ? Math.min(1, b / pairs) : 0;
    const mine = touch(a);
    const myLags = mine.filter((d) => d.lagDays > 0 && d.lagDays < 900).map((d) => d.lagDays);
    const mineKeys = new Set(mine.map((d) => d.key));
    const others = realLag.filter((d) => !mineKeys.has(d.key)).map((d) => d.lagDays);
    const m = mean(myLags);
    const base = others.length ? mean(others) : globalLag;
    const role = a.roles.map((r) => ROLE_SHORT[r]).join("/") || "Actor";
    return {
      id: a.id,
      name: a.name,
      role,
      pathShare,
      betweenness: b,
      degree: a.partners.length,
      communities: mine.length,
      meanLagDays: m,
      baselineLagDays: base,
      excessLagDays: m - base,
      lateCommunities: mine.filter((d) => d.lagDays > lateStartDays && d.lagDays < 900).length,
      statement:
        `${a.name} (${role}${a.lgas[0] ? ` · ${a.lgas[0]}` : ""}) lies on ${(pathShare * 100).toFixed(0)}% of supply paths; ` +
        (myLags.length
          ? `communities on those paths commence ${m.toFixed(1)} days after facility stocking vs ${base.toFixed(1)} days elsewhere (${(m - base) >= 0 ? "+" : ""}${(m - base).toFixed(1)} d).`
          : "no commencement lag observed on their paths yet."),
    };
  });

  return out
    .filter((d) => d.pathShare > 0 || d.excessLagDays > 0)
    .sort((x, y) =>
      (y.pathShare * Math.max(0, y.excessLagDays) + y.pathShare) -
      (x.pathShare * Math.max(0, x.excessLagDays) + x.pathShare))
    .slice(0, 12);
}

/* ────────────────────────────────────── 2. Why coverage low? (regression) ── */

export interface RegressionTerm {
  key: string;
  label: string;
  coefficient: number;      // raw OLS beta (coverage points per unit)
  standardized: number;     // beta on standardised scale (comparable)
  se: number;
  tStat: number;
  pValue: number;
  significant: boolean;
  mean: number;
  direction: "increases" | "reduces";
}

export interface CoverageRegression {
  n: number;
  r2: number;
  adjR2: number;
  intercept: number;
  terms: RegressionTerm[];
  narrative: string;
}

const PREDICTORS: { key: string; label: string; get: (d: CommunityDiagnosis) => number }[] = [
  { key: "lag", label: "Commencement lag (days)", get: (d) => (d.lagDays > 0 && d.lagDays < 900 ? d.lagDays : 0) },
  { key: "nosup", label: "No supervisory visit", get: (d) => (hasCause(d, /supervis/i) ? 1 : 0) },
  { key: "untrained", label: "CDDs not trained", get: (d) => (hasCause(d, /train/i) ? 1 : 0) },
  { key: "stipend", label: "Stipend not received", get: (d) => (hasCause(d, /stipend|payment/i) ? 1 : 0) },
  { key: "stockout", label: "Facility stockout / never supplied", get: (d) => (d.facilityIssued <= 0 || hasCause(d, /stock|never received/i) ? 1 : 0) },
  { key: "mobilise", label: "No community mobilisation", get: (d) => (hasCause(d, /mobilis|mobiliz|announce/i) ? 1 : 0) },
  { key: "access", label: "Access / distance constraint", get: (d) => (hasCause(d, /km from|hard-to-reach|terrain|insecur/i) ? 1 : 0) },
  { key: "load", label: "Eligible people per distributor (00s)", get: (d) => (d.cdds.length && d.targetPop ? d.targetPop / d.cdds.length / 100 : 0) },
];

function hasCause(d: CommunityDiagnosis, re: RegExp): boolean {
  return d.causes.some((c) => re.test(c.label) || re.test(c.cause));
}

/** Solve (XᵀX)b = Xᵀy by Gauss–Jordan with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c];
    for (let j = c; j <= n; j++) M[c][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

/** Matrix inverse (used for the coefficient covariance matrix). */
function inverse(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row.slice(n));
}

const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
};

export function whyCoverageLow(diag: CommunityDiagnosis[]): CoverageRegression | null {
  const rows = diag.filter((d) => d.facilityIssued > 0 || d.received > 0);
  if (rows.length < 12) return null;

  // keep only predictors that actually vary in this scope
  const used = PREDICTORS.filter((p) => sd(rows.map(p.get)) > 1e-9);
  if (!used.length) return null;

  const y = rows.map((d) => d.coverage);
  const X = rows.map((d) => [1, ...used.map((p) => p.get(d))]);
  const k = used.length + 1;

  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const beta = solve(XtX.map((r) => [...r]), [...Xty]);
  if (!beta) return null;
  const inv = inverse(XtX);

  const yMean = mean(y);
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < rows.length; i++) {
    const fit = X[i].reduce((s, v, j) => s + v * beta[j], 0);
    ssRes += (y[i] - fit) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const n = rows.length;
  const df = Math.max(1, n - k);
  const mse = ssRes / df;
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const adjR2 = 1 - (1 - r2) * ((n - 1) / df);
  const sdY = sd(y) || 1;

  const terms: RegressionTerm[] = used.map((p, i) => {
    const col = rows.map(p.get);
    const sX = sd(col);
    const coef = beta[i + 1];
    const se = inv ? Math.sqrt(Math.max(0, mse * inv[i + 1][i + 1])) : 0;
    const t = se > 0 ? coef / se : 0;
    const pv = se > 0 ? tTestPValue(t, df) : 1;
    return {
      key: p.key,
      label: p.label,
      coefficient: coef,
      standardized: (coef * sX) / sdY,
      se,
      tStat: t,
      pValue: pv,
      significant: pv < 0.05,
      mean: mean(col),
      direction: coef >= 0 ? "increases" : "reduces",
    };
  }).sort((a, b) => Math.abs(b.standardized) - Math.abs(a.standardized));

  const drivers = terms.filter((t) => t.significant && t.coefficient < 0).slice(0, 3);
  const narrative = drivers.length
    ? `Coverage is driven down most by ${drivers.map((d) =>
        `${d.label.toLowerCase()} (β=${d.standardized.toFixed(2)}, ${d.pValue < 0.001 ? "p<0.001" : `p=${d.pValue.toFixed(3)}`})`).join("; ")}. ` +
      `The model explains ${(r2 * 100).toFixed(0)}% of the variance in community coverage across ${n} communities.`
    : `No single driver reaches significance yet across ${n} communities (R² = ${(r2 * 100).toFixed(0)}%). Keep syncing — the model sharpens as more communities report.`;

  return { n, r2, adjR2, intercept: beta[0], terms, narrative };
}

/* ───────────────────────────────────── 3. Is this diversion? (Z + foil %) ── */

export interface DiversionSignal {
  id: string;
  scope: "facility" | "actor";
  name: string;
  context: string;          // LGA / role
  issued: number;
  distributed: number;
  returned: number;
  unaccounted: number;
  /** (issued − distributed − returned) / issued. */
  foilPct: number;
  expected: number;         // peer-expected issue volume
  zScore: number;
  signatureRate: number;
  risk: number;             // 0…100 composite
  verdict: "clear" | "review" | "investigate";
  reasons: string[];
}

const zOf = (v: number, m: number, s: number) => (s > 0 ? (v - m) / s : 0);

export function isThisDiversion(
  ds: LogisticsDataset,
  net: NetworkStats,
  diag: CommunityDiagnosis[],
): DiversionSignal[] {
  const out: DiversionSignal[] = [];

  /* facility ledger: issued in (Level 2) vs issued out to CDDs (Level 3) vs returns */
  type F = { name: string; lga: string; issued: number; distributed: number; returned: number; signed: number; n: number };
  const facs = new Map<string, F>();
  const fkey = (lga: string, fac: string) => norm(`${lga} ${fac}`);
  const touch = (lga: string, fac: string): F => {
    const k = fkey(lga, fac);
    let e = facs.get(k);
    if (!e) { e = { name: fac || "(unnamed facility)", lga, issued: 0, distributed: 0, returned: 0, signed: 0, n: 0 }; facs.set(k, e); }
    return e;
  };
  for (const i of ds.issues) {
    const e = touch(i.lga, i.facility);
    e.issued += Number(i.qtyIssued) || 0;
    e.n++; if (i.hasSignature) e.signed++;
  }
  for (const c of ds.cddIssues) {
    const e = touch(c.lga, c.facility);
    e.distributed += Number(c.qtyIssued) || 0;
  }
  for (const r of ds.returns) {
    if (!r.facility) continue;
    touch(r.lga, r.facility).returned += Number(r.qtyReturned) || 0;
  }

  const facList = Array.from(facs.entries()).filter(([, f]) => f.issued > 0);
  const fIssued = facList.map(([, f]) => f.issued);
  const fMean = mean(fIssued), fSd = sd(fIssued);

  for (const [k, f] of facList) {
    const unaccounted = Math.max(0, f.issued - f.distributed - f.returned);
    const foilPct = f.issued > 0 ? unaccounted / f.issued : 0;
    const z = zOf(f.issued, fMean, fSd);
    const sig = f.n ? f.signed / f.n : 0;
    const reasons: string[] = [];
    if (foilPct > 0.15) reasons.push(`${(foilPct * 100).toFixed(0)}% of stock unaccounted for (not distributed, not returned)`);
    if (Math.abs(z) >= 2) reasons.push(`Issue volume is ${z.toFixed(1)}σ ${z > 0 ? "above" : "below"} peer facilities`);
    if (sig < 0.5 && f.n >= 2) reasons.push(`Proof-of-delivery on only ${(sig * 100).toFixed(0)}% of issues`);
    const risk = Math.min(100, Math.round(foilPct * 70 + Math.min(2.5, Math.abs(z)) * 8 + (1 - sig) * 15));
    out.push({
      id: `fac:${k}`, scope: "facility", name: f.name, context: f.lga,
      issued: f.issued, distributed: f.distributed, returned: f.returned, unaccounted,
      foilPct, expected: fMean, zScore: z, signatureRate: sig, risk,
      verdict: risk >= 60 ? "investigate" : risk >= 35 ? "review" : "clear",
      reasons,
    });
  }

  /* actor ledger: volume vs peers of the same cadre + foil % of their communities */
  const byCommunity = new Map<string, CommunityDiagnosis>();
  for (const d of diag) for (const c of d.cdds) {
    const k = `${norm(c)}||${d.key}`;
    byCommunity.set(k, d);
  }
  const byRole = new Map<string, number[]>();
  for (const a of net.actors) {
    const r = a.roles[0] ?? "cdd";
    (byRole.get(r) ?? byRole.set(r, []).get(r)!).push(a.quantity);
  }
  for (const a of net.actors) {
    if (a.quantity <= 0) continue;
    const r = a.roles[0] ?? "cdd";
    const peers = byRole.get(r) ?? [];
    if (peers.length < 3) continue;
    const m = mean(peers), s = sd(peers);
    const z = zOf(a.quantity, m, s);
    const mine = diag.filter((d) => d.cdds.some((c) => norm(c) === a.id));
    const issued = mine.reduce((t, d) => t + d.received, 0);
    const returned = mine.reduce((t, d) => t + d.returned, 0);
    // distributed proxy: coverage-weighted issue against the community
    const distributed = mine.reduce((t, d) => t + d.received * Math.min(1, d.coverage || 0), 0);
    const unaccounted = Math.max(0, issued - distributed - returned);
    const foilPct = issued > 0 ? unaccounted / issued : 0;
    const reasons: string[] = [];
    if (Math.abs(z) >= 2) reasons.push(`Handles ${z.toFixed(1)}σ ${z > 0 ? "more" : "less"} stock than other ${ROLE_SHORT[r as keyof typeof ROLE_SHORT] ?? r}s`);
    if (foilPct > 0.2) reasons.push(`${(foilPct * 100).toFixed(0)}% of the stock they received is unreconciled`);
    if (a.signatureRate < 0.5 && a.transactions >= 3) reasons.push(`POD captured on only ${(a.signatureRate * 100).toFixed(0)}% of ${a.transactions} transactions`);
    if (a.nightShare > 0.4 && a.transactions >= 3) reasons.push(`${(a.nightShare * 100).toFixed(0)}% of their handovers happen outside 07:00–18:00`);
    if (!reasons.length) continue;
    const risk = Math.min(100, Math.round(foilPct * 55 + Math.min(2.5, Math.abs(z)) * 10 + (1 - a.signatureRate) * 20 + a.nightShare * 10));
    out.push({
      id: `act:${a.id}`, scope: "actor", name: a.name,
      context: `${a.roles.map((x) => ROLE_SHORT[x]).join("/")}${a.lgas[0] ? ` · ${a.lgas[0]}` : ""}`,
      issued, distributed, returned, unaccounted, foilPct,
      expected: m, zScore: z, signatureRate: a.signatureRate, risk,
      verdict: risk >= 60 ? "investigate" : risk >= 35 ? "review" : "clear",
      reasons,
    });
  }

  return out.sort((a, b) => b.risk - a.risk).slice(0, 40);
}

/* ─────────────────────────────────────── 4. Will we fail? (Bayesian risk) ── */

export interface BayesCell {
  delay: boolean;
  noSupervision: boolean;
  /** P(Fail | evidence). */
  posterior: number;
  /** P(evidence | Fail). */
  likelihood: number;
  /** P(evidence). */
  evidence: number;
  observed: number;
  observedFail: number;
}

export interface FailureRisk {
  n: number;
  prior: number;              // P(Fail)
  coverageFloor: number;
  lateStartDays: number;
  cells: BayesCell[];
  /** The headline cell: Delay = true, NoSupervision = true. */
  headline: BayesCell;
  formula: string;
  translation: string;
  /** Communities currently exhibiting delay + no supervision. */
  exposed: { community: string; ward: string; lga: string; lagDays: number; coverage: number; posterior: number }[];
}

/**
 * Naive Bayes with Laplace (add-one) smoothing:
 *   P(Fail | D,S) = P(D|Fail)·P(S|Fail)·P(Fail) / Σ_c P(D|c)·P(S|c)·P(c)
 */
export function willWeFail(
  diag: CommunityDiagnosis[],
  opts: { coverageFloor?: number; lateStartDays?: number } = {},
): FailureRisk | null {
  const coverageFloor = opts.coverageFloor ?? 0.6;
  const lateStartDays = opts.lateStartDays ?? 3;
  const rows = diag.filter((d) => d.facilityIssued > 0 || d.received > 0 || d.targetPop > 0);
  if (rows.length < 8) return null;

  const isFail = (d: CommunityDiagnosis) => d.coverage < coverageFloor;
  const isDelay = (d: CommunityDiagnosis) => d.lagDays >= lateStartDays;
  const noSup = (d: CommunityDiagnosis) => d.causes.some((c) => /supervis/i.test(c.label) || /supervis/i.test(c.cause));

  const fail = rows.filter(isFail);
  const ok = rows.filter((d) => !isFail(d));
  const prior = fail.length / rows.length;

  const cond = (set: CommunityDiagnosis[], f: (d: CommunityDiagnosis) => boolean) =>
    (set.filter(f).length + 1) / (set.length + 2);        // Laplace smoothing

  const pDgF = cond(fail, isDelay), pDgO = cond(ok, isDelay);
  const pSgF = cond(fail, noSup), pSgO = cond(ok, noSup);

  const cellFor = (delay: boolean, nosup: boolean): BayesCell => {
    const lF = (delay ? pDgF : 1 - pDgF) * (nosup ? pSgF : 1 - pSgF);
    const lO = (delay ? pDgO : 1 - pDgO) * (nosup ? pSgO : 1 - pSgO);
    const num = lF * prior;
    const ev = num + lO * (1 - prior);
    const obs = rows.filter((d) => isDelay(d) === delay && noSup(d) === nosup);
    return {
      delay, noSupervision: nosup,
      posterior: ev > 0 ? num / ev : prior,
      likelihood: lF,
      evidence: ev,
      observed: obs.length,
      observedFail: obs.filter(isFail).length,
    };
  };

  const cells = [
    cellFor(true, true), cellFor(true, false), cellFor(false, true), cellFor(false, false),
  ];
  const headline = cells[0];

  const exposed = rows
    .filter((d) => isDelay(d) && noSup(d))
    .sort((a, b) => b.lagDays - a.lagDays)
    .slice(0, 25)
    .map((d) => ({
      community: d.community, ward: d.ward, lga: d.lga,
      lagDays: d.lagDays < 900 ? d.lagDays : 0, coverage: d.coverage,
      posterior: headline.posterior,
    }));

  const meanLag = mean(rows.filter((d) => isDelay(d) && d.lagDays < 900).map((d) => d.lagDays)) || lateStartDays;

  return {
    n: rows.length,
    prior,
    coverageFloor,
    lateStartDays,
    cells,
    headline,
    formula: "P(Fail | Delay, NoSupervision) = P(Delay | Fail) · P(NoSupervision | Fail) · P(Fail) / P(Delay, NoSupervision)",
    translation:
      `Given we see ${Math.round(meanLag)} days delay + 0 supervision, there is ` +
      `${(headline.posterior * 100).toFixed(0)}% probability coverage < ${(coverageFloor * 100).toFixed(0)}%.`,
    exposed,
  };
}

/* ─────────────────────────────────────────────────────────── orchestration ── */

export interface DecisionIntelligenceResult {
  delayBrokers: DelayBroker[];
  regression: CoverageRegression | null;
  diversion: DiversionSignal[];
  risk: FailureRisk | null;
}

export function computeDecisionIntelligence(
  ds: LogisticsDataset,
  net: NetworkStats,
  diag: CommunityDiagnosis[],
  _sites: ChecklistSite[],
  opts: { coverageFloor?: number; lateStartDays?: number } = {},
): DecisionIntelligenceResult {
  return {
    delayBrokers: whoDelaysUs(net, diag, opts.lateStartDays ?? 3),
    regression: whyCoverageLow(diag),
    diversion: isThisDiversion(ds, net, diag),
    risk: willWeFail(diag, opts),
  };
}

export default computeDecisionIntelligence;
