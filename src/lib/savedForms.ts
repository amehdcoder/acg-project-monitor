// Local-first store for full form entries that move through the
// draft -> finalized -> sent lifecycle. Backed by IndexedDB so entries
// survive reloads and work fully offline. Each entry carries a complete
// snapshot of the form definition so it can be re-rendered and edited
// later, plus the prepared submission payload so it can be synced to the
// server with exactly the same shape as a direct submission.

import type { Question, FormGroup, GeofenceArea } from "@/components/FormBuilder/types";

export type SavedFormStatus = "draft" | "finalized" | "sent";

export interface SavedFormEntry {
  id: string;
  userId: string;
  formId: string;
  formName: string;
  respondentName?: string | null;
  displayName?: string | null;
  formDescription: string;
  projectId: string;
  // Full form definition snapshot — needed to re-render in FormFiller.
  questions: Question[];
  groups: FormGroup[];
  geofence: GeofenceArea | null;
  settings: Record<string, any>;
  // Respondent data.
  responses: Record<string, any>;
  gps: { lat: number; lng: number; accuracy?: number } | null;
  // Prepared submission payload (built at finalize time) so syncing matches
  // a normal submission.
  submissionData?: Record<string, any> | null;
  submissionLocation?: { lat: number; lng: number } | null;
  withinGeofence?: boolean | null;
  submissionType?: string;
  // Lifecycle.
  status: SavedFormStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
  sentAt?: string | null;
  submissionId?: string | null;
  offline?: boolean;
  // Multi-device conflict tracking. `deviceId` identifies the device that last
  // wrote this copy; `rev` is a monotonic per-record revision counter used by
  // the deterministic merge engine to resolve divergent edits.
  deviceId?: string | null;
  rev?: number;
}

const DEVICE_ID_KEY = "amehnities_saved_forms_device_id";

/** Stable per-device id used for multi-device conflict resolution. */
export const getSavedFormDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
};

const DB_NAME = "amehnities_saved_forms";
const DB_VERSION = 1;
const STORE = "entries";

const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("formId", "formId", { unique: false });
      }
    };
  });

// Best-effort extraction of searchable metadata from a saved entry's responses
// for the immutable local audit ledger. Never throws.
const extractAuditMeta = (entry: SavedFormEntry) => {
  const responses = entry.responses || {};
  let communityName: string | null = null;
  let medicineType: string | null = null;
  try {
    for (const [k, v] of Object.entries(responses)) {
      if (v == null || typeof v === "object") continue;
      const key = k.toLowerCase();
      if (!communityName && /communit|village|ward|settlement/.test(key)) {
        communityName = String(v);
      }
      if (!medicineType && /medicine|drug|commodity|treatment/.test(key)) {
        medicineType = String(v);
      }
    }
  } catch {
    /* best-effort */
  }
  return {
    communityName,
    medicineType,
    userName: entry.respondentName || entry.displayName || null,
    clientSubmittedAt: entry.finalizedAt || entry.createdAt || null,
    serverSyncedAt: entry.sentAt || null,
  };
};

export const saveSavedEntry = async (entry: SavedFormEntry): Promise<void> => {
  // Stamp device + bump revision so multi-device edits are attributable and the
  // deterministic merge engine can resolve divergence.
  const stamped: SavedFormEntry = {
    ...entry,
    deviceId: entry.deviceId || getSavedFormDeviceId(),
    rev: (Number(entry.rev) || 0) + 1,
  };
  const isFirstWrite = (Number(entry.rev) || 0) === 0;
  const db = await initDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(stamped);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
  // Append an immutable audit-ledger entry (best-effort, fire-and-forget).
  try {
    const { appendSyncAudit } = await import("@/lib/syncAuditLog");
    void appendSyncAudit({
      formUuid: stamped.id,
      formName: stamped.formName,
      action: isFirstWrite ? "created" : "edited",
      meta: extractAuditMeta(stamped),
    });
  } catch {
    /* auditing must never break saving */
  }
};


