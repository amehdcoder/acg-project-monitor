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
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  buildDataDictionary, flattenAll, validateDataDictionary,
  type KoboColumn, type SchemaValidationReport,
} from "./koboSchema";

const CONFIG_KEY = "amehnities.integratedSupervisory.koboConfig";
const CACHE_KEY = "amehnities.integratedSupervisory.koboCache";
const LAYOUT_KEY = "amehnities.integratedSupervisory.layout";

export type KoboErrorCode =
  | "auth_failed" | "forbidden" | "not_found" | "rate_limited"
  | "timeout" | "network" | "server_error" | "bad_response" | "unknown";

export class KoboClientError extends Error {
  code: KoboErrorCode;
  status: number;
  detail?: string;
  hint: string;
  constructor(code: KoboErrorCode, message: string, status = 0, detail?: string) {
    super(message);
    this.name = "KoboClientError";
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.hint = friendlyHint(code);
  }
}

function friendlyHint(code: KoboErrorCode): string {
  switch (code) {
    case "auth_failed":  return "Your KoboToolbox API token is invalid or expired. Open Kobo Sync Settings and paste a fresh token from KoboToolbox → Account Settings → API.";
    case "forbidden":    return "This token doesn't have access to the requested form. Ask the form owner to share it with your Kobo account or use an admin token.";
    case "not_found":    return "The form UID could not be found on this server. Double-check the Kobo Server URL and Form UID in Kobo Sync Settings.";
    case "rate_limited": return "KoboToolbox is rate-limiting requests. Wait a minute before syncing again.";
    case "timeout":      return "KoboToolbox took too long to respond. This is usually transient — try again in a moment.";
    case "network":      return "Couldn't reach KoboToolbox. Check your internet connection or try again shortly.";
    case "server_error": return "KoboToolbox returned a server error. It may be temporarily unavailable — retry in a few minutes.";
    default:             return "Something went wrong talking to KoboToolbox. Please retry.";
  }
}

async function parseInvokeError(err: unknown): Promise<KoboClientError> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.text();
      let parsed: any = null;
      try { parsed = JSON.parse(body); } catch {}
      const code = (parsed?.code as KoboErrorCode) || "server_error";
      const detail = parsed?.detail || parsed?.error || body;
      const status = Number(parsed?.status) || 0;
      return new KoboClientError(code, parsed?.error || "KoboToolbox request failed", status, detail);
    } catch {
      return new KoboClientError("server_error", "KoboToolbox request failed");
    }
  }
  const msg = (err as Error)?.message || "Unknown error";
  const lower = msg.toLowerCase();
  const code: KoboErrorCode =
    /timeout|aborted/.test(lower) ? "timeout" :
    /network|failed to fetch/.test(lower) ? "network" : "unknown";
  return new KoboClientError(code, msg);
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
  validation?: SchemaValidationReport;         // schema drift report (computed on fetch)
  survey?: any[];                              // raw asset.content.survey (for label resolver)
  choices?: any[];                             // raw asset.content.choices (for label resolver)
  formUid?: string;                            // needed to key the resolver cache
}

export interface KoboConfig {
  serverUrl: string;
  formUid: string;
  apiToken: string;
  autoSync?: boolean;
  pollMinutes?: number;
}



/* ──────────────────────────────────────────────────────────────────────────
 * MULTI-INTEGRATION REGISTRY
 * Several KoboToolbox forms can be linked at once; each one is an independent
 * "integration" with its own config, submission cache and dashboard layout,
 * so a user can build several dashboards from several Kobo forms.
 * Legacy single-connection storage is migrated transparently on first read.
 * ────────────────────────────────────────────────────────────────────────── */

const REGISTRY_KEY = "amehnities.integratedSupervisory.connections";
const ACTIVE_KEY = "amehnities.integratedSupervisory.activeConnection";

export interface KoboConnection {
  id: string;
  name: string;
  config: KoboConfig;
  createdAt: string;
}

const readJSON = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const writeJSON = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

