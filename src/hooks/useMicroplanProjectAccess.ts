import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { MICROPLAN_ACCESS_CHANGED, type MicroplanProjectAccess } from "@/lib/microplanning/projectRoles";

/** Cached grants are an offline display snapshot, never server authorization. */
export function useMicroplanProjectAccess() {
  const { user, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<{ userId: string; projects: MicroplanProjectAccess[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const refetch = useCallback(async () => {
    if (authLoading) return;
    const id = ++request.current;
    if (!user) { setSnapshot(null); setLoading(false); return; }
    const result = await cachedRead<MicroplanProjectAccess[]>("microplan-project-access:v1", async () => {
      const { data, error } = await supabase.rpc("get_my_microplan_project_access");
      return { data: data as MicroplanProjectAccess[] | null, error };
    }, 8_000, user.id);
    if (request.current !== id) return;
    setSnapshot({ userId: user.id, projects: result.data ?? [] });
    setLoading(false);
  }, [user?.id, authLoading]);

  useEffect(() => {
    setLoading(true);
    void refetch();
    const refresh = () => { if (document.visibilityState === "visible") void refetch(); };
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(MICROPLAN_ACCESS_CHANGED, refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => { if (navigator.onLine) refresh(); }, 30_000);
    return () => {
      request.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MICROPLAN_ACCESS_CHANGED, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refetch]);

  return { projects: snapshot?.userId === user?.id ? snapshot?.projects ?? [] : [], loading, refetch };
}