/**
 * Dedicated KoboToolbox integration for the MDA Medicine Logistics /
 * Accountability form. It reuses the shared fetch pipeline but keeps its own
 * config + submission cache (scoped connection id "medlog") so it never
 * collides with the supervisory checklist integrations.
 */
import { fetchSubmissions, loadKoboCache, saveKoboCache, type KoboCache, type KoboConfig } from "./koboClient";

export const MEDLOG_ID = "medlog";
const CFG_KEY = "amehnities.isc.medicineLogistics.config";

export function loadMedLogConfig(): KoboConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as KoboConfig) : null;
  } catch { return null; }
}

export function saveMedLogConfig(cfg: KoboConfig) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* quota */ }
}

export function clearMedLogConfig() {
  try { localStorage.removeItem(CFG_KEY); } catch { /* ignore */ }
}

export function loadMedLogCache(): KoboCache | null {
  return loadKoboCache(MEDLOG_ID);
}

export async function syncMedLog(cfg: KoboConfig): Promise<KoboCache> {
  const cache = await fetchSubmissions(cfg, MEDLOG_ID);
  saveKoboCache(cache, MEDLOG_ID);
  return cache;
}
