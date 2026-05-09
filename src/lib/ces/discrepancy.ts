// Two-proportion z-test helpers for surfacing coverage discrepancies between
// CES (Coverage Evaluation Survey – 3D Village Mapping) and Geo Microplanning.

export interface ProportionPoint {
  numerator: number;
  denominator: number;
}

export interface ZTestResult {
  p1: number; // 0..1
  p2: number;
  diffPct: number; // (p1 - p2) * 100
  z: number;
  pValue: number; // two-sided
  significant: boolean; // p < 0.05
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

export function twoProportionZTest(a: ProportionPoint, b: ProportionPoint): ZTestResult | null {
  if (a.denominator <= 0 || b.denominator <= 0) return null;
  const p1 = a.numerator / a.denominator;
  const p2 = b.numerator / b.denominator;
  const pPool = (a.numerator + b.numerator) / (a.denominator + b.denominator);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.denominator + 1 / b.denominator));
  const z = se > 0 ? (p1 - p2) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    p1, p2,
    diffPct: (p1 - p2) * 100,
    z,
    pValue,
    significant: pValue < 0.05,
  };
}

// ─── Aggregation types ───────────────────────────────────────────────────────

export type GeoLevel = "settlement" | "community" | "flhf" | "ward" | "lga" | "state";

export interface CESVisitRow {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  eligible_persons?: number | null;
  treated_persons?: number | null;
}

export interface CESSegmentRow {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  total_hh_in_segment?: number | null;
  hh_treated_in_segment?: number | null;
}

export interface MicroplanRow {
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name?: string | null;
  estimated_total_population?: number | null;
  estimated_children_5_14?: number | null;
  estimated_adults_15_plus?: number | null;
  total_treated?: number | null;
  number_of_households?: number | null;
  households_treated?: number | null;
}

export interface CoverageRollup {
  key: string;
  state?: string;
  lga?: string;
  ward?: string;
  flhf_name?: string;
  community_name?: string;
  settlement_name?: string;
  // Therapeutic (persons)
  eligible_persons: number;
  treated_persons: number;
  therapeutic_pct: number; // 0..100
  // Geographic (households)
  total_hh: number;
  hh_treated: number;
  geographic_pct: number; // 0..100
}

const FIELDS_BY_LEVEL: Record<GeoLevel, (keyof CESVisitRow)[]> = {
  state: ["state"],
  lga: ["state", "lga"],
  ward: ["state", "lga", "ward"],
  flhf: ["state", "lga", "ward", "flhf_name"],
  community: ["state", "lga", "ward", "flhf_name", "community_name"],
  settlement: ["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"],
};

function keyFor(row: any, level: GeoLevel): string {
  return FIELDS_BY_LEVEL[level].map((f) => String(row[f] ?? "")).join("|");
}

export function rollupCoverage(
  visits: CESVisitRow[],
  segments: CESSegmentRow[],
  level: GeoLevel,
): CoverageRollup[] {
  const map = new Map<string, CoverageRollup>();
  const ensure = (row: any): CoverageRollup => {
    const key = keyFor(row, level);
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        state: row.state ?? undefined,
        lga: row.lga ?? undefined,
        ward: row.ward ?? undefined,
        flhf_name: row.flhf_name ?? undefined,
        community_name: row.community_name ?? undefined,
        settlement_name: row.settlement_name ?? undefined,
        eligible_persons: 0, treated_persons: 0, therapeutic_pct: 0,
        total_hh: 0, hh_treated: 0, geographic_pct: 0,
      };
      map.set(key, r);
    }
    return r;
  };
  for (const v of visits) {
    if (v.eligible_persons == null) continue;
    const r = ensure(v);
    r.eligible_persons += v.eligible_persons || 0;
    r.treated_persons += v.treated_persons || 0;
  }
  for (const s of segments) {
    if (s.total_hh_in_segment == null) continue;
    const r = ensure(s);
    r.total_hh += s.total_hh_in_segment || 0;
    r.hh_treated += s.hh_treated_in_segment || 0;
  }
  for (const r of map.values()) {
    r.therapeutic_pct = r.eligible_persons > 0 ? (r.treated_persons / r.eligible_persons) * 100 : 0;
    r.geographic_pct = r.total_hh > 0 ? (r.hh_treated / r.total_hh) * 100 : 0;
  }
  return Array.from(map.values());
}

