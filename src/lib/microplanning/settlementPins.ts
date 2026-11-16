export interface SettlementPinEntry {
  settlement_name: string | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  estimated_total_population: number | null;
  cdd_names: string | null;
  cdd_details?: unknown;
  extra_metadata?: unknown;
  community_name: string;
}

export function settlementPinData(entry: SettlementPinEntry) {
  const lat = entry.settlement_latitude, lng = entry.settlement_longitude;
  if (!entry.settlement_name?.trim() || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const metadata = entry.extra_metadata as { ame_microplan?: { kind?: string; measure_scope?: string } } | null;
  const ownMeasures = metadata?.ame_microplan?.measure_scope === 'settlement';
  const names = Array.isArray(entry.cdd_details) ? entry.cdd_details.flatMap(item => item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() ? [item.name.trim()] : []) : [];
  return {
    name: entry.settlement_name.trim(), community: entry.community_name, lat, lng,
    population: ownMeasures ? entry.estimated_total_population : null,
    cdd: ownMeasures ? names.join(', ') || entry.cdd_names?.trim() || 'Not recorded' : 'Not recorded for this settlement',
    nested: metadata?.ame_microplan?.kind === 'settlement',
  };
}

export function settlementPinContent(pin: NonNullable<ReturnType<typeof settlementPinData>>) {
  const root = document.createElement('div');
  root.className = 'geo-settlement-detail';
  const title = document.createElement('strong');
  title.textContent = pin.name;
  root.append(title);
  for (const text of [pin.community, `GPS: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`, `Population: ${pin.population == null ? 'Not recorded for this settlement' : pin.population.toLocaleString()}`, `CDD: ${pin.cdd}`]) {
    const line = document.createElement('div'); line.textContent = text; root.append(line);
  }
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