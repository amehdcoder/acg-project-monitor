/**
 * UNIQUE SIGNAL DETECTION (unsupervised machine learning).
 *
 * Purpose: surface information from a field day that has NEVER been reported by
 * any other community in the same LGA or State — the observations no summary
 * table would ever show, because they are rare by construction.
 *
 * Two independent learners vote on every community-day:
 *
 *  1. ISOLATION FOREST over the binary supervisory feature vector. Anomalous
 *     rows get isolated near the root of random split trees, so a short mean
 *     path length ⇒ high anomaly score. This is a genuine unsupervised model
 *     (100 trees, sub-sampled, random feature / random split point) trained on
 *     the campaign's own submissions — no labels, no server, no AI dependency.
 *
 *  2. RARITY / NOVELTY SCORING. For each observed finding we measure how often
 *     it occurs in the peer group (same LGA that day, same State that day, and
 *     the whole campaign to date). A finding seen once inside its peer group,
 *     and never before that day, is "first-ever" evidence.
 *
 * The two scores combine into a 0-100 uniqueness index. Only signals above the
 * caller's floor are returned, ranked by how undeniably unique they are.
 */
import { PREDICTORS, mdaClass, type Row } from "./evidencePatterns";

export interface UniqueSignal {
  id: string;
  day: string;
  community: string;
  ward: string;
  lga: string;
  state: string;
  monitor: string;
  /** Human-readable findings that make this record unusual. */
  findings: string[];
  /** Narrative interpretation for a supervisor. */
  interpretation: string;
  /** 0-100 combined uniqueness index. */
  uniqueness: number;
  /** Isolation-forest anomaly score (0-1, higher = more isolated). */
  isolation: number;
  /** Peer-group rarity (0-1, higher = rarer). */
  rarity: number;
  /** Widest scope in which this combination has never been reported before. */
  scope: "State" | "LGA" | "Ward";
  /** True when no earlier field day carried this combination anywhere. */
  firstEver: boolean;
  peers: number;
  rows: Row[];
}

export interface UniqueSignalResult {
  signals: UniqueSignal[];
  scanned: number;
  features: number;
  trees: number;
  /** Findings that are common everywhere — explicitly ignored as decoys. */
  suppressed: string[];
}

const s = (v: unknown) => String(v ?? "").trim();

/* ------------------------------------------------------- isolation forest */

interface INode {
  f?: number;
  t?: number;
  l?: INode;
  r?: INode;
  size?: number;
  depth?: number;
}

const cFactor = (n: number) =>
  n <= 1 ? 0 : 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;

