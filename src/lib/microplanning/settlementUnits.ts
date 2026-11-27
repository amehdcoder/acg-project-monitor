/**
 * Planning units for the Communities KPI: every unique settlement, plus every
 * community that has no settlement recorded under it. A community with
 * settlements is represented by its settlements (never counted twice).
 */
export interface SettlementUnitRow {
  state?: string | null; lga?: string | null; ward?: string | null;
  flhf_name?: string | null; community_name?: string | null; settlement_name?: string | null;
}

const norm = (v?: string | null) => (v ?? "").toString().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function countSettlementUnits(rows: SettlementUnitRow[]) {
  const settlements = new Set<string>();
  const withSettlements = new Set<string>();
  const allCommunities = new Set<string>();
  for (const r of rows) {
    const community = norm(r.community_name);
    const settlement = norm(r.settlement_name);
    if (!community && !settlement) continue;
    const ck = [r.state, r.lga, r.ward, r.flhf_name].map(norm).join("|") + "|" + community;
    allCommunities.add(ck);
    if (settlement && settlement !== community) {
      settlements.add(ck + "|" + settlement);
      withSettlements.add(ck);
    }
  }
  let communitiesWithoutSettlements = 0;
  allCommunities.forEach(k => { if (!withSettlements.has(k)) communitiesWithoutSettlements++; });
  return {
    uniqueSettlements: settlements.size,
    communitiesWithoutSettlements,
    communities: allCommunities.size,
    total: settlements.size + communitiesWithoutSettlements,
  };
}
