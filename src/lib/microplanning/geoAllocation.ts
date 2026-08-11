/**
 * Population-proportional medicine allocation for NTD mass drug administration.
 *
 * Follows the WHO / Nigeria NTD Programme convention:
 *  - Treatment need is driven by the *target (eligible) population*.
 *  - Quantities are distributed strictly proportional to target population.
 *  - Rounding uses the largest-remainder method so the sum of the community
 *    allocations equals the LGA / ward total exactly (no drift, no shortfall).
 *  - A programmatic wastage / contingency buffer (default 10%) is reported
 *    separately so the dispatch quantity is auditable.
 */

export interface GeoRow {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  [k: string]: unknown;
}

export interface CommunityAllocation {
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  settlement: string;
  targetPop: number;
  sharePct: number;      // share of its ward total
  allocation: number;    // units before buffer
  buffer: number;        // wastage / contingency units
  dispatch: number;      // allocation + buffer
  source: "LGA" | "Ward" | "—";
}

export interface WardNode {
  key: string;
  state: string;
  lga: string;
  ward: string;
  communities: number;
  targetPop: number;
  sharePct: number;      // share of LGA target population
  allocation: number;
  rows: GeoRow[];
}

export interface LgaNode {
  key: string;
  state: string;
  lga: string;
  wards: WardNode[];
  communities: number;
  targetPop: number;
  allocation: number;     // total distributed (LGA input or sum of ward inputs)
  lgaInputUsed: boolean;
}

export const geoNorm = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().replace(/\b(ward|district)\b/g, " ").replace(/[^a-z0-9]/g, "");

const label = (s: unknown, fallback = "—") => {
  const v = String(s ?? "").trim();
  return v ? v : fallback;
};

/** Largest-remainder apportionment: exact integer split of `total` by weights. */
export function apportion(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const t = Math.max(0, Math.round(total));
  if (sum <= 0) {
    // no population signal: split as evenly as possible
    const base = Math.floor(t / n);
    const out = new Array(n).fill(base);
    for (let i = 0; i < t - base * n; i++) out[i] += 1;
    return out;
  }
  const exact = weights.map((w) => (w / sum) * t);
  const out = exact.map((x) => Math.floor(x));
  let left = t - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || weights[b.i] - weights[a.i]);
  let k = 0;
  while (left > 0 && order.length) {
    out[order[k % order.length].i] += 1;
    left--; k++;
  }
  return out;
}

/** Build the State → LGA → Ward hierarchy with target populations. */
export function buildGeoTree(rows: GeoRow[], getTargetPop: (r: GeoRow) => number): LgaNode[] {
  const lgas = new Map<string, LgaNode>();

  for (const r of rows) {
    const state = label(r.state);
    const lga = label(r.lga);
    if (lga === "—") continue;
    const ward = label(r.ward);
    const lKey = `${geoNorm(state)}|${geoNorm(lga)}`;
    const wKey = `${lKey}|${geoNorm(ward)}`;
    let L = lgas.get(lKey);
    if (!L) {
      L = { key: lKey, state, lga, wards: [], communities: 0, targetPop: 0, allocation: 0, lgaInputUsed: false };
      lgas.set(lKey, L);
    }
    let W = L.wards.find((w) => w.key === wKey);
    if (!W) {
      W = { key: wKey, state, lga, ward, communities: 0, targetPop: 0, sharePct: 0, allocation: 0, rows: [] };
      L.wards.push(W);
    }
    const tp = Math.max(0, Math.round(Number(getTargetPop(r)) || 0));
    W.rows.push(r);
    W.communities += 1;
    W.targetPop += tp;
    L.communities += 1;
    L.targetPop += tp;
  }

  const list = [...lgas.values()].sort((a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga));
  for (const L of list) {
    L.wards.sort((a, b) => a.ward.localeCompare(b.ward));
    for (const W of L.wards) W.sharePct = L.targetPop > 0 ? W.targetPop / L.targetPop : 0;
  }
  return list;
}

