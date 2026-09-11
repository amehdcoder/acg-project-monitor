// Outbound queue for account-free device collection.
//
// Finalized records saved by an enrolled device are pushed through the
// `project-collect` server function (the device has no database session).
//
// Guarantees, matching ODK/KoboCollect behaviour:
//   • one drainer at a time — a cross-tab mutex serialises every trigger
//     (reconnect, tab focus, timer) so a record is never uploaded twice;
//   • strict per-record transitions queued -> syncing -> synced | error;
//   • an immutable submission UUID per record, so a retry after a lost
//     acknowledgement is de-duplicated server-side instead of duplicated;
//   • exponential backoff with jitter on 5xx / network failures.

import {
  listAllSavedEntries,
  setSavedEntryStatus,
  markSyncState,
  isBackingOff,
  type SavedFormEntry,
} from "@/lib/savedForms";
import {
  readDeviceSession,
  sendDeviceRecords,
  deviceUserId,
  clearDeviceSession,
  type DeviceSyncRecord,
} from "@/lib/deviceSession";
import { withQueueLock, backoffDelay, isRetryable } from "@/lib/syncLock";

let started = false;
let backoffUntil = 0;
let batchAttempt = 0;

const BATCH_SIZE = 25;

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

const toRecord = (entry: SavedFormEntry): DeviceSyncRecord => ({
  id: entry.submissionId || entry.id,
  // Immutable idempotency key — identical across every retransmit.
  submissionUuid: entry.submissionId || entry.id,
  clientSubmittedAt: entry.finalizedAt || entry.createdAt || entry.updatedAt,
  // See Clear visits and cases are routed to their own intake server-side.
  kind:
    entry.settings?.kind === "seeclear"
      ? "seeclear"
      : entry.settings?.kind === "case"
        ? "case"
        : undefined,
  caseTypeId: entry.settings?.kind === "case" ? (entry.settings?.caseTypeId as string) : undefined,
  caseName: entry.settings?.kind === "case"
    ? ((entry.settings?.caseName as string) || entry.displayName || "Case")
    : undefined,
  photos: entry.settings?.kind === "seeclear"
    ? (entry.settings?.photos as Record<string, string> | undefined)
    : undefined,
  formId: entry.formId,
  data: (entry.submissionData || entry.responses || {}) as Record<string, unknown>,
  location: entry.submissionLocation ?? null,
  withinGeofence: entry.withinGeofence ?? null,
  submissionType: entry.submissionType || "regular",
  submittedAt: entry.finalizedAt || entry.updatedAt || new Date().toISOString(),
});

async function drain(): Promise<{ synced: number; failed: number }> {
  const session = readDeviceSession();
  if (!session || !isOnline() || Date.now() < backoffUntil) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const owner = deviceUserId(session.deviceId);
  const entries = (await listAllSavedEntries("finalized")).filter(
    (e) => e.userId === owner && e.syncState !== "syncing" && !isBackingOff(e),
  );
  if (entries.length === 0) return { synced: 0, failed: 0 };

  // Batches are sent sequentially: a device on a weak link should finish one
  // upload before starting the next, and ordering keeps the oldest data safest.
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (!isOnline()) break;
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((e) => markSyncState(e.id, "syncing")));
    try {
      const { accepted, rejected } = await sendDeviceRecords(session.token, batch.map(toRecord));
      batchAttempt = 0;
      const acceptedSet = new Set(accepted);
      const reasons = new Map(rejected.map((r) => [r.id, r.reason]));
      const sentAt = new Date().toISOString();
      for (const entry of batch) {
        const recordId = entry.submissionId || entry.id;
        if (acceptedSet.has(recordId)) {
          await setSavedEntryStatus(entry.id, "sent", {
            submissionId: recordId,
            sentAt,
            offline: false,
            displayName: entry.displayName || null,
          });
          await markSyncState(entry.id, "synced", {
            lastSyncError: null,
            nextAttemptAt: null,
          });
          synced++;
        } else {
          const attempts = (entry.syncAttempts ?? 0) + 1;
          await markSyncState(entry.id, "error", {
            syncAttempts: attempts,
            lastSyncError: reasons.get(recordId) ?? "not_accepted",
            nextAttemptAt: new Date(Date.now() + backoffDelay(attempts)).toISOString(),
          });
          failed++;
        }
      }
      if (rejected.length > 0) console.warn("device sync rejected", rejected);
    } catch (err: any) {
      failed += batch.length;
      if (err?.message === "device_not_authorized") {
        // Access was revoked or the code was rotated — stop and clear.
        clearDeviceSession();
        break;
      }
      const retryable = isRetryable(err);
      for (const entry of batch) {
        const attempts = (entry.syncAttempts ?? 0) + 1;
        await markSyncState(entry.id, "error", {
          syncAttempts: attempts,
          lastSyncError: String(err?.message || "sync_failed"),
          nextAttemptAt: retryable
            ? new Date(Date.now() + backoffDelay(attempts)).toISOString()
            : null,
        });
      }
      if (retryable) {
        // Full-jitter backoff keeps a fleet of devices from stampeding a
        // struggling server all at the same instant after an outage.
        batchAttempt += 1;
        backoffUntil = Date.now() + backoffDelay(batchAttempt, 5_000);
      }
      break;
    }
  }
  return { synced, failed };
}

export async function syncDeviceRecords(): Promise<{ synced: number; failed: number }> {
  const result = await withQueueLock("device_records", drain);
  return result ?? { synced: 0, failed: 0 };
}

export function initDeviceAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void syncDeviceRecords());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncDeviceRecords();
  });
  window.setInterval(() => void syncDeviceRecords(), 30_000);
  void syncDeviceRecords();
}
