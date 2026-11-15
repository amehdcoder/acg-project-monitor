import { normalizeMicroplanChoice } from '../../../supabase/functions/_shared/microplanChoices';

/** Normalize persisted/queued values once, before any dashboard derivations. */
export function normalizeMicroplanEntry<T extends Record<string, unknown>>(entry: T): T {
  const out: Record<string, unknown> = { ...entry };
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