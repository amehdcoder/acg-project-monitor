import { getFlat, pickFirst, pickNumber, resolveCoordinates, type AnyRec } from './microplanRepeatItem.ts';
import { extractKoboMicroplanSchema } from './koboMicroplanSchema.ts';
import { normalizeMicroplanChoice } from './microplanChoices.ts';

// Legacy forms capture a community census; detailed forms capture settlements only.
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
  const detailed = settlements.some(item => item && typeof item === 'object' && getFlat(item as AnyRec, 'settlement_schema_version') === 'details_v1');
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
    extra_metadata: { ...raw, ame_microplan: { kind: 'community', community_key: key, ...(detailed ? { measure_scope: 'settlement_rollup' } : {}) } },
  };
  if (detailed) for (const field of COMMUNITY_MEASURES) (parent as AnyRec)[field] = null;
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
    if (detailed) {
      if (getFlat(item, 'settlement_schema_version') !== 'details_v1') throw new Error(`Settlement ${index + 1} requires the complete updated settlement form`);
      const scope: AnyRec = {};
      const flatten = (obj: AnyRec) => {
        for (const [key, value] of Object.entries(obj)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value as AnyRec);
          else scope[(key.split('/').at(-1) ?? key).replace(/^settlement_/, '')] = value;
        }
      };
      flatten(item);
      const fields: Record<string, string[]> = {
        estimated_children_0_4: ['Children_0_4_yrs'], estimated_children_5_14: ['Children_5_14_yrs'],
        estimated_adults_15_plus: ['Adults_15_yrs'], estimated_total_population: ['Total_Population'],
        number_of_households: ['Number_of_Households'], pwd_total: ['pwd_total'],
        pwd_visual: ['Visual_Seeing'], pwd_hearing: ['Hearing'], pwd_physical: ['Physical_Mobility'],
        pwd_intellectual: ['Intellectual_Cognitive'], pwd_communication: ['Communication_Speech'],
        pwd_selfcare: ['Self_care'], pwd_albinism: ['Albinism'],
      };
      for (const [col, aliases] of Object.entries(fields)) {
        const rawValue = getFlat(scope, aliases[0]);
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;
        const n = Number(rawValue);
        if (!Number.isSafeInteger(n) || n < 0 || n > 10000000) throw new Error(`Settlement ${index + 1}: ${aliases[0]} must be a non-negative whole number`);
        child[col] = n;
      }
      Object.assign(child, extractKoboMicroplanSchema(scope, {}, community.mda_type as 'standard' | 'trachoma' | null));
      for (const [col, key] of [['terrain_type','Type_of_Terrain'],['accessibility','Accessibility'],['security_clearance','Security_Clearance'],['population_source','Source_of_Population_Data']]) {
        const value = pickFirst(scope, [key]);
        if (!value) throw new Error(`Settlement ${index + 1}: ${key} is required`);
        child[col] = normalizeMicroplanChoice(col, value);
      }
      const trachoma = community.mda_type === 'trachoma';
      for (const col of ['estimated_total_population','number_of_households','pwd_total','pwd_visual','pwd_hearing','pwd_physical','pwd_intellectual','pwd_communication','pwd_selfcare','pwd_albinism', ...(trachoma ? ['trachoma_0_5_months','trachoma_6m_6y','trachoma_7_14y','trachoma_15_plus','trachoma_1_9_male','trachoma_1_9_female'] : ['estimated_children_0_4','estimated_children_5_14','estimated_adults_15_plus'])]) {
        if (typeof child[col] !== 'number') throw new Error(`Settlement ${index + 1}: ${col} is required`);
      }
      if (!trachoma && child.estimated_total_population !== Number(child.estimated_children_0_4) + Number(child.estimated_children_5_14) + Number(child.estimated_adults_15_plus)) throw new Error(`Settlement ${index + 1}: population must equal the standard age groups`);
      if (Number(child.pwd_total) > Number(child.estimated_total_population)) throw new Error(`Settlement ${index + 1}: disability total exceeds population`);
      for (const col of ['cdd_names','cdd_phone_numbers','cdd_account_name','cdd_account_number','cdd_bank']) if (!(col in scope) && !('cdd_repeat' in scope)) child[col] = null;
      if (!('cdd_repeat' in scope)) child.cdd_details = [];
      const from = pickFirst(scope, ['Is_CDD_s_from_Community_Settlement']);
      child.cdd_from_community = from ? ['yes','true','1'].includes(from.toLowerCase()) : null;
      child.notes = pickFirst(scope, ['Notes']);
      child.community_distance_to_flhf_km = child.settlement_distance_to_flhf_km;
      child.extra_metadata = { ...item, ame_microplan: { kind: 'settlement', community_key: key, settlement_index: index, measure_scope: 'settlement' } };
    }
    return child;
  });
  return [parent, ...children];
}