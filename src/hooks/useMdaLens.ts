/**
 * Reads the signed-in user's MDA Lens grant (scoped access to Geo Microplanning
 * and the Integrated Supervisory Checklist). Admins/owners are unrestricted and
 * always resolve to `null` lens (= no restriction).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withTimeout } from "@/lib/withTimeout";
import type { MdaLensGrant } from "@/lib/mdaLens/config";
import { MICROPLAN_TAB_IDS, SUPERVISORY_TAB_IDS } from "@/lib/mdaLens/config";

export interface MdaLensState {
  /** The user's lens, or null when they have none (or are unrestricted admin). */
  lens: MdaLensGrant | null;
  /** True when the lens is the reason this user can reach the MDA pages. */
  lensEnabled: boolean;
  loadingLens: boolean;
  canOpenMicroplanTab: (tab: string) => boolean;
  canOpenSupervisoryTab: (tab: string) => boolean;
  refetchLens: () => void;
}

/**
 * Dev-only injection point used by the `/__test/mda-lens` E2E harness so the
 * real gating components can be driven with a deterministic grant. Never
 * consulted in a production build.
 */
const testLens = (): MdaLensGrant | null => {
  if (!import.meta.env.DEV) return null;
  return (window as unknown as { __MDA_LENS_TEST__?: MdaLensGrant }).__MDA_LENS_TEST__ ?? null;
};

const CACHE_PREFIX = "amehnities:mda-lens:";
const memoryCache = new Map<string, MdaLensGrant | null>();
const inFlightLoads = new Map<string, Promise<MdaLensGrant | null>>();

function readCachedLens(userId: string): MdaLensGrant | null {
  if (memoryCache.has(userId)) return memoryCache.get(userId) ?? null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    const cached = raw ? JSON.parse(raw) as MdaLensGrant : null;
    memoryCache.set(userId, cached);
    return cached;
  } catch {
    return null;
  }
}

function writeCachedLens(userId: string, lens: MdaLensGrant | null) {
  memoryCache.set(userId, lens);
  try {
    const key = `${CACHE_PREFIX}${userId}`;
    if (lens) localStorage.setItem(key, JSON.stringify(lens));
    else localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable; the in-memory cache still prevents flicker */
  }
}

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
  const unrestricted = injected ? false : !!isOwner || !!isCoOwner || !!isAdmin;
  const [lens, setLens] = useState<MdaLensGrant | null>(() => user?.id ? readCachedLens(user.id) : null);
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(0);


  const load = useCallback(async () => {
    if (injected) { setLens(injected); setLoading(false); return; }
    if (authLoading) return;
    if (!user) { setLens(null); setLoading(false); return; }
    const userId = user.id;
    const generation = ++requestGeneration.current;
    const cached = readCachedLens(userId);
    if (cached) setLens(cached);
    // Offline-auth hydration intentionally has a user/profile but no live
    // backend session. Querying in that state runs as anonymous; RLS correctly
    // returns no row, but treating that empty result as a revocation made the
    // two Lens pages disappear seconds after they first rendered.
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(!cached);

    try {
      const nextLens = await fetchLens(userId);
      if (generation !== requestGeneration.current) return;
      writeCachedLens(userId, nextLens);
      setLens(nextLens);
    } catch (error) {
      // A timeout, token-refresh race, or temporary RLS/network failure is not a
      // revocation. Keep the last verified grant so navigation cannot disappear
      // during connectivity/auth churn. A successful empty read still clears it.
      console.warn("MDA Lens refresh failed; retaining last verified grant", error);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [user, session, authLoading, injected]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!user || (!session && !injected)) return;
    const ch = supabase.channel(`mda-lens-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "mda_lens_grants", filter: `user_id=eq.${user.id}` },
      (payload) => {
        const eventType = (payload as unknown as { eventType?: string }).eventType;
        if (eventType === "DELETE") {
          writeCachedLens(user.id, null);
          setLens(null);
          setLoading(false);
          return;
        }
        void load();
      },
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, session, injected, load]);

  const active = !unrestricted && !!lens?.enabled;

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
    canOpenMicroplanTab,
    canOpenSupervisoryTab,
    refetchLens: load,
  };
}

export default useMdaLens;
