// Household transmission & social kinship graph.
//
// Builds a network of people → households → shared community water and
// sanitation points, and lays it out with a small deterministic force
// simulation so the same register always draws the same picture. Everything
// runs locally; there is no layout service and no network call.

import type { BeneficiaryRow } from "./types";
import type { HouseholdRow, WashSourceRow } from "./households";

export type NodeKind = "beneficiary" | "household" | "wash";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  /** Number of confirmed/affected cases attached — drives node size. */
  weight: number;
  /** True when this node carries an active disease case. */
  affected?: boolean;
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "member" | "water";
}

export interface KinshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Households with more than one affected member — intra-household spread. */
  clusters: {
    householdId: string;
    label: string;
    affected: number;
    members: number;
    washLabel: string;
    unimprovedWater: boolean;
  }[];
}

const ACTIVE_STATUSES = new Set(["active", "on_hold"]);

/**
 * @param affectedFor  decides whether a beneficiary counts as an affected case
 *                     for cluster detection — defaults to an active record.
 */
export const buildKinshipGraph = (
  beneficiaries: BeneficiaryRow[],
  households: HouseholdRow[],
  washSources: WashSourceRow[],
  affectedFor: (b: BeneficiaryRow) => boolean = (b) => ACTIVE_STATUSES.has(b.status),
): KinshipGraph => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const householdById = new Map(households.map((h) => [h.id, h]));
  const washById = new Map(washSources.map((w) => [w.id, w]));

  const membersByHousehold = new Map<string, BeneficiaryRow[]>();
  for (const b of beneficiaries) {
    const hid = (b as unknown as { household_id?: string | null }).household_id || "";
    if (!hid || !householdById.has(hid)) continue;
    const list = membersByHousehold.get(hid) || [];
    list.push(b);
    membersByHousehold.set(hid, list);
  }

  const usedWash = new Set<string>();

  for (const h of households) {
    const members = membersByHousehold.get(h.id) || [];
    if (!members.length && !h.wash_source_id) continue;
    const affected = members.filter(affectedFor).length;
    nodes.push({
      id: `h:${h.id}`,
      kind: "household",
      label: h.name || h.household_code,
      sub: [h.village, h.ward].filter(Boolean).join(", ") || h.household_code,
      weight: Math.max(1, members.length),
      affected: affected > 1,
      x: 0, y: 0,
    });

    for (const m of members) {
      nodes.push({
        id: `b:${m.id}`,
        kind: "beneficiary",
        label: m.full_name,
        sub: m.case_id,
        weight: 1,
        affected: affectedFor(m),
        x: 0, y: 0,
      });
      edges.push({ source: `b:${m.id}`, target: `h:${h.id}`, kind: "member" });
    }

    if (h.wash_source_id && washById.has(h.wash_source_id)) {
      usedWash.add(h.wash_source_id);
      edges.push({ source: `h:${h.id}`, target: `w:${h.wash_source_id}`, kind: "water" });
    }
  }

  for (const id of usedWash) {
    const w = washById.get(id);
    if (!w) continue;
    nodes.push({
      id: `w:${id}`,
      kind: "wash",
      label: w.name,
      sub: w.is_improved ? "Improved source" : "Unimproved source",
      weight: 2,
      affected: !w.is_improved,
      x: 0, y: 0,
    });
  }

  const clusters = households
    .map((h) => {
      const members = membersByHousehold.get(h.id) || [];
      const affected = members.filter(affectedFor).length;
      const w = h.wash_source_id ? washById.get(h.wash_source_id) : undefined;
      return {
        householdId: h.id,
        label: h.name || h.household_code,
        affected,
        members: members.length,
        washLabel: w?.name || "No water point recorded",
        unimprovedWater: !!w && !w.is_improved,
      };
    })
    .filter((c) => c.affected > 1)
    .sort((a, b) => b.affected - a.affected);

  layout(nodes, edges);
  return { nodes, edges, clusters };
};

/**
 * Deterministic force-directed layout. Seeded pseudo-random start positions
 * plus repulsion/attraction iterations — fast enough for a few hundred nodes
 * on a mid-range Android phone.
 */
const layout = (nodes: GraphNode[], edges: GraphEdge[], width = 1000, height = 700) => {
  if (!nodes.length) return;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    const r = (0.25 + 0.7 * rand()) * Math.min(width, height) * 0.45;
    n.x = width / 2 + Math.cos(a) * r;
    n.y = height / 2 + Math.sin(a) * r;
  });

  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target)] as [number | undefined, number | undefined])
    .filter((p): p is [number, number] => p[0] != null && p[1] != null);

  const iterations = nodes.length > 220 ? 120 : 220;
  for (let it = 0; it < iterations; it += 1) {
    const cool = 1 - it / iterations;
    // Repulsion
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]; const b = nodes[j];
        let dx = a.x - b.x; let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rand() - 0.5; dy = rand() - 0.5; d2 = 1; }
        const f = (5200 / d2) * cool;
        const d = Math.sqrt(d2);
        a.x += (dx / d) * f; a.y += (dy / d) * f;
        b.x -= (dx / d) * f; b.y -= (dy / d) * f;
      }
    }
    // Attraction along edges
    for (const [i, j] of links) {
      const a = nodes[i]; const b = nodes[j];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = ((d - 95) * 0.045) * cool;
      a.x += (dx / d) * f; a.y += (dy / d) * f;
      b.x -= (dx / d) * f; b.y -= (dy / d) * f;
    }
    // Gentle pull to the centre
    for (const n of nodes) {
      n.x += (width / 2 - n.x) * 0.006 * cool;
      n.y += (height / 2 - n.y) * 0.006 * cool;
    }
  }

  // Normalise into the viewbox with a margin.
  const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const sx = (width - 120) / Math.max(1, maxX - minX);
  const sy = (height - 120) / Math.max(1, maxY - minY);
  const s = Math.min(sx, sy);
  for (const n of nodes) {
    n.x = 60 + (n.x - minX) * s;
    n.y = 60 + (n.y - minY) * s;
  }
};

export const NODE_STYLE: Record<NodeKind, { fill: string; label: string }> = {
  beneficiary: { fill: "var(--health-blue, 209 100% 36%)", label: "Person" },
  household: { fill: "var(--health-teal, 176 100% 31%)", label: "Household" },
  wash: { fill: "var(--health-amber, 45 87% 61%)", label: "Water point" },
};
