const textFields = ['state','lga','ward','flhf_name','flhf_incharge_name','flhf_incharge_phone','community_name','community_leader_name','community_leader_phone','settlement_name','settlement_mai_unguwa','terrain_type','accessibility','security_clearance','cdd_names','cdd_phone_numbers','campaign_type','notes','population_source'];
const countFields = ['estimated_total_population','estimated_children_5_14','estimated_adults_15_plus','estimated_children_0_4','number_of_households','trachoma_0_5_months','trachoma_6m_6y','trachoma_7_14y','trachoma_15_plus','pwd_total','pwd_visual','pwd_hearing','pwd_physical','pwd_intellectual','pwd_communication','pwd_selfcare','pwd_albinism'];
export function validatedMicroplan(id: unknown, input: unknown, scope: {scope_states?: string[];scope_lgas?: string[];scope_wards?: string[]}) {
 if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('invalid_record_id');
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_entry');
 const data = input as Record<string,unknown>; const row: Record<string,unknown> = {};
 for (const key of textFields) { if (data[key] != null && typeof data[key] !== 'string') throw new Error('invalid_text'); row[key] = String(data[key] || '').trim().slice(0,key === 'notes' ? 4000 : 500); }
 for (const key of ['state','lga','ward','flhf_name','community_name']) if (!row[key]) throw new Error('required_fields_missing');
 const state = String(row.state), lga = String(row.lga), ward = String(row.ward);
 if ((scope.scope_states?.length && !scope.scope_states.includes(state)) || (scope.scope_lgas?.length && !scope.scope_lgas.includes(`${state}|${lga}`)) || (scope.scope_wards?.length && !scope.scope_wards.includes(`${state}|${lga}|${ward}`))) throw new Error('geography_outside_project');
 for (const key of countFields) { const value = data[key]; if (value == null) {row[key]=null;continue;} if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000000) throw new Error('invalid_population'); row[key]=value; }
 for (const key of ['community_latitude','community_longitude','flhf_latitude','flhf_longitude','settlement_latitude','settlement_longitude','community_distance_to_flhf_km','settlement_distance_to_flhf_km','community_gps_accuracy']) { const value=data[key]; if (value == null) {row[key]=null;continue;} const lat=key.endsWith('latitude'), lng=key.endsWith('longitude'); if (typeof value !== 'number' || !Number.isFinite(value) || (lat && Math.abs(value)>90) || (lng && Math.abs(value)>180) || (!lat && !lng && value<0)) throw new Error('invalid_location'); row[key]=value; }
 const year=data.year_of_microplanning; if (typeof year !== 'number' || !Number.isInteger(year) || year<2000 || year>2100) throw new Error('invalid_year'); row.year_of_microplanning=year;
 row.cdd_from_community=data.cdd_from_community === true;
 return row;
}