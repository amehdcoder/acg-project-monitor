import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to `microplan_reconciliation` changes for a project so medicine
 * balances, returned-supply counts, and discrepancy tables refresh live as
 * KoboToolbox reconciliation submissions arrive.
 */
export function useRealtimeReconciliationEntries(
  projectId: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`microplan_reconciliation_${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "microplan_reconciliation",
          filter: `project_id=eq.${projectId}`,
        },
        () => onChange(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "kobo_sync_events",
          filter: `project_id=eq.${projectId}`,
        },
        (payload: { new?: { status?: string } }) => {
          if (payload?.new?.status === "reconciliation_sync") onChange();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onChange]);
}

export default useRealtimeReconciliationEntries;
