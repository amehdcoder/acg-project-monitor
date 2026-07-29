import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to `microplan_entries` changes for a project and invoke a
 * refresh callback whenever a row lands, changes, or is deleted upstream —
 * including submissions ingested through the Kobo webhook.
 *
 * Optional `userId` narrows the subscription to rows submitted by that user
 * (via the `submitted_by` column). This is what powers the Planning tab's
 * user-scoped live view: a field officer who submits communities from
 * KoboCollect sees them appear in their table instantly, without spilling
 * data from other users.
 *
 * Channels are torn down on unmount to avoid subscription leaks.
 */
export function useRealtimeMicroplanEntries(
  projectId: string | null | undefined,
  onChange: () => void,
  userId?: string | null,
) {
  useEffect(() => {
    if (!projectId) return;
    const filter = userId
      ? `project_id=eq.${projectId}`
      : `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(`microplan_entries_${projectId}_${userId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "microplan_entries", filter },
        (payload: { new?: { submitted_by?: string | null }; old?: { submitted_by?: string | null } }) => {
          if (userId) {
            const sub = payload.new?.submitted_by ?? payload.old?.submitted_by ?? null;
            if (sub && sub !== userId) return; // ignore other users' rows
          }
          onChange();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kobo_sync_events", filter: `project_id=eq.${projectId}` },
        (payload: { new?: { status?: string } }) => {
          if (payload?.new?.status === "microplan_sync" || payload?.new?.status === "success") onChange();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, userId, onChange]);
}

export default useRealtimeMicroplanEntries;
