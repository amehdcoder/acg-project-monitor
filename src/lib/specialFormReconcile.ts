// Background reconciliation for standalone special-form mirrors (Bloomberg /
// SeeClear). A mirror entry can be left displaying "queued" (offline === true)
// even after its row has actually landed on the server — for example when an
// older app version drained the offline queue without flipping the mirror, or
// when the row was inserted on another device/session. This engine periodically
// checks the server for those rows and reconciles the local mirror so the
// "View Sent Forms" list never shows a stale "queued" badge for more than a
// minute once the device is online.

import { supabase } from "@/integrations/supabase/client";
import { listAllSavedEntries, setSavedEntryStatus } from "@/lib/savedForms";
import { flushSubmissionQueue } from "@/lib/offlineSubmissions";
import {
  BLOOMBERG_FORM_ID,
  SEECLEAR_FORM_ID,
} from "@/lib/specialFormBridge";

// Map a mirror entry's synthetic form id to its authoritative server table.
const TABLE_BY_FORM: Record<string, string> = {
  [BLOOMBERG_FORM_ID]: "bloomberg_validations",
  [SEECLEAR_FORM_ID]: "seeclear_monitoring",
};

let running = false;
let bound = false;

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/**
 * Reconcile every locally "queued" special-form mirror against the server.
 * Any mirror whose submissionId already exists server-side is flipped to a
 * confirmed "sent" state. Best-effort and safe to call repeatedly.
 */
export async function reconcileQueuedSpecialForms(): Promise<{ reconciled: number }> {
  if (running || !isOnline()) return { reconciled: 0 };
  running = true;
  let reconciled = 0;
  try {
    // First make sure anything still pending is pushed up.
    await flushSubmissionQueue().catch(() => {});

    const sent = await listAllSavedEntries("sent");
    const queued = sent.filter((e) => e.offline === true && e.submissionId);
    if (queued.length === 0) return { reconciled: 0 };

    // Group the queued submissionIds by their target table.
    const byTable = new Map<string, Map<string, string>>(); // table -> (submissionId -> mirrorEntryId)
    for (const e of queued) {
      const table = TABLE_BY_FORM[e.formId] || (e.submissionType && TABLE_BY_FORM[e.submissionType]);
      if (!table || !e.submissionId) continue;
      if (!byTable.has(table)) byTable.set(table, new Map());
      byTable.get(table)!.set(e.submissionId, e.id);
    }

    for (const [table, idMap] of byTable) {
      const ids = Array.from(idMap.keys());
      // Chunk to keep the IN() list small.
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        try {
          const { data, error } = await supabase
            .from(table as any)
            .select("id")
            .in("id", chunk);
          if (error) continue;
          for (const row of (data as any[]) || []) {
            const mirrorId = idMap.get(row.id);
            if (!mirrorId) continue;
            await setSavedEntryStatus(mirrorId, "sent", {
              offline: false,
              sentAt: new Date().toISOString(),
            });
            reconciled++;
          }
        } catch {
          // ignore — best-effort
        }
      }
    }
    return { reconciled };
  } finally {
    running = false;
  }
}

export function initSpecialFormReconcile() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const run = () => void reconcileQueuedSpecialForms();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  // Run shortly after boot, then on a steady cadence (< 1 min) so stuck mirrors
  // self-heal without any user action.
  setTimeout(run, 4000);
  window.setInterval(run, 30000);
}