/**
 * Reconcile an incoming copy of a saved entry (e.g. pulled from another device
 * or the server) against whatever is already stored locally under the same id.
 * Applies deterministic conflict detection + merge and persists the winner.
 * Returns the merge report so callers can surface conflict notices.
 */
export const reconcileSavedEntry = async (
  incoming: SavedFormEntry,
): Promise<import("@/lib/savedFormMerge").MergeReport> => {
  const { mergeSavedEntries } = await import("@/lib/savedFormMerge");
  const existing = await getSavedEntry(incoming.id);
  if (!existing) {
    await saveSavedEntry(incoming);
    return { hadConflict: false, divergent: false, fieldConflicts: [], statusResolvedFrom: null, chosenDevice: incoming.deviceId ?? null };
  }
  const { merged, report } = mergeSavedEntries(existing, incoming);
  // Persist merged directly (preserve merged.rev) rather than via saveSavedEntry
  // so we don't double-bump the revision the merge already set.
  const db = await initDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(merged);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
  return report;
};

export const getSavedEntry = async (id: string): Promise<SavedFormEntry | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as SavedFormEntry) || null);
  });
};

export const listSavedEntries = async (
  userId: string,
  status?: SavedFormStatus,
): Promise<SavedFormEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      let rows = (req.result as SavedFormEntry[]) || [];
      rows = rows.filter((r) => r.userId === userId);
      if (status) rows = rows.filter((r) => r.status === status);
      rows.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      resolve(rows);
    };
  });
};

export const deleteSavedEntries = async (ids: string[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// Return every saved entry across all users on this device, optionally
// filtered by status. Used by the background reconciliation engine to detect
// queued special-form mirrors that have already landed on the server.
export const listAllSavedEntries = async (
  status?: SavedFormStatus,
): Promise<SavedFormEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      let rows = (req.result as SavedFormEntry[]) || [];
      if (status) rows = rows.filter((r) => r.status === status);
      resolve(rows);
    };
  });
};

export const setSavedEntryStatus = async (
  id: string,
  status: SavedFormStatus,
  patch: Partial<SavedFormEntry> = {},
): Promise<void> => {
  const existing = await getSavedEntry(id);
  if (!existing) return;
  const merged = {
    ...existing,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  };
  await saveSavedEntry(merged);
  // Record the lifecycle transition in the immutable audit ledger.
  if (status === "finalized" || status === "sent") {
    try {
      const { appendSyncAudit } = await import("@/lib/syncAuditLog");
      const isSent = status === "sent";
      void appendSyncAudit({
        formUuid: merged.id,
        formName: merged.formName,
        // A finalized entry is "queued" (ready to send); a sent entry that is
        // still flagged offline is queued on the server-bound queue, otherwise
        // it has fully synced.
        action: isSent && !merged.offline ? "synced" : "queued",
        status: isSent && !merged.offline ? 200 : null,
        meta: {
          communityName: null,
          medicineType: null,
          userName: merged.respondentName || merged.displayName || null,
          clientSubmittedAt: merged.finalizedAt || merged.createdAt || null,
          serverSyncedAt: merged.sentAt || null,
        },
      });
    } catch {
      /* auditing must never break the status transition */
    }
  }
};


export const newEntryId = (): string => crypto.randomUUID();

export const buildSavedEntryDisplayName = (entry: Pick<SavedFormEntry, "formName" | "respondentName" | "updatedAt" | "finalizedAt" | "createdAt">): string => {
  const name = entry.respondentName?.trim() || "Unnamed respondent";
  const when = entry.finalizedAt || entry.updatedAt || entry.createdAt;
  const stamp = when ? new Date(when).toLocaleString() : new Date().toLocaleString();
  return `${entry.formName} — ${name} — ${stamp}`;
};
