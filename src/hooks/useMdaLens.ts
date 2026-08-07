/**
 * Reads the signed-in user's MDA Lens grant (scoped access to Geo Microplanning
 * and the Integrated Supervisory Checklist). Admins/owners are unrestricted and
 * always resolve to `null` lens (= no restriction).
 *
 * Cache strategy (no stale UI, no flicker):
 *  • memory + localStorage cache, versioned and time-stamped;
 *  • cached grants are shown instantly, then revalidated in the background;
 *  • a cache older than STALE_MS is treated as unverified (still shown, but the
 *    revalidation result wins as soon as it lands);
 *  • revocations arrive over realtime and via a cross-tab BroadcastChannel, and
 *    both invalidate the cache immediately in every open tab;
 *  • window focus / regained connectivity trigger a revalidation;
 *  • transient failures never revoke — only a successful empty read does.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withTimeout } from "@/lib/withTimeout";
import type { MdaLensGrant } from "@/lib/mdaLens/config";
import { MICROPLAN_TAB_IDS, SUPERVISORY_TAB_IDS } from "@/lib/mdaLens/config";
import { logLensEvent, type LensGrantState } from "@/lib/mdaLens/telemetry";

export interface MdaLensState {
  /** The user's lens, or null when they have none (or are unrestricted admin). */
  lens: MdaLensGrant | null;
  /** True when the lens is the reason this user can reach the MDA pages. */
  lensEnabled: boolean;
  loadingLens: boolean;
  /** How the current grant value was obtained. */
  grantState: LensGrantState;
  canOpenMicroplanTab: (tab: string) => boolean;
  canOpenSupervisoryTab: (tab: string) => boolean;
  refetchLens: () => void;
}

/**
 * Dev-only injection points used by the `/__test/mda-lens` E2E harness so the
 * real gating components can be driven with a deterministic grant — either
 * synchronously (`__MDA_LENS_TEST__`) or through an async loader that can be
 * made slow or made to fail (`__MDA_LENS_TEST_LOADER__`). Never consulted in a
 * production build.
 */
const testLens = (): MdaLensGrant | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  return (window as unknown as { __MDA_LENS_TEST__?: MdaLensGrant }).__MDA_LENS_TEST__ ?? null;
};

type TestLoader = () => Promise<MdaLensGrant | null>;
const testLoader = (): TestLoader | null => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  return (window as unknown as { __MDA_LENS_TEST_LOADER__?: TestLoader }).__MDA_LENS_TEST_LOADER__ ?? null;
};

const CACHE_VERSION = "v2";
const CACHE_PREFIX = `amehnities:mda-lens:${CACHE_VERSION}:`;
/** After this age a cached grant is still rendered but flagged as unverified. */
const STALE_MS = 5 * 60 * 1000;

interface CacheEntry { lens: MdaLensGrant | null; at: number }

const memoryCache = new Map<string, CacheEntry>();
const inFlightLoads = new Map<string, Promise<MdaLensGrant | null>>();
const subscribers = new Set<(userId: string | null) => void>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("amehnities:mda-lens") : null;

function readCache(userId: string): CacheEntry | null {
  const mem = memoryCache.get(userId);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.at !== "number") return null;
    memoryCache.set(userId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userId: string, lens: MdaLensGrant | null) {
  const entry: CacheEntry = { lens, at: Date.now() };
  memoryCache.set(userId, entry);
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    if (lens) localStorage.setItem(key, JSON.stringify(entry));
    else localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable; the in-memory cache still prevents flicker */
  }
}

/**
 * Drop the cached grant for a user (or every user) and tell all hooks — in this
 * tab and in other tabs — to revalidate right away. Called on revocation,
 * sign-out and whenever an admin edits a grant.
 */
