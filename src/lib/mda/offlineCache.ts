/**
 * MDA dashboard offline cache
 * ────────────────────────────────────────────────────────────────────────
 * Persists the last synced checklist submissions + form questions per form so
 * the Integrated MDA Supervisory Dashboard, its analyses, data-quality panel
 * and drill-down sheet keep working when the device goes offline. The cache is
 * keyed by form id and stores the already-normalised dashboard rows so no
 * network or recomputation is needed to render from it.
 */

const LEGACY_PREFIX = "mda-dashboard-cache:";
const PREFIX = "mda-dashboard-cache:v2:";
const MAX_ROWS = 5000; // keep localStorage payloads bounded

export interface MdaCachePayload {
  rows: any[];
  questions: any[];
  cachedAt: number;
}

export function saveMdaCache(formId: string, rows: any[], questions: any[]): void {
  if (!formId) return;
  try {
    const payload: MdaCachePayload = {
      rows: rows.slice(0, MAX_ROWS),
      questions,
      cachedAt: Date.now(),
    };
    localStorage.setItem(PREFIX + formId, JSON.stringify(payload));
  } catch {
    // storage full / unavailable — caching is best-effort
  }
}

export function loadMdaCache(formId: string): MdaCachePayload | null {
  if (!formId) return null;
  try {
    const raw = localStorage.getItem(PREFIX + formId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MdaCachePayload;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMdaCache(formId: string): void {
  if (!formId) return;
  try {
    localStorage.removeItem(PREFIX + formId);
    localStorage.removeItem(LEGACY_PREFIX + formId);
  } catch {
    // storage unavailable — clearing is best-effort
  }
}

export function clearLegacyMdaCache(formId?: string): void {
  try {
    if (formId) {
      localStorage.removeItem(LEGACY_PREFIX + formId);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable — clearing is best-effort
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
