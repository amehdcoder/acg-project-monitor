/**
 * Universal Kobo Dashboard Hub — connection registry + zero-config sync client.
 *
 * Talks to the existing `kobo-form-manager` edge function (server-side proxy to
 * the KoboToolbox v2 REST API) so tokens never leave the browser for a
 * cross-origin request and SSRF protection stays centralised.
 *
 * Everything is cached per connection in localStorage so a dashboard renders
 * instantly (offline-first) before the background refresh completes.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  inferSchema, inferSchemaFromRows, type HubSchema,
} from "./schema";

const REGISTRY_KEY = "amehnities.koboHub.connections";
const ACTIVE_KEY = "amehnities.koboHub.active";
const CACHE_KEY = "amehnities.koboHub.cache";
const PRESET_KEY = "amehnities.koboHub.presets";

export interface HubConnection {
  id: string;
  name: string;
  serverUrl: string;
  formUid: string;
  apiToken: string;
  autoRefreshSeconds: number;
  createdAt: string;
}

export interface HubCache {
  fetchedAt: string;
  formTitle: string;
  count: number;
  results: any[];
  schema: HubSchema;
}

const read = <T,>(k: string): T | null => {
  try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
};

export const newId = () => `kh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function listConnections(): HubConnection[] {
  return read<HubConnection[]>(REGISTRY_KEY) ?? [];
}
export function saveConnection(c: HubConnection) {
  const all = listConnections();
  const i = all.findIndex((x) => x.id === c.id);
  if (i >= 0) all[i] = c; else all.push(c);
  write(REGISTRY_KEY, all);
  if (!getActiveId()) setActiveId(c.id);
}
export function deleteConnection(id: string) {
  write(REGISTRY_KEY, listConnections().filter((c) => c.id !== id));
  try { localStorage.removeItem(`${CACHE_KEY}:${id}`); } catch { /* ignore */ }
  if (getActiveId() === id) {
    const next = listConnections()[0]?.id;
    try { next ? localStorage.setItem(ACTIVE_KEY, next) : localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  }
}
export function getActiveId(): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY);
    const all = listConnections();
    if (stored && all.some((c) => c.id === stored)) return stored;
    return all[0]?.id ?? null;
  } catch { return null; }
}
export function setActiveId(id: string) { try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ } }

export function loadCache(id: string): HubCache | null { return read<HubCache>(`${CACHE_KEY}:${id}`); }
export function saveCache(id: string, cache: HubCache) { write(`${CACHE_KEY}:${id}`, cache); }

/* ------------------------------------------------------------- presets --- */

export interface HubPreset { id: string; name: string; connectionId: string; filters: unknown }

export function listPresets(connectionId: string): HubPreset[] {
  return (read<HubPreset[]>(PRESET_KEY) ?? []).filter((p) => p.connectionId === connectionId);
}
export function savePreset(p: HubPreset) {
  const all = read<HubPreset[]>(PRESET_KEY) ?? [];
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p; else all.push(p);
  write(PRESET_KEY, all);
}
export function deletePreset(id: string) {
  write(PRESET_KEY, (read<HubPreset[]>(PRESET_KEY) ?? []).filter((p) => p.id !== id));
}

/* ---------------------------------------------------------------- sync --- */

const PAGE_SIZE = 500;
const HARD_CAP = 50_000;

async function callManager(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", { body });
  if (error) {
    let detail = error.message;
    try { detail = await (error as any).context?.text?.() ?? detail; } catch { /* ignore */ }
    throw new Error(detail || "KoboToolbox request failed");
  }
  if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
  return data as any;
}

export async function testConnection(c: Pick<HubConnection, "serverUrl" | "formUid" | "apiToken">) {
  return callManager({
    action: "test_connection", server_url: c.serverUrl, form_uid: c.formUid, api_token: c.apiToken,
  });
}

export type SyncStage = "schema" | "normalizing" | "widgets" | "ready";

export async function syncConnection(
  conn: HubConnection,
  onStage?: (stage: SyncStage, detail?: string) => void,
): Promise<HubCache> {
  onStage?.("schema", "Reading form definition from KoboToolbox…");

  const first = await callManager({
    action: "fetch_submissions",
    server_url: conn.serverUrl,
    form_uid: conn.formUid,
    api_token: conn.apiToken,
    page_size: PAGE_SIZE,
    page: 0,
  });

  const total = Number(first?.count) || (first?.results?.length ?? 0);
  const results: any[] = [...(first?.results ?? [])];
  let page = 1;
  let lastLen = results.length;
  while (lastLen === PAGE_SIZE && results.length < total && results.length < HARD_CAP) {
    const next = await callManager({
      action: "fetch_submissions",
      server_url: conn.serverUrl,
      form_uid: conn.formUid,
      api_token: conn.apiToken,
      page_size: PAGE_SIZE,
      page,
    });
    const chunk = Array.isArray(next?.results) ? next.results : [];
    if (!chunk.length) break;
    results.push(...chunk);
    lastLen = chunk.length;
    page++;
  }

  results.sort((a, b) =>
    new Date(b?._submission_time ?? 0).getTime() - new Date(a?._submission_time ?? 0).getTime());

  onStage?.("normalizing", "Normalizing repeat groups & choice labels…");
  const survey: any[] = Array.isArray(first?.survey) ? first.survey : [];
  const choices: any[] = Array.isArray(first?.choices) ? first.choices : [];
  const title = first?.form_title || conn.name || conn.formUid;
  const schema = survey.length
    ? inferSchema(survey, choices, title)
    : inferSchemaFromRows(results, title);

  onStage?.("widgets", "Building dashboard widgets…");
  const cache: HubCache = {
    fetchedAt: new Date().toISOString(),
    formTitle: title,
    count: results.length,
    results,
    schema,
  };
  saveCache(conn.id, cache);
  onStage?.("ready", `${results.length} submissions synced.`);
  return cache;
}
