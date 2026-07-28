import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to `microplan_entries` changes for a project and invoke a
 * refresh callback (typically wired to `fetchEntries` or a TanStack
 * `queryClient.invalidateQueries` call) whenever a row lands, changes,
 * or is deleted upstream — including submissions ingested through the
 * Kobo webhook.
 *
 * Channels are torn down on unmount to avoid subscription leaks.
 */
export function useRealtimeMicroplanEntries(
  projectId: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`microplan_entries_${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "microplan_entries",
          filter: `project_id=eq.${projectId}`,
        },
        () => onChange(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onChange]);
}

export default useRealtimeMicroplanEntries;
