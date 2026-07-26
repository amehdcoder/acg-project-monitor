/**
 * Client helpers for the Integrated Supervisory Dashboard's Kobo integration.
 * Config is persisted per-user in localStorage (no schema changes required)
 * and submissions are cached so the dashboard renders instantly even offline.
 *
 * fetchSubmissions() paginates through the ENTIRE Kobo asset so no rows are
 * truncated, then normalizes rows via the schema helper into a flat dictionary
 * that the Looker-style dashboard uses natively.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildDataDictionary, flattenAll, type KoboColumn } from "./koboSchema";

const CONFIG_KEY = "amehnities.integratedSupervisory.koboConfig";
const CACHE_KEY = "amehnities.integratedSupervisory.koboCache";
const LAYOUT_KEY = "amehnities.integratedSupervisory.layout";

export interface KoboConfig {
  serverUrl: string;
  formUid: string;
  apiToken: string;
  autoSync?: boolean;
  pollMinutes?: number;
}

export interface KoboField { name: string; type: string; label: string }

export interface KoboCache {
  fetchedAt: string;
  formTitle: string | null;
  count: number;
  results: any[];                              // raw submissions (untruncated)
  flatResults: Record<string, unknown>[];      // fully flattened for widgets
  fields: KoboField[];                         // Kobo survey field schema (from asset)
  columns: KoboColumn[];                       // computed data dictionary
}

export function loadKoboConfig(): KoboConfig | null {
  try { const raw = localStorage.getItem(CONFIG_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveKoboConfig(cfg: KoboConfig) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }
export function clearKoboConfig() { localStorage.removeItem(CONFIG_KEY); }

export function loadKoboCache(): KoboCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KoboCache;
    // Backfill computed fields for caches written by an older build.
    if (!parsed.flatResults) parsed.flatResults = flattenAll(parsed.results ?? []);
    if (!parsed.columns) parsed.columns = buildDataDictionary(parsed.flatResults);
    return parsed;
  } catch { return null; }
}
export function saveKoboCache(cache: KoboCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

export function loadLayout<T>(): T | null {
  try { const raw = localStorage.getItem(LAYOUT_KEY); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function saveLayout<T>(layout: T) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* quota */ }
}

export async function fetchWebhookSecret(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
      body: { action: "get_webhook_secret" },
    });
    if (error) throw error;
    return (data as any)?.secret ?? null;
  } catch { return null; }
}

export async function testConnection(cfg: KoboConfig) {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
    body: { action: "test_connection", server_url: cfg.serverUrl, form_uid: cfg.formUid, api_token: cfg.apiToken },
  });
  if (error) throw error;
  return data as any;
}

const PAGE_SIZE = 500;
const HARD_CAP = 50_000; // safety guard

async function fetchPage(cfg: KoboConfig, page: number) {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
    body: {
      action: "fetch_submissions",
      server_url: cfg.serverUrl,
      form_uid: cfg.formUid,
      api_token: cfg.apiToken,
      page_size: PAGE_SIZE,
      page,
    },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) throw new Error(d.detail || d.error);
  return d;
}

export async function fetchSubmissions(cfg: KoboConfig): Promise<KoboCache> {
  const first = await fetchPage(cfg, 0);
  const total = Number(first?.count) || (first?.results?.length ?? 0);
  const results: any[] = [...(first?.results ?? [])];
  let page = 1;
  while (results.length < total && results.length < HARD_CAP && (first?.results?.length ?? 0) === PAGE_SIZE) {
    const next = await fetchPage(cfg, page);
    const chunk = Array.isArray(next?.results) ? next.results : [];
    if (chunk.length === 0) break;
    results.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    page++;
  }
  const flatResults = flattenAll(results);
  const columns = buildDataDictionary(flatResults);
  const cache: KoboCache = {
    fetchedAt: new Date().toISOString(),
    formTitle: first?.form_title ?? null,
    count: results.length,
    results,
    flatResults,
    fields: Array.isArray(first?.fields) ? first.fields : [],
    columns,
  };
  saveKoboCache(cache);
  return cache;
}
