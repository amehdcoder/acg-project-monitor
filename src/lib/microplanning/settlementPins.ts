export interface SettlementPinEntry {
  settlement_name: string | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  estimated_total_population: number | null;
  cdd_names: string | null;
  cdd_details?: unknown;
  extra_metadata?: unknown;
  community_name: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  number_of_households?: number | null;
  population_source?: string | null;
  terrain_type?: string | null;
  accessibility?: string | null;
  security_clearance?: string | null;
  settlement_distance_to_flhf_km?: number | null;
  settlement_mai_unguwa?: string | null;
  community_leader_phone?: string | null;
  cdd_from_community?: boolean | null;
  cdd_phone_numbers?: string | null;
  cdd_account_name?: string | null;
  cdd_account_number?: string | null;
  cdd_bank?: string | null;
  estimated_children_0_4?: number | null;
  estimated_children_5_14?: number | null;
  estimated_adults_15_plus?: number | null;
  trachoma_0_5_months?: number | null;
  trachoma_6m_6y?: number | null;
  trachoma_7_14y?: number | null;
  trachoma_15_plus?: number | null;
  trachoma_1_9_male?: number | null;
  trachoma_1_9_female?: number | null;
  pwd_total?: number | null;
  pwd_visual?: number | null;
  pwd_hearing?: number | null;
  pwd_physical?: number | null;
  pwd_intellectual?: number | null;
  pwd_communication?: number | null;
  pwd_selfcare?: number | null;
  pwd_albinism?: number | null;
  campaign_type?: string | null;
  mda_type?: string | null;
  year_of_microplanning?: number | null;
  notes?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const choice = (value: string | null | undefined) => value ? ({
  cdd_census_census_update: 'CDD Census/Census Update', ntd: 'NTD (MDA)',
  standard: 'Standard MDA', trachoma: 'Trachoma MDA', gps_estimation: 'GPS estimation',
} as Record<string, string>)[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : null;

export function settlementPinData(entry: SettlementPinEntry) {
  const lat = entry.settlement_latitude, lng = entry.settlement_longitude;
  if (!entry.settlement_name?.trim() || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const metadata = entry.extra_metadata as { ame_microplan?: { kind?: string; measure_scope?: string } } | null;
  const ownMeasures = metadata?.ame_microplan?.measure_scope === 'settlement';
  const names = Array.isArray(entry.cdd_details) ? entry.cdd_details.flatMap(item => item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() ? [item.name.trim()] : []) : [];
  const cdds = ownMeasures && Array.isArray(entry.cdd_details) ? entry.cdd_details.filter(isRecord).flatMap(item => {
    const name = text(item.name);
    return name ? [{ name, phone: text(item.phone), bank: text(item.bank), accountName: text(item.account_name), accountNumber: text(item.account_number) }] : [];
  }) : [];
  if (ownMeasures && !cdds.length && entry.cdd_names?.trim()) {
    const phones = entry.cdd_phone_numbers?.split(',') ?? [];
    entry.cdd_names.split(',').filter(name => name.trim()).forEach((name, i) => cdds.push({
      name: name.trim(), phone: text(phones[i]), bank: i === 0 ? text(entry.cdd_bank) : null,
      accountName: i === 0 ? text(entry.cdd_account_name) : null, accountNumber: i === 0 ? text(entry.cdd_account_number) : null,
    }));
  }
  const census: [string, number | null][] = ownMeasures ? [
    ['Children 0–4 years', count(entry.estimated_children_0_4)], ['Children 5–14 years', count(entry.estimated_children_5_14)],
    ['Adults 15+ years', count(entry.estimated_adults_15_plus)], ['0–5 months', count(entry.trachoma_0_5_months)],
    ['6 months–6 years', count(entry.trachoma_6m_6y)], ['7–14 years', count(entry.trachoma_7_14y)],
    ['15+ years (Trachoma)', count(entry.trachoma_15_plus)], ['5–9 years · Male', count(entry.trachoma_1_9_male)],
    ['5–9 years · Female', count(entry.trachoma_1_9_female)],
  ] : [];
  const disability: [string, number | null][] = ownMeasures ? [
    ['Total persons', count(entry.pwd_total)], ['Visual / Seeing', count(entry.pwd_visual)], ['Hearing', count(entry.pwd_hearing)],
    ['Physical / Mobility', count(entry.pwd_physical)], ['Intellectual / Cognitive', count(entry.pwd_intellectual)],
    ['Communication / Speech', count(entry.pwd_communication)], ['Self-care', count(entry.pwd_selfcare)], ['Albinism', count(entry.pwd_albinism)],
  ] : [];
  return {
    name: entry.settlement_name.trim(), community: entry.community_name, lat, lng,
    population: ownMeasures ? entry.estimated_total_population : null,
    cdd: ownMeasures ? names.join(', ') || entry.cdd_names?.trim() || 'Not recorded' : 'Not recorded for this settlement',
    nested: metadata?.ame_microplan?.kind === 'settlement',
    ownMeasures, cdds, census, disability,
    geography: [entry.ward, entry.lga, entry.state].filter(Boolean).join(' · '),
    households: ownMeasures ? count(entry.number_of_households) : null,
    populationSource: ownMeasures ? choice(entry.population_source) : null,
    terrain: ownMeasures ? choice(entry.terrain_type) : null,
    accessibility: ownMeasures ? choice(entry.accessibility) : null,
    security: ownMeasures ? choice(entry.security_clearance) : null,
    flhf: text(entry.flhf_name), distance: count(entry.settlement_distance_to_flhf_km),
    leader: text(entry.settlement_mai_unguwa),
    cddOrigin: ownMeasures && entry.cdd_from_community != null ? entry.cdd_from_community ? 'From this community / settlement' : 'From outside' : null,
    campaign: [choice(entry.campaign_type), choice(entry.mda_type), entry.year_of_microplanning].filter(Boolean).join(' · '),
    notes: ownMeasures ? text(entry.notes) : null,
  };
}

export function settlementPinContent(pin: NonNullable<ReturnType<typeof settlementPinData>>, mode: 'tooltip' | 'popup' = 'tooltip') {
  const root = document.createElement('div');
  root.className = 'geo-settlement-detail';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', `${pin.name} settlement details`);
  root.tabIndex = 0;
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = pin.name;
  const subtitle = document.createElement('div');
  subtitle.textContent = [pin.community, pin.geography].filter(Boolean).join(' · ');
  header.append(title, subtitle); root.append(header);
  type Row = [string, string | number | null];
  const section = (heading: string, rows: Row[], missing = 'Not recorded') => {
    if (!rows.length) return;
    const group = document.createElement('section');
    const caption = document.createElement('h4'); caption.textContent = heading; group.append(caption);
    const list = document.createElement('dl');
    for (const [label, value] of rows) {
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = typeof value === 'number' ? value.toLocaleString('en-NG') : value ?? missing;
      list.append(term, detail);
    }
    group.append(list); root.append(group);
  };
  section('Location', [['GPS', `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`], ['FLHF', pin.flhf], ['Distance to FLHF', pin.distance == null ? null : `${pin.distance.toLocaleString('en-NG')} km`], ...(pin.leader ? [['Settlement leader', pin.leader] as Row] : [])]);
  section('Population & households', [['Population', pin.population], ['Households', pin.households], ['Population source', pin.populationSource]], pin.ownMeasures ? 'Not recorded' : 'Not recorded for this settlement');
  section('Field conditions', [['Terrain', pin.terrain], ['Accessibility', pin.accessibility], ['Security clearance', pin.security]], pin.ownMeasures ? 'Not recorded' : 'Not recorded for this settlement');
  section('Age disaggregation', pin.census.filter(([, value]) => value != null));
  section('Disability', pin.disability.filter(([, value]) => value != null));
  section('CDDs', [['CDD', pin.cdd], ...(pin.cddOrigin ? [['Origin', pin.cddOrigin] as Row] : [])]);
  for (const [index, cdd] of pin.cdds.entries()) {
    section(`CDD ${index + 1}`, [
      ['Name', cdd.name], ['Phone', cdd.phone],
      ...(mode === 'popup' ? [['Bank', cdd.bank], ['Account name', cdd.accountName], ['Account number', cdd.accountNumber]] as Row[] : []),
    ]);
  }
  if (pin.campaign) section('Campaign', [['Campaign', pin.campaign]]);
  if (pin.notes) section('Notes', [['Notes', pin.notes]]);
  return root;
}

/** Only the already-authorized map input can contribute pins or missing-GPS counts. */
export function settlementLayerData<T extends SettlementPinEntry>(entries: T[]) {
  const pins = entries.flatMap(entry => {
    const pin = settlementPinData(entry);
    return pin ? [{ entry, pin }] : [];
  });
  const named = entries.filter(entry => entry.settlement_name?.trim()).length;
  return { pins, named, missingGps: named - pins.length };
}