export function targetPopulationOf(m: MicroplanRow): number {
  return ((m.estimated_children_5_14 || 0) + (m.estimated_adults_15_plus || 0))
    || (m.estimated_total_population || 0);
}

// ─── Operations dashboard rule ──────────────────────────────────────────────
// Flag communities/settlements where:
//   z-test(p_treated_vs_target, p_ces_therapeutic) is significant (p<0.05)
//   AND geographic coverage (CES) < 100%

export interface OpsDiscrepancy {
  level: GeoLevel;
  rollup: CoverageRollup;
  microplan: MicroplanRow;
  targetPopCoveragePct: number;
  cesTherapeuticPct: number;
  geographicPct: number;
  z: number;
  pValue: number;
}

export function findOpsDiscrepancies(
  visits: CESVisitRow[],
  segments: CESSegmentRow[],
  microplan: MicroplanRow[],
  level: GeoLevel = "community",
): OpsDiscrepancy[] {
  const rollups = rollupCoverage(visits, segments, level);
  const out: OpsDiscrepancy[] = [];
  for (const r of rollups) {
    const match = microplan.find(
      (m) =>
        (level === "community" ? m.community_name === r.community_name : true) &&
        (level === "settlement" ? m.settlement_name === r.settlement_name : true) &&
        m.ward === r.ward && m.lga === r.lga && m.state === r.state,
    );
    if (!match) continue;
    const target = targetPopulationOf(match);
    const treated = match.total_treated || 0;
    if (target <= 0 || r.eligible_persons <= 0) continue;
    const z = twoProportionZTest(
      { numerator: treated, denominator: target },
      { numerator: r.treated_persons, denominator: r.eligible_persons },
    );
    if (!z || !z.significant) continue;
    if (r.geographic_pct >= 100) continue;
    out.push({
      level, rollup: r, microplan: match,
      targetPopCoveragePct: (treated / target) * 100,
      cesTherapeuticPct: r.therapeutic_pct,
      geographicPct: r.geographic_pct,
      z: z.z, pValue: z.pValue,
    });
  }
  return out;
}

// ─── Microplanning Coverage tab rule ────────────────────────────────────────
// Flag communities/settlements where Microplanning geographic coverage
// (households_treated / number_of_households) differs significantly from
// the CES geographic coverage (hh_treated_in_segment / total_hh_in_segment).

export interface GeoDiscrepancy {
  level: GeoLevel;
  community_name?: string;
  settlement_name?: string;
  ward?: string;
  lga?: string;
  state?: string;
  microplanGeoPct: number;
  cesGeoPct: number;
  z: number;
  pValue: number;
}

export function findMicroplanVsCESGeoDiscrepancies(
  microplan: MicroplanRow[],
  cesSegments: CESSegmentRow[],
  level: GeoLevel = "community",
): GeoDiscrepancy[] {
  const cesRoll = rollupCoverage([], cesSegments, level);
  const out: GeoDiscrepancy[] = [];
  for (const m of microplan) {
    if (!m.number_of_households || m.households_treated == null) continue;
    const r = cesRoll.find(
      (x) =>
        x.state === m.state && x.lga === m.lga && x.ward === m.ward &&
        (level === "community" ? x.community_name === m.community_name : true) &&
        (level === "settlement" ? x.settlement_name === m.settlement_name : true),
    );
    if (!r || r.total_hh <= 0) continue;
    const z = twoProportionZTest(
      { numerator: m.households_treated, denominator: m.number_of_households },
      { numerator: r.hh_treated, denominator: r.total_hh },
    );
    if (!z || !z.significant) continue;
    out.push({
      level,
      community_name: m.community_name,
      settlement_name: m.settlement_name ?? undefined,
      ward: m.ward, lga: m.lga, state: m.state,
      microplanGeoPct: (m.households_treated / m.number_of_households) * 100,
      cesGeoPct: r.geographic_pct,
      z: z.z, pValue: z.pValue,
    });
  }
  return out;
}
