/**
 * Owner-granted page access with time windows.
 *
 * Combines:
 *   - admin_page_access  (existing per-super-admin grants)
 *   - user_page_access   (NEW — owner can grant to ANY user with timeframe)
 *
 * Owner bypass always wins. Expiry is enforced client-side too so the UI
 * updates without waiting for the nightly cron.
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Grant {
  page_id: string;
  starts_at: string | null;
  expires_at: string | null;
}

function isActive(g: Grant, now = Date.now()): boolean {
  if (g.starts_at && new Date(g.starts_at).getTime() > now) return false;
  if (g.expires_at && new Date(g.expires_at).getTime() <= now) return false;
  return true;
}

export function useUserAccess() {
  const { user, isOwner } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setGrants([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_page_access")
      .select("page_id, starts_at, expires_at")
      .eq("user_id", user.id);
    setGrants((data ?? []) as Grant[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    // Unique channel name per mount avoids "cannot add `postgres_changes` callbacks
    // after `subscribe()`" when Supabase's internal channel registry returns an
    // already-subscribed instance (StrictMode double-mount, HMR, fast re-renders).
    const channelName = `user-access-${user.id}-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "user_page_access", filter: `user_id=eq.${user.id}` },
      () => load(),
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  // Re-check expirations every minute so UI hides items the moment they expire.
  useEffect(() => {
    const t = setInterval(() => setGrants((g) => [...g]), 60_000);
    return () => clearInterval(t);
  }, []);

  const canAccessUserPage = useCallback(
    (pageId: string): boolean => {
      if (isOwner) return true;
      return grants.some((g) => g.page_id === pageId && isActive(g));
    },
    [isOwner, grants],
  );

  return { grants, canAccessUserPage, loadingUserAccess: loading, refetchUserAccess: load };
}
