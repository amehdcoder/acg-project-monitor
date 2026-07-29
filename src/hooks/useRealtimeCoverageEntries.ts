import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to `microplan_coverage` changes for a project and re-fire the
 * supplied refresh callback on any insert/update/delete — including rows
 * ingested by the KoboToolbox webhook. Also listens to broadcast events on
 * `kobo_sync_events` so UI counters and progress badges can react as soon as
 * the webhook function emits a `COVERAGE_SYNC` marker.
 */
export function useRealtimeCoverageEntries(
  projectId: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`microplan_coverage_${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "microplan_coverage",
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
          if (payload?.new?.status === "coverage_sync") onChange();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onChange]);
}

export default useRealtimeCoverageEntries;
