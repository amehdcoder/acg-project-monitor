/**
 * Shared Checklist Dashboard feed (State-scoped).
 *
 * Administrators publish their KoboToolbox connection once; every user who has
 * been granted the `integrated-supervisory` page then loads the SAME live data
 * through the `checklist-feed` edge function, filtered server-side to the
 * State(s) their grant allows. The Kobo API token never reaches the browser.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { buildDataDictionary, flattenAll, validateDataDictionary } from "./koboSchema";
import { saveKoboCache, type KoboCache, type KoboConfig } from "./koboClient";
import { filterRowsToScope } from "@/lib/isc/stateScope";

export interface ChecklistFeed {
  id: string;
  name: string;
  form_uid: string;
  server_url: string;
  is_active?: boolean;
  updated_at?: string;
}

export interface FeedRegistry {
  feeds: ChecklistFeed[];
  scopeStates: string[];
  isAdmin: boolean;
}

/** localStorage key for a scoped feed cache so grantees also render offline. */
export const feedCacheKey = (feedId: string) => `feed:${feedId}`;

async function callFeed(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("checklist-feed", { body });
  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const parsed = JSON.parse(await error.context.text());
        detail = parsed?.error ?? detail;
      } catch { /* keep default */ }
    }
    throw new Error(detail || "Checklist feed request failed");
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function listChecklistFeeds(): Promise<FeedRegistry> {
  const d = await callFeed({ action: "list" });
  return {
    feeds: (d?.feeds ?? []) as ChecklistFeed[],
    scopeStates: (d?.scopeStates ?? []) as string[],
    isAdmin: !!d?.isAdmin,
  };
}

/** Admin: make the active Kobo connection available to every granted user. */
export async function publishChecklistFeed(name: string, cfg: KoboConfig): Promise<ChecklistFeed> {
  const d = await callFeed({
    action: "publish",
    name,
    form_uid: cfg.formUid,
    server_url: cfg.serverUrl,
    api_token: cfg.apiToken,
  });
  return d.feed as ChecklistFeed;
}

export async function unpublishChecklistFeed(id: string): Promise<void> {
  await callFeed({ action: "unpublish", id });
}

/** Admin: set the State scope for a user's Checklist Dashboard grant (audited). */
export async function setUserScopeStates(
  userId: string,
  scopeStates: string[],
  pageId = "integrated-supervisory",
): Promise<{ id: string; scope_states: string[] | null }> {
  const d = await callFeed({ action: "set_scope", user_id: userId, page_id: pageId, scope_states: scopeStates });
  return d.grant;
}

export interface FeedAuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  feed_name: string | null;
  form_uid: string | null;
  target_email: string | null;
  page_id: string | null;
  previous_scope_states: string[] | null;
  new_scope_states: string[] | null;
  created_at: string;
}

/** Admin: read the publish / unpublish / scope-change audit trail. */
export async function listFeedAudit(limit = 200): Promise<FeedAuditEntry[]> {
  const d = await callFeed({ action: "audit", limit });
  return (d?.entries ?? []) as FeedAuditEntry[];
}

export interface ScopedFetchResult {
  cache: KoboCache;
  feed: ChecklistFeed;
  scopeStates: string[];
  total: number;
}

/** Fetch live, State-scoped submissions and normalise them into a KoboCache. */
export async function fetchScopedSubmissions(feedId?: string | null): Promise<ScopedFetchResult> {
  const d = await callFeed({ action: "fetch", feed_id: feedId ?? undefined });

  const scopeStates = (d?.scope_states ?? []) as string[];
  const raw: any[] = Array.isArray(d?.results) ? d.results : [];
  // Defence-in-depth: the server already filtered, but every payload —
  // including realtime-triggered refetches and cached responses — is re-checked
  // against the caller's granted State(s) before it reaches the dashboard.
  const results = filterRowsToScope(raw, scopeStates);
  results.sort(
    (a, b) => new Date(b?._submission_time ?? 0).getTime() - new Date(a?._submission_time ?? 0).getTime(),
  );

  const survey = Array.isArray(d?.survey) ? d.survey : [];
  const flatResults = flattenAll(results, survey);
  const columns = buildDataDictionary(flatResults, survey);


  const cache: KoboCache = {
    fetchedAt: new Date().toISOString(),
    formTitle: d?.form_title ?? d?.feed?.name ?? null,
    count: results.length,
    results,
    flatResults,
    fields: [],
    columns,
    validation: validateDataDictionary(columns, []),
    survey,
    choices: Array.isArray(d?.choices) ? d.choices : [],
    formUid: d?.feed?.form_uid,
  };

  const feed = d.feed as ChecklistFeed;
  saveKoboCache(cache, feedCacheKey(feed.id));

  return {
    cache,
    feed,
    scopeStates: (d?.scope_states ?? []) as string[],
    total: Number(d?.total ?? results.length),
  };
}
