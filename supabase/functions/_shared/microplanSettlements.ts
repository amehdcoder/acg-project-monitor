import { getFlat, pickFirst, pickNumber, resolveCoordinates, type AnyRec } from './microplanRepeatItem.ts';

// The workbook captures population at community level, not per settlement.
const COMMUNITY_MEASURES = [
  'estimated_total_population', 'estimated_children_0_4', 'estimated_children_5_14',
  'estimated_adults_15_plus', 'number_of_households', 'trachoma_0_5_months',
  'trachoma_6m_6y', 'trachoma_7_14y', 'trachoma_15_plus', 'trachoma_1_9_male',
  'trachoma_1_9_female', 'pwd_total', 'pwd_visual', 'pwd_hearing', 'pwd_physical',
  'pwd_intellectual', 'pwd_communication', 'pwd_selfcare', 'pwd_albinism',
  'total_treated', 'households_treated', 'total_households_reported',
  'total_households_treated', 'medicine_used', 'coverage_target_population',
] as const;

/** Nested settlements are distinct locations, never copies of a community census. */
export function expandNestedSettlements(community: AnyRec, raw: AnyRec): AnyRec[] {
  const value = getFlat(raw, 'settlement_repeat');
  const declared = getFlat(raw, 'Has_Settlements');
  if (value === undefined && declared === undefined) return [community]; // legacy form
  if (value !== undefined && !Array.isArray(value)) throw new Error('settlement_repeat must be an array');
  const settlements = Array.isArray(value) ? value : [];
  const communityGps = resolveCoordinates(raw, {
    geopointKeys: ['community_gps'], latKeys: ['community_latitude'], lngKeys: ['community_longitude'],
  });
  if (!communityGps.geotagged) throw new Error('Every community requires its own valid GPS coordinates');
  if (declared === 'yes' && settlements.length === 0) throw new Error('Add at least one settlement when Has_Settlements is yes');
  if (declared === 'no' && settlements.length > 0) throw new Error('Settlements conflict with Has_Settlements = no');
  const key = String(community.idempotency_key);
  const parent = {
    ...community, settlement_name: null, settlement_latitude: null, settlement_longitude: null,
    settlement_distance_to_flhf_km: null,
    extra_metadata: { ...raw, ame_microplan: { kind: 'community', community_key: key } },
  };
  const children = settlements.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Settlement ${index + 1} is not an object`);
    const item = value as AnyRec;
    const name = pickFirst(item, ['Settlement_Name', 'settlement_name']);
    if (!name) throw new Error(`Settlement ${index + 1} requires a name`);
    const gps = resolveCoordinates(item, {
      geopointKeys: ['settlement_gps'], latKeys: ['settlement_latitude'], lngKeys: ['settlement_longitude'],
    });
    if (!gps.geotagged) throw new Error(`Settlement ${index + 1} requires its own valid GPS coordinates`);
    const child: AnyRec = {
      ...community, idempotency_key: `${key}_s${index}`, settlement_name: name,
      settlement_latitude: gps.lat, settlement_longitude: gps.lng,
      settlement_distance_to_flhf_km: pickNumber(item, ['flhf_settlement_dist_km', 'settlement_distance_to_flhf_km']),
      settlement_mai_unguwa: pickFirst(item, ['settlement_mai_unguwa']), geotagged: true,
      extra_metadata: { ...item, ame_microplan: { kind: 'settlement', community_key: key, settlement_index: index } },
    };
    for (const field of COMMUNITY_MEASURES) child[field] = null;
    return child;
  });
  return [parent, ...children];
}