function buildTree(X: number[][], idx: number[], depth: number, maxDepth: number, rnd: () => number): INode {
  if (depth >= maxDepth || idx.length <= 1) return { size: idx.length, depth };
  const f = Math.floor(rnd() * X[0].length);
  let min = Infinity, max = -Infinity;
  for (const i of idx) {
    const v = X[i][f];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return { size: idx.length, depth };
  const t = min + rnd() * (max - min);
  const l: number[] = [], r: number[] = [];
  for (const i of idx) (X[i][f] < t ? l : r).push(i);
  if (!l.length || !r.length) return { size: idx.length, depth };
  return {
    f, t,
    l: buildTree(X, l, depth + 1, maxDepth, rnd),
    r: buildTree(X, r, depth + 1, maxDepth, rnd),
  };
}

function pathLength(node: INode, x: number[], depth = 0): number {
  if (node.f == null) return depth + cFactor(node.size ?? 1);
  return pathLength(x[node.f] < (node.t as number) ? (node.l as INode) : (node.r as INode), x, depth + 1);
}

/** Deterministic PRNG so the same data always yields the same model. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isolationScores(X: number[][], trees = 100): number[] {
  const n = X.length;
  if (n < 4) return X.map(() => 0);
  const rnd = mulberry32(0x5eed ^ n);
  const sample = Math.min(256, n);
  const maxDepth = Math.ceil(Math.log2(Math.max(2, sample)));
  const forest: INode[] = [];
  for (let t = 0; t < trees; t++) {
    const idx: number[] = [];
    for (let k = 0; k < sample; k++) idx.push(Math.floor(rnd() * n));
    forest.push(buildTree(X, idx, 0, maxDepth, rnd));
  }
  const c = cFactor(sample) || 1;
  return X.map((x) => {
    let sum = 0;
    for (const tr of forest) sum += pathLength(tr, x);
    return 2 ** (-(sum / forest.length) / c);
  });
}

/* ------------------------------------------------------------ the engine */

export function detectUniqueSignals(
  parents: Row[],
  opts: { minUniqueness?: number; maxSignals?: number } = {},
): UniqueSignalResult {
  const minUniqueness = opts.minUniqueness ?? 55;
  const maxSignals = opts.maxSignals ?? 60;

  const rows = parents.filter(Boolean);
  if (rows.length < 3) {
    return { signals: [], scanned: rows.length, features: PREDICTORS.length, trees: 0, suppressed: [] };
  }

  /* feature matrix: one binary column per supervisory predictor + MDA status */
  const featureLabels = [...PREDICTORS.map((p) => p.label), "MDA not completed"];
  const X: number[][] = [];
  const flagsPerRow: string[][] = [];

  for (const p of rows) {
    const vec: number[] = [];
    const flags: string[] = [];
    for (const d of PREDICTORS) {
      const v = d.read(p);
      const bit = v == null ? 0 : v;
      vec.push(bit);
      if (bit === 1) flags.push(d.label);
    }
    const cls = mdaClass(p);
    const notDone = cls && cls !== "completed" ? 1 : 0;
    vec.push(notDone);
    if (notDone) flags.push("MDA not completed");
    X.push(vec);
    flagsPerRow.push(flags);
  }

  const iso = isolationScores(X);

  /* how common is every finding, per scope? */
  const dayOf = (p: Row) => s(p._submission_time).slice(0, 10) || "undated";
  const total = rows.length;
  const globalCount = new Map<string, number>();
  const lgaDayCount = new Map<string, number>();
  const stateDayCount = new Map<string, number>();
  const firstDaySeen = new Map<string, string>();

  rows.forEach((p, i) => {
    const day = dayOf(p);
    const lga = s(p.LGA) || "—";
    const state = s(p.State) || "—";
    for (const f of flagsPerRow[i]) {
      globalCount.set(f, (globalCount.get(f) ?? 0) + 1);
      lgaDayCount.set(`${lga}|${day}|${f}`, (lgaDayCount.get(`${lga}|${day}|${f}`) ?? 0) + 1);
      stateDayCount.set(`${state}|${day}|${f}`, (stateDayCount.get(`${state}|${day}|${f}`) ?? 0) + 1);
      const prev = firstDaySeen.get(f);
      if (!prev || day < prev) firstDaySeen.set(f, day);
    }
  });

  /* findings so common they are decoys, not signals */
  const suppressed = featureLabels.filter((f) => (globalCount.get(f) ?? 0) / total > 0.4);
  const suppressedSet = new Set(suppressed);

  const out: UniqueSignal[] = [];
  const dedupe = new Map<string, UniqueSignal>();

  rows.forEach((p, i) => {
    const flags = flagsPerRow[i].filter((f) => !suppressedSet.has(f));
    if (!flags.length) return;

    const day = dayOf(p);
    const lga = s(p.LGA) || "—";
    const state = s(p.State) || "—";
    const community = s(p.COMMUNITIES) || "Unnamed community";

    // rarity = how alone this record is with these findings inside its peers
    let rarity = 0;
    let scope: UniqueSignal["scope"] = "Ward";
    let peers = total;
    const notable: string[] = [];

    for (const f of flags) {
      const inLgaDay = lgaDayCount.get(`${lga}|${day}|${f}`) ?? 1;
      const inStateDay = stateDayCount.get(`${state}|${day}|${f}`) ?? 1;
      const globally = globalCount.get(f) ?? 1;
      const r = Math.max(
        inStateDay === 1 ? 1 : 0,
        inLgaDay === 1 ? 0.8 : 0,
        1 - globally / total,
      );
      if (r >= 0.6) notable.push(f);
      if (r > rarity) {
        rarity = r;
        scope = inStateDay === 1 ? "State" : inLgaDay === 1 ? "LGA" : "Ward";
        peers = inStateDay === 1 ? inStateDay : inLgaDay;
      }
    }
    if (!notable.length) return;

    const firstEver = notable.every((f) => (firstDaySeen.get(f) ?? day) === day);
    const uniqueness = Math.round(
      Math.min(100, 100 * (0.6 * rarity + 0.4 * iso[i]) + (firstEver ? 8 : 0)),
    );
    if (uniqueness < minUniqueness) return;

    const key = `${community}|${day}|${notable.slice().sort().join("~")}`;
    const existing = dedupe.get(key);
    if (existing) {
      existing.rows.push(p);
      return;
    }

    const sig: UniqueSignal = {
      id: `${s(p._id) || i}`,
      day,
      community,
      ward: s(p.Ward) || "—",
      lga,
      state,
      monitor:
        s(p.Independent_Monitor_s_Name) || s(p.Name_of_Supervisor) || s(p.Designation) || "Unspecified",
      findings: notable,
      interpretation:
        `On ${day}, ${community} (${s(p.Ward) || "—"}, ${lga}) reported ` +
        `${notable.length === 1 ? "a condition" : `${notable.length} conditions`} — ` +
        `${notable.slice(0, 3).join("; ")}${notable.length > 3 ? "…" : ""} — ` +
        (scope === "State"
          ? `not reported by any other community in ${state} that day.`
          : scope === "LGA"
            ? `not reported anywhere else in ${lga} that day.`
            : `rare across the campaign to date.`) +
        (firstEver ? " This is the first appearance of this evidence in the campaign." : ""),
      uniqueness,
      isolation: Math.round(iso[i] * 1000) / 1000,
      rarity: Math.round(rarity * 1000) / 1000,
      scope,
      firstEver,
      peers,
      rows: [p],
    };
    dedupe.set(key, sig);
    out.push(sig);
  });

  out.sort((a, b) => b.uniqueness - a.uniqueness || (a.day < b.day ? 1 : -1));

  return {
    signals: out.slice(0, maxSignals),
    scanned: rows.length,
    features: featureLabels.length,
    trees: rows.length >= 4 ? 100 : 0,
    suppressed,
  };
}

export default detectUniqueSignals;
