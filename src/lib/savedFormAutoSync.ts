import { supabase } from "@/integrations/supabase/client";
import { listAllSavedEntries, setSavedEntryStatus, type SavedFormEntry } from "@/lib/savedForms";
import { isSpecialBridgeEntry, syncSpecialSavedForm } from "@/lib/specialFormBridge";
import { recordMetric, startTimer } from "@/lib/metrics";

let started = false;
let syncing = false;

// Per-entry in-flight guard. Overlapping triggers (online event + interval +
// visibilitychange firing near-simultaneously) must never process the same
// entry twice, which is the classic source of duplicate submissions.
const inFlight = new Set<string>();

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);
const withTimeout = <T,>(p: Promise<T>, ms = 15000): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("saved_form_sync_timeout")), ms)),
  ]);

// Deterministic, stable submission id for an entry. The same saved entry always
// maps to the SAME server row id, so a retry after a lost network ack upserts
// the identical row instead of creating a duplicate — guaranteeing the entry
// lands on the server exactly once and only ever moves Ready -> Sent once.
export function submissionIdForEntry(entry: SavedFormEntry): string {
  return entry.submissionId || entry.id;
}

export async function syncSavedFormEntry(entry: SavedFormEntry): Promise<boolean> {
  const special = isSpecialBridgeEntry(entry) ? await syncSpecialSavedForm(entry) : null;
  if (special?.success) return true;

  const submissionId = submissionIdForEntry(entry);
  const sentAt = new Date().toISOString();
  const row = {
    id: submissionId,
    form_id: entry.formId,
    user_id: entry.userId,
    data: entry.submissionData || entry.responses || {},
    location: entry.submissionLocation || null,
    within_geofence: entry.withinGeofence ?? null,
    submission_type: entry.submissionType || "regular",
    status: "sent",
    submitted_at: entry.finalizedAt || entry.updatedAt || sentAt,
    synced_at: sentAt,
  };
  // Idempotent write: upsert keyed on the deterministic id. If a previous
  // attempt actually reached the server but the client never saw the ack, this
  // overwrites the same row rather than inserting a second copy.
  const { error } = await supabase
    .from("form_submissions")
    .upsert(row as any, { onConflict: "id" });
  if (error) throw error;
  await setSavedEntryStatus(entry.id, "sent", {
    submissionId,
    sentAt,
    offline: false,
    displayName: entry.displayName || null,
  });
  return true;
}


export async function syncFinalizedSavedForms(): Promise<{ synced: number; failed: number }> {
  if (syncing || !isOnline()) return { synced: 0, failed: 0 };
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
  const userId = data?.session?.user?.id;
  if (!userId) return { synced: 0, failed: 0 };

  syncing = true;
  const stop = startTimer("saved_form_sync_batch");
  let synced = 0;
  let failed = 0;
  try {
    const entries = (await listAllSavedEntries("finalized")).filter((e) => e.userId === userId);
    for (const entry of entries) {
      if (!isOnline()) break;
      // Skip entries already being processed by an overlapping trigger so the
      // same "Ready to send" item can never be sent twice.
      if (inFlight.has(entry.id)) continue;
      inFlight.add(entry.id);
      try {
        if (await withTimeout(syncSavedFormEntry(entry))) synced++;
      } catch {
        failed++;
      } finally {
        inFlight.delete(entry.id);
      }
    }
  } finally {
    syncing = false;
    stop(failed === 0, { synced, failed });
  }
  if (synced > 0 || failed > 0) {
    recordMetric("saved_form_sync_result", 0, failed === 0, { synced, failed });
  }
  return { synced, failed };
}

export function initSavedFormAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void syncFinalizedSavedForms());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncFinalizedSavedForms();
  });
  window.setInterval(() => void syncFinalizedSavedForms(), 20000);
  void syncFinalizedSavedForms();
}