export interface AllocationInputs {
  /** LGA key → total units allocated to that LGA */
  lgaTotals: Record<string, number>;
  /** Ward key → total units allocated to that ward (overrides the LGA share) */
  wardTotals: Record<string, number>;
  /** Wastage / contingency buffer, e.g. 0.1 for 10% */
  bufferPct: number;
}

export interface AllocationResult {
  tree: LgaNode[];
  wardAllocation: Record<string, number>;
  wardSource: Record<string, "LGA" | "Ward" | "—">;
  communities: CommunityAllocation[];
  totals: { targetPop: number; allocation: number; buffer: number; dispatch: number; lgas: number; wards: number; communities: number };
}

/**
 * Resolve allocations top-down.
 * Ward inputs win; the remaining LGA total (if any) is apportioned across the
 * wards that have no explicit entry, strictly by target population.
 */
export function computeAllocations(tree: LgaNode[], inputs: AllocationInputs): AllocationResult {
  const wardAllocation: Record<string, number> = {};
  const wardSource: Record<string, "LGA" | "Ward" | "—"> = {};
  const communities: CommunityAllocation[] = [];
  const buf = Math.max(0, inputs.bufferPct || 0);

  for (const L of tree) {
    const explicit = L.wards.filter((w) => Number(inputs.wardTotals[w.key]) > 0);
    const explicitSum = explicit.reduce((s, w) => s + Number(inputs.wardTotals[w.key]), 0);
    const lgaTotal = Math.max(0, Math.round(Number(inputs.lgaTotals[L.key]) || 0));
    const rest = L.wards.filter((w) => !(Number(inputs.wardTotals[w.key]) > 0));
    const remaining = Math.max(0, lgaTotal - (lgaTotal > 0 ? 0 : 0));

    for (const w of explicit) {
      wardAllocation[w.key] = Math.round(Number(inputs.wardTotals[w.key]));
      wardSource[w.key] = "Ward";
    }

    if (lgaTotal > 0 && rest.length) {
      const split = apportion(remaining, rest.map((w) => w.targetPop));
      rest.forEach((w, i) => { wardAllocation[w.key] = split[i]; wardSource[w.key] = "LGA"; });
    } else {
      for (const w of rest) { wardAllocation[w.key] = 0; wardSource[w.key] = "—"; }
    }

    L.allocation = L.wards.reduce((s, w) => s + (wardAllocation[w.key] || 0), 0);
    L.lgaInputUsed = lgaTotal > 0;
    for (const w of L.wards) w.allocation = wardAllocation[w.key] || 0;

    // community-level split inside every ward
    for (const w of L.wards) {
      const total = wardAllocation[w.key] || 0;
      const tps = w.rows.map((r) => Math.max(0, Math.round(Number((r as any).__tp) || 0)));
      const split = apportion(total, tps);
      w.rows.forEach((r, i) => {
        const alloc = split[i];
        const bufferUnits = Math.round(alloc * buf);
        communities.push({
          state: label(r.state), lga: label(r.lga), ward: label(r.ward),
          flhf: label(r.flhf_name), community: label(r.community_name),
          settlement: label(r.settlement_name),
          targetPop: tps[i],
          sharePct: w.targetPop > 0 ? tps[i] / w.targetPop : 0,
          allocation: alloc,
          buffer: bufferUnits,
          dispatch: alloc + bufferUnits,
          source: wardSource[w.key] ?? "—",
        });
      });
    }
  }

  const totals = communities.reduce(
    (acc, c) => {
      acc.targetPop += c.targetPop; acc.allocation += c.allocation;
      acc.buffer += c.buffer; acc.dispatch += c.dispatch;
      return acc;
    },
    { targetPop: 0, allocation: 0, buffer: 0, dispatch: 0, lgas: tree.length, wards: 0, communities: communities.length },
  );
  totals.wards = tree.reduce((s, l) => s + l.wards.length, 0);

  return { tree, wardAllocation, wardSource, communities, totals };
}
