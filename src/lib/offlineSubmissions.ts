// Offline-first database insert queue for the standalone special forms
// (Bloomberg validations, SeeClear monitoring, and any future dedicated-table
// form). When online the row is inserted immediately; when offline — or if the
// insert fails transiently — the row is persisted in IndexedDB and replayed
// automatically as soon as connectivity returns. This makes those forms work
// 100% offline end-to-end (capture + submit), complementing the offline media
// queue used for their photo evidence.

import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "acg_offline_submissions";
const DB_VERSION = 1;
const STORE = "pending_inserts";

export interface PendingInsert {
  id: string;
  table: string;
  row: Record<string, any>;
  created_at: string;
  attempts: number;
  last_error?: string | null;
}

let flushing = false;
let listenersBound = false;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });

const putRecord = async (rec: PendingInsert): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const deleteRecord = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAllRecords = async (): Promise<PendingInsert[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingInsert[]) || []);
    req.onerror = () => reject(req.error);
  });
};

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/**
 * Insert a row now if online, otherwise queue it offline. Always resolves;
 * `queued` is true when the insert is waiting for connectivity.
 */
export async function queueOrInsert(
  table: string,
  row: Record<string, any>,
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    try {
      const { error } = await supabase.from(table as any).insert(row);
      if (error) throw error;
      return { queued: false };
    } catch {
      // fall through to queue — never lose the submission
    }
  }
  await putRecord({
    id: `${table}::${Date.now()}::${Math.random().toString(36).slice(2)}`,
    table,
    row,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });
  ensureListeners();
  return { queued: true };
}

export async function getPendingInsertCount(): Promise<number> {
  try {
    return (await getAllRecords()).length;
  } catch {
    return 0;
  }
}

export async function flushSubmissionQueue(): Promise<{ inserted: number; remaining: number }> {
  if (flushing || !isOnline()) {
    return { inserted: 0, remaining: await getPendingInsertCount() };
  }
  flushing = true;
  let inserted = 0;
  try {
    const records = await getAllRecords();
    for (const rec of records) {
      if (!isOnline()) break;
      try {
        const { error } = await supabase.from(rec.table as any).insert(rec.row);
        if (error) throw error;
        await deleteRecord(rec.id);
        inserted++;
      } catch (e: any) {
        await putRecord({ ...rec, attempts: rec.attempts + 1, last_error: e?.message || "insert failed" });
      }
    }
  } finally {
    flushing = false;
  }
  return { inserted, remaining: await getPendingInsertCount() };
}

function ensureListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => void flushSubmissionQueue());
  window.setInterval(() => {
    if (isOnline()) void flushSubmissionQueue();
  }, 30000);
}

export function initOfflineSubmissions() {
  ensureListeners();
  if (isOnline()) void flushSubmissionQueue();
}
