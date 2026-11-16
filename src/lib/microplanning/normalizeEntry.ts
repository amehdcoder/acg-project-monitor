import { normalizeMicroplanChoice } from '../../../supabase/functions/_shared/microplanChoices';

/** Normalize persisted/queued values once, before any dashboard derivations. */
export function normalizeMicroplanEntry<T extends Record<string, unknown>>(entry: T): T {
  const out: Record<string, unknown> = { ...entry };
  const metadata = entry.extra_metadata;
  const marker = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).ame_microplan : undefined;
  if (marker && typeof marker === 'object' && (marker as Record<string, unknown>).kind === 'settlement') {
    // Existing map consumers use the primary point; a nested settlement must
    // never be plotted at its parent community's GPS.
    out.community_latitude = entry.settlement_latitude;
    out.community_longitude = entry.settlement_longitude;
    out.community_lat_override = entry.settlement_lat_override ?? null;
    out.community_lng_override = entry.settlement_lng_override ?? null;
  }
  for (const field of ['accessibility', 'security_clearance', 'terrain_type', 'campaign_type', 'population_source']) {
    if (field in entry) out[field] = normalizeMicroplanChoice(field, entry[field]);
  }
  for (const field of Object.keys(entry)) {
    if (!/^(estimated_|trachoma_|pwd_|number_of_households$|total_treated$|total_households_|households_treated$)/.test(field)) continue;
    const value = entry[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    const number = Number(value.replace(/,/g, ''));
    if (Number.isFinite(number) && number >= 0) out[field] = number;
  }
  if (typeof out.cdd_from_community === 'string') {
    const value = out.cdd_from_community.trim().toLowerCase();
    if (['yes', 'true', '1'].includes(value)) out.cdd_from_community = true;
    else if (['no', 'false', '0'].includes(value)) out.cdd_from_community = false;
  }
  return out as T;
}