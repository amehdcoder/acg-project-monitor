// Immutable local audit ledger for the offline-first form lifecycle.
// ─────────────────────────────────────────────────────────────────────────
// Every meaningful event that happens to a submission on-device — created,
// edited, queued for sync, sync-success, sync-failure — is appended here as a
// READ-ONLY entry. Entries persist indefinitely in IndexedDB, independent of
// whether the underlying submission payload is later cleaned up or archived,
// giving field users complete telemetry transparency and a searchable receipt
// history.
//
// The ledger is append-only: there is no update or delete API by design.

export type SyncAuditAction =
  | "created"
  | "edited"
  | "queued"
  | "synced"
  | "sync_failed";

export interface SyncAuditEntry {
  /** Unique id for this immutable log line. */
  id: string;
  /** The form/submission UUID this event relates to. */
  formUuid: string;
  /** Human-readable form name for display / search. */
  formName?: string | null;
  /** What happened. */
  action: SyncAuditAction;
  /** ISO timestamp the event was recorded on-device. */
  timestamp: string;
  /** Server HTTP status (or synthetic code) if this was a network event. */
  status?: number | null;
  /** Searchable metadata: community, medicine type, user name, etc. */
  meta?: {
    communityName?: string | null;
    medicineType?: string | null;
    userName?: string | null;
    clientSubmittedAt?: string | null;
    serverSyncedAt?: string | null;
    [key: string]: unknown;
  };
}

const DB_NAME = "amehnities_sync_audit";
const DB_VERSION = 1;
const STORE = "sync_audit_logs";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("formUuid", "formUuid", { unique: false });
        store.createIndex("action", "action", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

const genId = (): string => {
  try {
    return crypto.randomUUID?.() || `log-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `log-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

/**
 * Append a new immutable audit entry. Never throws — auditing must not break
 * the action it tracks.
 */
export async function appendSyncAudit(
  entry: Omit<SyncAuditEntry, "id" | "timestamp"> & { timestamp?: string },
): Promise<void> {
  try {
    const row: SyncAuditEntry = {
      id: genId(),
      timestamp: entry.timestamp || new Date().toISOString(),
      formUuid: entry.formUuid,
      formName: entry.formName ?? null,
      action: entry.action,
      status: entry.status ?? null,
      meta: entry.meta ?? {},
    };
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // Best-effort; never surface into the calling flow.
    console.warn("appendSyncAudit failed:", e);
  }
}

/** Read the full ledger, newest first. */
export async function listSyncAudit(): Promise<SyncAuditEntry[]> {
  try {
    const db = await openDB();
    const rows: SyncAuditEntry[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as SyncAuditEntry[]) || []);
      req.onerror = () => reject(req.error);
    });
    return rows.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } catch {
    return [];
  }
}

/** All ledger entries for one submission UUID, oldest first (a lifecycle trail). */
export async function listSyncAuditForForm(formUuid: string): Promise<SyncAuditEntry[]> {
  const all = await listSyncAudit();
  return all
    .filter((r) => r.formUuid === formUuid)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Fully-offline text search across form name, community, medicine type and
 * user name. Case-insensitive substring match, no network access.
 */
export async function searchSyncAudit(query: string): Promise<SyncAuditEntry[]> {
  const all = await listSyncAudit();
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((r) => {
    const haystack = [
      r.formName,
      r.meta?.communityName,
      r.meta?.medicineType,
      r.meta?.userName,
      r.action,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