export const newConnectionId = () => `kc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function listConnections(): KoboConnection[] {
  const existing = readJSON<KoboConnection[]>(REGISTRY_KEY);
  if (existing && Array.isArray(existing) && existing.length) return existing;
  // Migrate a legacy single connection, preserving its cache/layout.
  const legacy = readJSON<KoboConfig>(CONFIG_KEY);
  if (legacy?.formUid) {
    const conn: KoboConnection = {
      id: "legacy",
      name: "Integrated MDA Supervisory Checklist",
      config: legacy,
      createdAt: new Date().toISOString(),
    };
    writeJSON(REGISTRY_KEY, [conn]);
    return [conn];
  }
  return [];
}

export function saveConnection(conn: KoboConnection) {
  const all = listConnections();
  const idx = all.findIndex((c) => c.id === conn.id);
  if (idx >= 0) all[idx] = conn; else all.push(conn);
  writeJSON(REGISTRY_KEY, all);
}

export function deleteConnection(id: string) {
  writeJSON(REGISTRY_KEY, listConnections().filter((c) => c.id !== id));
  try {
    localStorage.removeItem(`${CACHE_KEY}:${id}`);
    localStorage.removeItem(`${LAYOUT_KEY}:${id}`);
  } catch { /* ignore */ }
  if (getActiveConnectionId() === id) {
    const next = listConnections()[0]?.id ?? null;
    if (next) setActiveConnectionId(next); else { try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ } }
  }
}

export function getActiveConnectionId(): string | null {
  const stored = (() => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } })();
  const all = listConnections();
  if (stored && all.some((c) => c.id === stored)) return stored;
  return all[0]?.id ?? null;
}

export function setActiveConnectionId(id: string) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
}

export function getConnection(id?: string | null): KoboConnection | null {
  const target = id ?? getActiveConnectionId();
  if (!target) return null;
  return listConnections().find((c) => c.id === target) ?? null;
}

/** Storage key scoped to a connection (legacy connection keeps the old key). */
const scoped = (base: string, id: string | null) => (!id || id === "legacy" ? base : `${base}:${id}`);

export function loadKoboConfig(connectionId?: string | null): KoboConfig | null {
  const conn = getConnection(connectionId);
  if (conn) return conn.config;
  return readJSON<KoboConfig>(CONFIG_KEY);
}
export function saveKoboConfig(cfg: KoboConfig, connectionId?: string | null) {
  const id = connectionId ?? getActiveConnectionId();
  if (id) {
    const conn = getConnection(id);
    saveConnection({
      id,
      name: conn?.name || cfg.formUid || "Kobo integration",
      config: cfg,
      createdAt: conn?.createdAt || new Date().toISOString(),
    });
  }
  writeJSON(CONFIG_KEY, cfg);
}
export function clearKoboConfig() { try { localStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ } }

export function loadKoboCache(connectionId?: string | null): KoboCache | null {
  const id = connectionId ?? getActiveConnectionId();
  try {
    const raw = localStorage.getItem(scoped(CACHE_KEY, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KoboCache;
    // Backfill computed fields for caches written by an older build.
    if (!parsed.flatResults) parsed.flatResults = flattenAll(parsed.results ?? []);
    if (!parsed.columns) parsed.columns = buildDataDictionary(parsed.flatResults);
    return parsed;
  } catch { return null; }
}
export function saveKoboCache(cache: KoboCache, connectionId?: string | null) {
  const id = connectionId ?? getActiveConnectionId();
  try { localStorage.setItem(scoped(CACHE_KEY, id), JSON.stringify(cache)); } catch { /* quota */ }
}

export function loadLayout<T>(connectionId?: string | null): T | null {
  const id = connectionId ?? getActiveConnectionId();
  return readJSON<T>(scoped(LAYOUT_KEY, id));
}
export function saveLayout<T>(layout: T, connectionId?: string | null) {
  const id = connectionId ?? getActiveConnectionId();
  writeJSON(scoped(LAYOUT_KEY, id), layout);
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
  if (error) throw await parseInvokeError(error);
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
  if (error) throw await parseInvokeError(error);
  const d = data as any;
  if (d?.error) {
    throw new KoboClientError((d.code as KoboErrorCode) || "server_error", d.error, Number(d.status) || 0, d.detail);
  }
  return d;
}

export async function fetchSubmissions(cfg: KoboConfig, connectionId?: string | null): Promise<KoboCache> {
  const first = await fetchPage(cfg, 0);
  const total = Number(first?.count) || (first?.results?.length ?? 0);
  const results: any[] = [...(first?.results ?? [])];
  let page = 1;
  let lastLen = results.length;
  while (
    lastLen === PAGE_SIZE &&
    results.length < total &&
    results.length < HARD_CAP
  ) {
    const next = await fetchPage(cfg, page);
    const chunk = Array.isArray(next?.results) ? next.results : [];
    if (chunk.length === 0) break;
    results.push(...chunk);
    lastLen = chunk.length;
    page++;
  }
  // Preserve exact Kobo chronological order (newest first).
  results.sort((a, b) => {
    const ta = new Date(a?._submission_time ?? 0).getTime();
    const tb = new Date(b?._submission_time ?? 0).getTime();
    return tb - ta;
  });
  const survey = Array.isArray(first?.survey) ? first.survey : [];
  const fields = Array.isArray(first?.fields) ? first.fields : [];
  const flatResults = flattenAll(results, survey.length ? survey : fields);
  const columns = buildDataDictionary(flatResults, survey.length ? survey : fields);
  const validation = validateDataDictionary(columns, fields);
  if (!validation.ok || validation.warnings.length > 0) {
    console.warn("[Kobo] schema validation issues:", validation.issues);
  }
  const cache: KoboCache = {
    fetchedAt: new Date().toISOString(),
    formTitle: first?.form_title ?? null,
    count: results.length,
    results,
    flatResults,
    fields,
    columns,
    validation,
    survey,
    choices: Array.isArray(first?.choices) ? first.choices : [],
    formUid: cfg.formUid,
  };
  saveKoboCache(cache, connectionId);
  return cache;
}


/**
 * Re-validate a cached dictionary against its stored schema without re-fetching.
 * Used by consumers (dashboards, exports) as a last-line guard before rendering.
 */
export function validateCache(cache: KoboCache | null): SchemaValidationReport | null {
  if (!cache) return null;
  return validateDataDictionary(cache.columns ?? [], cache.fields ?? []);
}

