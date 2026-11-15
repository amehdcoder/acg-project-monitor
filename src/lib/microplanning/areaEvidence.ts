import { entryPoint, geometryContains, normState, type HeatEntry } from './heatmaps';
import { distanceKm, recordedNumber, type Boundary } from './osiris';

export interface AreaEntry extends HeatEntry { id?: string; settlement_name?: string | null; population_source?: string | null; year_of_microplanning?: number | null; trachoma_1_9_male?: number | null; trachoma_1_9_female?: number | null }
export interface ReferenceSettlement { name: string; lga: string; ward: string; latitude: number | null; longitude: number | null }
export interface AreaRow { name: string; ward: string; lat: number | null; lng: number | null; population: number | null; populationSource: string; locationSource: string; status: string; year: number | null; male: number | null; female: number | null }
export interface LandEvidence { name: string; feature: string; lat: number; lng: number; population: number | null; source: string }
export function areaScope(lat: number, lng: number, entries: AreaEntry[], boundaries: Boundary[]) {
  return boundaries.find(b => geometryContains(b.geometry, lat, lng) && entries.some(e => normState(e.state) === normState(b.properties.state) && normState(e.lga) === normState(b.properties.lga)));
}
export function areaRows(entries: AreaEntry[], references: ReferenceSettlement[], state: string, lga: string): AreaRow[] {
  const scoped = entries.filter(e => normState(e.state) === normState(state) && normState(e.lga) === normState(lga));
  const rows: AreaRow[] = scoped.map(e => { const p = entryPoint(e); return {
    name: String(e.settlement_name || e.community_name || 'Unnamed recorded location'), ward: String(e.ward || ''), lat: p?.[0] ?? null, lng: p?.[1] ?? null,
    population: recordedNumber(e.estimated_total_population), populationSource: e.population_source || 'Source not recorded', locationSource: 'Project submission GPS', status: 'Recorded — verify current occupancy', year: e.year_of_microplanning ?? null,
    male: recordedNumber(e.trachoma_1_9_male), female: recordedNumber(e.trachoma_1_9_female),
  }; });
  const seen = new Set(rows.map(r => `${normState(r.ward)}|${normState(r.name)}`));
  for (const ref of references.filter(r => normState(r.lga) === normState(lga))) {
    const key = `${normState(ref.ward)}|${normState(ref.name)}`;
    if (!seen.has(key)) { seen.add(key); rows.push({name: ref.name, ward: ref.ward, lat: ref.latitude, lng: ref.longitude, population: null, populationSource: 'Not available in GRID3 settlement registry', locationSource: 'Bundled GRID3 Nigeria settlement registry', status: 'Reference settlement — not matched to a submission', year: null, male: null, female: null}); }
  }
  return rows;
}
export function nearbyAreaRows(rows: AreaRow[], lat: number, lng: number, km = 2) {
  return rows.flatMap(r => r.lat == null || r.lng == null ? [] : [{...r, distance: distanceKm({lat,lng},{lat:r.lat,lng:r.lng})}]).filter(r => r.distance <= km).sort((a,b) => a.distance-b.distance);
}
export function evidenceVerdict(rows: AreaRow[], evidence: LandEvidence[]) {
  if (rows.length || evidence.some(e => e.feature.startsWith('place:') || e.feature.startsWith('building:'))) return 'Settlement / building evidence — occupancy unverified';
  if (evidence.length) return 'Mapped land features — habitation unverified';
  return 'Unknown — no returned settlement or land-feature evidence';
}
export function parseLandEvidence(data: { elements?: Array<{type: string; id: number; lat?: number; lon?: number; center?: {lat:number;lon:number}; tags?: Record<string,string>}> }): LandEvidence[] {
  return (data.elements || []).flatMap(e => {
    const t=e.tags || {}, lat=e.lat ?? e.center?.lat, lng=e.lon ?? e.center?.lon;
    if (lat == null || lng == null) return [];
    const feature = t.place ? `place:${t.place}` : t.building ? `building:${t.building}` : t.natural ? `natural:${t.natural}` : t.landuse ? `landuse:${t.landuse}` : `waterway:${t.waterway || 'unknown'}`;
    return [{name:t.name || 'Unnamed mapped feature',feature,lat,lng,population:recordedNumber(t.population),source:`https://www.openstreetmap.org/${e.type}/${e.id}`}];
  });
}