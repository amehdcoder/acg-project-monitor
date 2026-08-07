/**
 * Reads the signed-in user's MDA Lens grant (scoped access to Geo Microplanning
 * and the Integrated Supervisory Checklist). Admins/owners are unrestricted and
 * always resolve to `null` lens (= no restriction).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withTimeoutFallback } from "@/lib/withTimeout";
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

export function useMdaLens(): MdaLensState {
  const { user, isOwner, isCoOwner, isAdmin, loading: authLoading } = useAuth();
  const injected = testLens();
  const unrestricted = injected ? false : !!isOwner || !!isCoOwner || !!isAdmin;
  const [lens, setLens] = useState<MdaLensGrant | null>(null);
  const [loading, setLoading] = useState(true);


  const load = useCallback(async () => {
    if (injected) { setLens(injected); setLoading(false); return; }
    if (authLoading) return;
    if (!user) { setLens(null); setLoading(false); return; }

    const { data } = await withTimeoutFallback(
      (async () =>
        await supabase
          .from("mda_lens_grants")
          .select("user_id, enabled, microplan_tabs, supervisory_tabs, states, lgas, wards, project_ids, campaign_types, can_export")
          .eq("user_id", user.id)
          .maybeSingle())(),
      8000,
      { data: null } as any,
    );
    setLens(data ? ({ wards: [], project_ids: [], campaign_types: [], ...data } as MdaLensGrant) : null);
    setLoading(false);
  }, [user, authLoading, injected]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`mda-lens-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "mda_lens_grants", filter: `user_id=eq.${user.id}` },
      () => void load(),
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

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
