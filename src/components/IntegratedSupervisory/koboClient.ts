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

/* ── Background memory ──────────────────────────────────────────────────────
   Large forms overflow localStorage (~5 MB), which silently dropped the cache
   and forced a full re-download on every page load. The cache now lives in
   memory + IndexedDB (no size limit); localStorage is only a small-form mirror. */
const memCache = new Map<string, KoboCache>();
const IDB_NAME = "kobo-cache-v1";
const IDB_STORE = "caches";
let idbPromise: Promise<IDBDatabase | null> | null = null;
function openIdb(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return idbPromise;
}
function hydrate(parsed: KoboCache): KoboCache {
  if (!parsed.flatResults) parsed.flatResults = flattenAll(parsed.results ?? [], parsed.survey);
  if (!parsed.columns) parsed.columns = buildDataDictionary(parsed.flatResults, parsed.survey);
  return parsed;
}

export function loadKoboCache(connectionId?: string | null): KoboCache | null {
  const id = connectionId ?? getActiveConnectionId();
  const key = scoped(CACHE_KEY, id);
  const mem = memCache.get(key);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = hydrate(JSON.parse(raw) as KoboCache);
    memCache.set(key, parsed);
    return parsed;
  } catch { return null; }
}

/** Memory → IndexedDB → localStorage. Use on page load for instant paint of large forms. */
export async function loadKoboCacheAsync(connectionId?: string | null): Promise<KoboCache | null> {
  const id = connectionId ?? getActiveConnectionId();
  const key = scoped(CACHE_KEY, id);
  const quick = loadKoboCache(id);
  if (quick) return quick;
  const db = await openIdb();
  if (!db) return null;
  const stored = await new Promise<KoboCache | null>((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as KoboCache) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  if (!stored) return null;
  const c = hydrate(stored);
  memCache.set(key, c);
  return c;
}

export function saveKoboCache(cache: KoboCache, connectionId?: string | null) {
  const id = connectionId ?? getActiveConnectionId();
  const key = scoped(CACHE_KEY, id);
  memCache.set(key, cache);
  // Persist only raw data; derived fields are rebuilt on load (smaller + faster writes).
  const { flatResults: _f, columns: _c, validation: _v, ...lean } = cache as any;
  void openIdb().then((db) => {
    if (!db) return;
    try { db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(lean, key); } catch { /* ignore */ }
  });
  try {
    const json = JSON.stringify(lean);
    if (json.length < 1_500_000) localStorage.setItem(key, json);
    else localStorage.removeItem(key); // stale small copy must not shadow IndexedDB
  } catch { try { localStorage.removeItem(key); } catch { /* ignore */ } }
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

async function fetchPage(cfg: KoboConfig, page: number, since?: string | null) {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
    body: {
      action: "fetch_submissions",
      server_url: cfg.serverUrl,
      form_uid: cfg.formUid,
      api_token: cfg.apiToken,
      page_size: PAGE_SIZE,
      page,
      since: since || undefined,
      skip_asset: page > 0 || undefined,
    },
  });
  if (error) throw await parseInvokeError(error);
  const d = data as any;
  if (d?.error) {
    throw new KoboClientError((d.code as KoboErrorCode) || "server_error", d.error, Number(d.status) || 0, d.detail);
  }
  return d;
}

const rowKey = (r: any) => String(r?._uuid ?? r?._id ?? r?.["meta/instanceID"] ?? "");

/** Newest `_submission_time` in a cache — the delta cursor. */
export function latestSubmissionTime(cache: KoboCache | null | undefined): string | null {
  if (!cache?.results?.length) return null;
  let latest: string | null = null;
  for (const r of cache.results as any[]) {
    const t = String(r?._submission_time ?? "");
    if (t && (!latest || t > latest)) latest = t;
  }
  return latest;
}

/**
 * Pull submissions for a connection.
 *
 * By default this performs a DELTA sync against the cached payload: only
 * submissions newer than the cache's newest `_submission_time` are downloaded
 * and merged, so a realtime-triggered refresh completes in well under a second
 * instead of re-downloading the entire form. Pass `{ full: true }` to force a
 * complete re-download (used after a schema change or manual "Resync all").
 */
export async function fetchSubmissions(
  cfg: KoboConfig,
  connectionId?: string | null,
  opts: { full?: boolean } = {},
): Promise<KoboCache> {
  const cached = opts.full ? null : await loadKoboCacheAsync(connectionId);
  // A cache belonging to a different Kobo asset must never be merged into the
  // new form's data — repointing a connection forces a complete re-download.
  const prev = cached && cached.formUid && cached.formUid !== cfg.formUid ? null : cached;
  const since = prev?.survey?.length ? latestSubmissionTime(prev) : null;

  const first = await fetchPage(cfg, 0, since);
  const total = Number(first?.count) || (first?.results?.length ?? 0);
  const fresh: any[] = [...(first?.results ?? [])];
  let page = 1;
  let lastLen = fresh.length;
  while (lastLen === PAGE_SIZE && fresh.length < total && fresh.length < HARD_CAP) {
    const next = await fetchPage(cfg, page, since);
    const chunk = Array.isArray(next?.results) ? next.results : [];
    if (chunk.length === 0) break;
    fresh.push(...chunk);
    lastLen = chunk.length;
    page++;
  }

  let results: any[];
  if (since && prev) {
    const byKey = new Map<string, any>();
    for (const r of prev.results ?? []) byKey.set(rowKey(r), r);
    for (const r of fresh) byKey.set(rowKey(r), r); // edits replace in place
    results = Array.from(byKey.values());
  } else {
    results = fresh;
  }

  // Preserve exact Kobo chronological order (newest first).
  results.sort((a, b) => {
    const ta = new Date(a?._submission_time ?? 0).getTime();
    const tb = new Date(b?._submission_time ?? 0).getTime();
    return tb - ta;
  });

  const survey = Array.isArray(first?.survey) && first.survey.length ? first.survey : (prev?.survey ?? []);
  const fields = Array.isArray(first?.fields) && first.fields.length ? first.fields : (prev?.fields ?? []);
  const choices = Array.isArray(first?.choices) && first.choices.length ? first.choices : (prev?.choices ?? []);
  const flatResults = flattenAll(results, survey.length ? survey : fields);
  const columns = buildDataDictionary(flatResults, survey.length ? survey : fields);
  const validation = validateDataDictionary(columns, fields);
  if (!validation.ok || validation.warnings.length > 0) {
    console.warn("[Kobo] schema validation issues:", validation.issues);
  }
  const cache: KoboCache = {
    fetchedAt: new Date().toISOString(),
    formTitle: first?.form_title ?? prev?.formTitle ?? null,
    count: results.length,
    results,
    flatResults,
    fields,
    columns,
    validation,
    survey,
    choices,
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

