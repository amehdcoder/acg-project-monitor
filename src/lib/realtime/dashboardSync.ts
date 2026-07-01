/**
 * dashboardSync — single source of truth for keeping every linked form dashboard
 * live with the underlying `form_submissions` data.
 *
 * When an Admin/Owner edits and saves a submission, the change lands as an
 * `UPDATE` on `public.form_submissions`. Every dashboard that renders data for
 * that form must reflect the new value *immediately* — not on the next manual
 * refresh. Centralising the subscription here means:
 *   1. Each dashboard subscribes the same way (INSERT / UPDATE / DELETE), so an
 *      edit propagates to all of them.
 *   2. The behaviour is unit-testable (see dashboardSync.test.ts) — the
 *      automated check drives a fake channel and asserts a saved change fires
 *      the reload callback for admins/owners.
 *
 * Bursts are debounced so very high submission volumes never thrash the UI.
 */
import { supabase } from "@/integrations/supabase/client";

export type SubmissionChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  formId?: string | null;
};

export interface SubscribeOptions {
  /** Restrict to a single form; omit to listen to every form's submissions. */
  formId?: string | null;
  /** Called (debounced) whenever a relevant submission change arrives. */
  onChange: (change: SubmissionChange) => void;
  /** Debounce window in ms to coalesce bursts. Default 800ms. */
  debounceMs?: number;
  /** Optional channel-name suffix to keep multiple mounts isolated. */
  channelSuffix?: string;
}

/**
 * Subscribe to `form_submissions` changes for a form (or all forms) and invoke
 * `onChange` after a short debounce. Returns an unsubscribe function.
 */
export function subscribeToFormSubmissionChanges({
  formId,
  onChange,
  debounceMs = 800,
  channelSuffix,
}: SubscribeOptions): () => void {
  const filter = formId ? `form_id=eq.${formId}` : undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (change: SubmissionChange) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(change), debounceMs);
  };

  const channelName = `dashboard-sync-${formId ?? "all"}-${channelSuffix ?? "default"}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "form_submissions", ...(filter ? { filter } : {}) },
      (payload: { eventType?: string; new?: { form_id?: string }; old?: { form_id?: string } }) => {
        fire({
          eventType: (payload.eventType as SubmissionChange["eventType"]) ?? "UPDATE",
          formId: payload.new?.form_id ?? payload.old?.form_id ?? formId ?? null,
        });
      },
    )
    .subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