export function invalidateMdaLensCache(userId?: string, opts: { broadcast?: boolean } = {}) {
  const { broadcast = true } = opts;
  if (userId) {
    memoryCache.delete(userId);
    try { localStorage.removeItem(`${CACHE_PREFIX}${userId}`); } catch { /* ignore */ }
  } else {
    memoryCache.clear();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
  logLensEvent({ event_type: "cache_invalidated", detail: { scope: userId ? "user" : "all", broadcast } });
  subscribers.forEach((fn) => fn(userId ?? null));
  if (broadcast) channel?.postMessage({ type: "invalidate", userId: userId ?? null });
}

channel?.addEventListener("message", (event) => {
  const data = event.data as { type?: string; userId?: string | null } | null;
  if (data?.type === "invalidate") invalidateMdaLensCache(data.userId ?? undefined, { broadcast: false });
});

async function fetchLens(userId: string): Promise<MdaLensGrant | null> {
  const existing = inFlightLoads.get(userId);
  if (existing) return existing;

  const request = (async () => {
    const response = await withTimeout(
      supabase
        .from("mda_lens_grants")
        .select("user_id, enabled, microplan_tabs, supervisory_tabs, states, lgas, wards, project_ids, campaign_types, can_export")
        .eq("user_id", userId)
        .maybeSingle(),
      10000,
      "mda_lens_timeout",
    );
    if (response.error) throw response.error;
    return response.data
      ? ({ wards: [], project_ids: [], campaign_types: [], ...response.data } as MdaLensGrant)
      : null;
  })().finally(() => inFlightLoads.delete(userId));

  inFlightLoads.set(userId, request);
  return request;
}

export function useMdaLens(): MdaLensState {
  const { user, session, isOwner, isCoOwner, isAdmin, loading: authLoading } = useAuth();
  const injected = testLens();
  const loader = testLoader();
  const harness = !!injected || !!loader;
  const unrestricted = harness ? false : !!isOwner || !!isCoOwner || !!isAdmin;
  const [lens, setLens] = useState<MdaLensGrant | null>(() => (user?.id ? readCache(user.id)?.lens ?? null : null));
  const [loading, setLoading] = useState(true);
  const [grantState, setGrantState] = useState<LensGrantState>("loading");
  const requestGeneration = useRef(0);
  const everGranted = useRef(false);

  const load = useCallback(async () => {
    if (injected) { setLens(injected); setGrantState("verified"); setLoading(false); return; }
    if (loader) {
      const generation = ++requestGeneration.current;
      const started = Date.now();
      setLoading(true);
      setGrantState("loading");
      try {
        const next = await loader();
        if (generation !== requestGeneration.current) return;
        setLens(next);
        setGrantState("verified");
        logLensEvent({ event_type: "lens_resolved", grant_state: "verified", latency_ms: Date.now() - started });
      } catch (error) {
        if (generation !== requestGeneration.current) return;
        setGrantState("failed");
        logLensEvent({
          event_type: "lens_fetch_failed",
          grant_state: "failed",
          latency_ms: Date.now() - started,
          detail: { message: String((error as Error)?.message ?? error) },
        });
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
      return;
    }
    if (authLoading) return;
    if (!user) { setLens(null); setGrantState("none"); setLoading(false); return; }

    const userId = user.id;
    const generation = ++requestGeneration.current;
    const started = Date.now();
    const cached = readCache(userId);
    if (cached) {
      setLens(cached.lens);
      setGrantState(Date.now() - cached.at > STALE_MS ? "cached" : "cached");
    }
    // Offline-auth hydration intentionally has a user/profile but no live
    // backend session. Querying in that state runs as anonymous; RLS correctly
    // returns no row, but treating that empty result as a revocation made the
    // two Lens pages disappear seconds after they first rendered.
    if (!session) {
      setLoading(false);
      if (!cached) setGrantState("none");
      return;
    }
    setLoading(!cached);

    try {
      const nextLens = await fetchLens(userId);
      if (generation !== requestGeneration.current) return;
      writeCache(userId, nextLens);
      setLens(nextLens);
      setGrantState("verified");
      logLensEvent({
        event_type: "lens_resolved",
        grant_state: "verified",
        access_granted: !!nextLens?.enabled,
        latency_ms: Date.now() - started,
        detail: { from_cache: !!cached, states: nextLens?.states?.length ?? 0, lgas: nextLens?.lgas?.length ?? 0 },
      });
    } catch (error) {
      // A timeout, token-refresh race, or temporary RLS/network failure is not a
      // revocation. Keep the last verified grant so navigation cannot disappear
      // during connectivity/auth churn. A successful empty read still clears it.
      setGrantState(cached ? "cached" : "failed");
      logLensEvent({
        event_type: "lens_fetch_failed",
        grant_state: cached ? "cached" : "failed",
        latency_ms: Date.now() - started,
        detail: { retained_cached_grant: !!cached, message: String((error as Error)?.message ?? error) },
      });
      console.warn("MDA Lens refresh failed; retaining last verified grant", error);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [user, session, authLoading, injected, loader]);

  useEffect(() => { void load(); }, [load]);

  // Cache invalidation from anywhere (admin edit, revocation, other tab).
  useEffect(() => {
    const onInvalidate = (targetUserId: string | null) => {
      if (targetUserId && user?.id && targetUserId !== user.id) return;
      void load();
    };
    subscribers.add(onInvalidate);
    return () => { subscribers.delete(onInvalidate); };
  }, [load, user?.id]);

  // Revalidate when the tab regains focus or connectivity returns.
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("online", revalidate);
    };
  }, [load]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!user || (!session && !harness)) return;
    const ch = supabase.channel(`mda-lens-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "mda_lens_grants", filter: `user_id=eq.${user.id}` },
      (payload) => {
        const eventType = (payload as unknown as { eventType?: string }).eventType;
        if (eventType === "DELETE") {
          invalidateMdaLensCache(user.id);
          setLens(null);
          setGrantState("verified");
          setLoading(false);
          return;
        }
        invalidateMdaLensCache(user.id);
      },
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, session, harness]);

  const active = !unrestricted && !!lens?.enabled;

  // Flicker / fail-closed detection: access that was granted and is then taken
  // away inside the same session is exactly the symptom users reported.
  useEffect(() => {
    if (loading) return;
    if (active) { everGranted.current = true; return; }
    if (everGranted.current) {
      everGranted.current = false;
      logLensEvent({
        event_type: "lens_flicker",
        access_granted: false,
        grant_state: grantState,
        detail: { reason: unrestricted ? "became_admin" : "grant_absent_after_grant" },
      });
    } else if (grantState === "failed" && !unrestricted) {
      logLensEvent({ event_type: "lens_fail_closed", access_granted: false, grant_state: "failed" });
    }
  }, [active, loading, grantState, unrestricted]);

  const canOpenMicroplanTab = useCallback(
    (tab: string) => {
      if (!active) return true;
      const allowed = lens?.microplan_tabs?.length ? lens.microplan_tabs : MICROPLAN_TAB_IDS;
      return allowed.includes(tab);
    },
    [active, lens],
  );

  const canOpenSupervisoryTab = useCallback(
    (tab: string) => {
      if (!active) return true;
      const allowed = lens?.supervisory_tabs?.length ? lens.supervisory_tabs : SUPERVISORY_TAB_IDS;
      return allowed.includes(tab);
    },
    [active, lens],
  );

  return {
    lens: active ? lens : null,
    lensEnabled: active,
    loadingLens: loading,
    grantState,
    canOpenMicroplanTab,
    canOpenSupervisoryTab,
    refetchLens: load,
  };
}

export default useMdaLens;
