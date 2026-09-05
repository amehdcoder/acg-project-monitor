import { useCallback, useMemo } from "react";
import useRealtimeTables, { type RealtimeTableSpec } from "@/hooks/useRealtimeTables";

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
 * Runs on the shared realtime engine (`useRealtimeTables`) so it inherits the
 * leading-edge refresh, burst coalescing, focus/online catch-up and fallback
 * polling used by the Integrated Supervisory Dashboard.
 */
export function useRealtimeMicroplanEntries(
  projectId: string | null | undefined,
  onChange: () => void,
  userId?: string | null,
) {
  const accept = useCallback(
    (payload: any) => {
      if (!userId) return true;
      const sub = payload?.new?.submitted_by ?? payload?.old?.submitted_by ?? null;
      return !sub || sub === userId;
    },
    [userId],
  );

  const specs = useMemo<RealtimeTableSpec[]>(
    () =>
      projectId
        ? [
            { table: "microplan_entries", filter: `project_id=eq.${projectId}`, accept },
            {
              table: "kobo_sync_events",
              event: "INSERT",
              filter: `project_id=eq.${projectId}`,
              accept: (p: any) => p?.new?.status === "microplan_sync" || p?.new?.status === "success",
            },
          ]
        : [],
    [projectId, accept],
  );

  return useRealtimeTables(specs, onChange, {
    enabled: Boolean(projectId),
    name: `microplan-${projectId ?? "none"}`,
  });
}

export default useRealtimeMicroplanEntries;
