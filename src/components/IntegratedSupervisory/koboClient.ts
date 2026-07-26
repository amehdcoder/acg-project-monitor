/**
 * Client helpers for the Integrated Supervisory Dashboard's Kobo integration.
 * Config is persisted per-user in localStorage (no schema changes required)
 * and submissions are cached so the dashboard renders instantly even offline.
 */
import { supabase } from "@/integrations/supabase/client";

const CONFIG_KEY = "amehnities.integratedSupervisory.koboConfig";
const CACHE_KEY = "amehnities.integratedSupervisory.koboCache";

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
  results: any[];
  fields: KoboField[];
}

export function loadKoboConfig(): KoboConfig | null {
  try { const raw = localStorage.getItem(CONFIG_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveKoboConfig(cfg: KoboConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}
export function clearKoboConfig() { localStorage.removeItem(CONFIG_KEY); }

export function loadKoboCache(): KoboCache | null {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveKoboCache(cache: KoboCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
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

export async function fetchSubmissions(cfg: KoboConfig, pageSize = 500): Promise<KoboCache> {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
    body: {
      action: "fetch_submissions",
      server_url: cfg.serverUrl,
      form_uid: cfg.formUid,
      api_token: cfg.apiToken,
      page_size: pageSize,
      page: 0,
    },
  });
  if (error) throw error;
  const d = data as any;
  if (d?.error) throw new Error(d.detail || d.error);
  const cache: KoboCache = {
    fetchedAt: d?.fetched_at ?? new Date().toISOString(),
    formTitle: d?.form_title ?? null,
    count: d?.count ?? (Array.isArray(d?.results) ? d.results.length : 0),
    results: Array.isArray(d?.results) ? d.results : [],
    fields: Array.isArray(d?.fields) ? d.fields : [],
  };
  saveKoboCache(cache);
  return cache;
}
