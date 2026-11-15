/** Canonical database values shared by Kobo intake and dashboard readers. */
export function normalizeMicroplanChoice(field: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, Record<string, string>> = {
    accessibility: { seasonal_access: 'seasonal', seasonal_accessibility: 'seasonal' },
    security_clearance: { partially_cleared: 'partial', partial_clearance: 'partial' },
    campaign_type: { ntd_mda: 'ntd', polio_sia: 'polio', malaria_itn_irs: 'malaria' },
  };
  return aliases[field]?.[key] ?? key;
}