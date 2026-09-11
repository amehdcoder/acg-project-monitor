// Outbound queue for account-free device collection.
//
// Finalized records saved by an enrolled device are pushed through the
// `project-collect` server function (the device has no database session).
// The queue is retried on reconnect, on tab focus and on a timer, with the
// record's deterministic id making every retry idempotent.

import { listAllSavedEntries, setSavedEntryStatus, type SavedFormEntry } from "@/lib/savedForms";
import {
  readDeviceSession,
  sendDeviceRecords,
  deviceUserId,
  clearDeviceSession,
  type DeviceSyncRecord,
} from "@/lib/deviceSession";

let started = false;
let syncing = false;
let backoffUntil = 0;

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

const toRecord = (entry: SavedFormEntry): DeviceSyncRecord => ({
  id: entry.submissionId || entry.id,
  // See Clear visits are routed to the checklist intake server-side.
  kind: entry.settings?.kind === "seeclear" ? "seeclear" : undefined,
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

export async function syncDeviceRecords(): Promise<{ synced: number; failed: number }> {
  const session = readDeviceSession();
  if (!session || syncing || !isOnline() || Date.now() < backoffUntil) {
    return { synced: 0, failed: 0 };
  }
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const owner = deviceUserId(session.deviceId);
    const entries = (await listAllSavedEntries("finalized")).filter((e) => e.userId === owner);
    if (entries.length === 0) return { synced: 0, failed: 0 };

    // Send in batches so a very large offline backlog still gets through.
    for (let i = 0; i < entries.length; i += 25) {
      const batch = entries.slice(i, i + 25);
      try {
        const { accepted, rejected } = await sendDeviceRecords(session.token, batch.map(toRecord));
        const acceptedSet = new Set(accepted);
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
            synced++;
          } else {
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
        // Back off before the next attempt so a failing server is not hammered.
        backoffUntil = Date.now() + 60_000;
        break;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
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
