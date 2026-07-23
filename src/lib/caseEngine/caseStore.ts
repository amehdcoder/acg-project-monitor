// Phase 1 — Local Case Store (IndexedDB).
//
// A dedicated IndexedDB store for offline-first case entities. Uses native
// IndexedDB (no Dexie dependency) so it plays nicely with the rest of the
// app's offline stack. Everything is written client-side; a background sync
// manager (see caseSyncQueue.ts) reconciles with the server later.

export type CaseType = "patient" | "facility" | "household";
export type CaseSyncStatus = "synced" | "pending_update" | "pending_creation";

export interface CaseSearchKeys {
  first_name?: string;
  last_name?: string;
  phone?: string;
  dob?: string; // ISO yyyy-mm-dd
  national_id?: string;
}

export interface CaseEntity {
  case_id: string;                 // UUID (client generated)
  case_type: CaseType;
  external_id?: string | null;     // human-readable id
  parent_case_id?: string | null;  // for hierarchical linking
  search_keys: CaseSearchKeys;
  properties: Record<string, unknown>;
  updated_at: string;              // ISO
  created_at: string;              // ISO
  is_closed: boolean;
  sync_status: CaseSyncStatus;
  // Populated when the entity was created after a "confirmed as new" flow
  // over the top of duplicate warnings — kept for audit + server dedupe.
  flagged_override?: boolean;
  project_id?: string | null;
  owner_user_id?: string | null;
}

const DB_NAME = "amehnities_case_engine";
const DB_VERSION = 1;
const STORE = "cases";

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "case_id" });
        store.createIndex("case_type", "case_type", { unique: false });
        store.createIndex("is_closed", "is_closed", { unique: false });
        store.createIndex("sync_status", "sync_status", { unique: false });
        store.createIndex("parent_case_id", "parent_case_id", { unique: false });
        store.createIndex("external_id", "external_id", { unique: false });
        store.createIndex("national_id", "search_keys.national_id", { unique: false });
        store.createIndex("phone", "search_keys.phone", { unique: false });
        store.createIndex("last_name", "search_keys.last_name", { unique: false });
      }
    };
  });
  return dbPromise;
};

const tx = async (mode: IDBTransactionMode) => {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
};

export const newCaseId = (): string =>
  (crypto as any)?.randomUUID?.() ??
  `case-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const putCase = async (entity: CaseEntity): Promise<void> => {
  const store = await tx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put(entity);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
};

export const getCase = async (case_id: string): Promise<CaseEntity | null> => {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(case_id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as CaseEntity) ?? null);
  });
};

export const listCases = async (opts: {
  case_type?: CaseType;
  includeClosed?: boolean;
} = {}): Promise<CaseEntity[]> => {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      let rows = (req.result as CaseEntity[]) || [];
      if (opts.case_type) rows = rows.filter((r) => r.case_type === opts.case_type);
      if (!opts.includeClosed) rows = rows.filter((r) => !r.is_closed);
      resolve(rows);
    };
  });
};

export const listPendingCases = async (): Promise<CaseEntity[]> => {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const rows = ((req.result as CaseEntity[]) || []).filter(
        (r) => r.sync_status !== "synced",
      );
      resolve(rows);
    };
  });
};

export const deleteCase = async (case_id: string): Promise<void> => {
  const store = await tx("readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(case_id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
};

/** Convenience factory for a freshly-registered case awaiting first sync. */
export const buildNewCase = (
  input: Omit<CaseEntity, "case_id" | "created_at" | "updated_at" | "is_closed" | "sync_status"> &
    Partial<Pick<CaseEntity, "case_id" | "created_at" | "updated_at" | "is_closed" | "sync_status">>,
): CaseEntity => {
  const now = new Date().toISOString();
  return {
    case_id: input.case_id || newCaseId(),
    case_type: input.case_type,
    external_id: input.external_id ?? null,
    parent_case_id: input.parent_case_id ?? null,
    search_keys: input.search_keys || {},
    properties: input.properties || {},
    updated_at: input.updated_at || now,
    created_at: input.created_at || now,
    is_closed: input.is_closed ?? false,
    sync_status: input.sync_status || "pending_creation",
    flagged_override: input.flagged_override,
    project_id: input.project_id ?? null,
    owner_user_id: input.owner_user_id ?? null,
  };
};
