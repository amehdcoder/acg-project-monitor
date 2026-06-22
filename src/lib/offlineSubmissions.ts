// Offline-first database insert queue for the standalone special forms
// (Bloomberg validations, SeeClear monitoring, and any future dedicated-table
// form). When online the row is inserted immediately; when offline — or if the
// insert fails transiently — the row is persisted in IndexedDB and replayed
// automatically as soon as connectivity returns. This makes those forms work
// 100% offline end-to-end (capture + submit), complementing the offline media
// queue used for their photo evidence.

import { supabase } from "@/integrations/supabase/client";
import { sealRecord, unsealRecord } from "@/lib/deviceCrypto";
import { getSavedEntry, setSavedEntryStatus } from "@/lib/savedForms";

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
  upsertOnId?: boolean;
  // Id of the saved-forms mirror entry to reconcile (mark "sent", clear the
  // offline/queued flag) once this row lands on the server.
  mirrorEntryId?: string | null;
}

// Best-effort: flip the UI mirror entry from "queued" to a confirmed "sent"
// state. Never throws into the flush loop.
async function markMirrorSent(mirrorEntryId?: string | null) {
  if (!mirrorEntryId) return;
  try {
    const now = new Date().toISOString();
    const existing = await getSavedEntry(mirrorEntryId);
    await setSavedEntryStatus(mirrorEntryId, "sent", {
      offline: false,
      sentAt: now,
      settings: { ...(existing?.settings || {}), serverVerifiedAt: now },
    });
  } catch {
    // mirror reconciliation is best-effort
  }
}

let flushing = false;
let listenersBound = false;
let flushTimer: number | null = null;

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000, 60_000];

function scheduleFlush(delay = 1_000) {
  if (typeof window === "undefined" || !isOnline()) return;
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushSubmissionQueue();
  }, delay);
}

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
  const sealed = await sealRecord(rec, ["id", "created_at"]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(sealed);
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
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
  return Promise.all(rows.map((r) => unsealRecord<PendingInsert>(r)));
};

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

const retryWithoutBrokenSchoolKey = async (table: string, row: Record<string, unknown>, error: unknown) => {
  const message = String((error as { message?: string; code?: string })?.message || "");
  const code = (error as { code?: string })?.code;
  if (table !== "bloomberg_validations" || code !== "23503" || !/school_key/i.test(message)) return null;
  const safeRow = { ...row, school_key: null };
  return supabase.from(table as any).upsert(safeRow as any, { onConflict: "id" });
};

const isMissingRpc = (error: unknown) =>
  (error as { code?: string })?.code === "42883" ||
  /submit_bloomberg_validation/i.test(String((error as { message?: string })?.message || ""));

async function writeRecordToServer(table: string, row: Record<string, any>, upsertOnId: boolean) {
  // Bloomberg validations have already been affected in the field by RLS/FK/client
  // edge-cases. Route them through the backend-owned RPC, which validates the
  // signed-in user, repairs missing school keys, and performs an idempotent upsert.
  if (table === "bloomberg_validations") {
    const { error } = await (supabase as any).rpc("submit_bloomberg_validation", { _row: row });
    if (!error) return { error: null };
    // Keep local development/remix previews usable before the migration exists.
    if (!isMissingRpc(error)) return { error };
  }

  const { error } = upsertOnId
    ? await supabase.from(table as any).upsert(row, { onConflict: "id" })
    : await supabase.from(table as any).insert(row);
  if (error) {
    const retried = upsertOnId ? await retryWithoutBrokenSchoolKey(table, row, error) : null;
    if (retried) return { error: retried.error };
  }
  return { error };
}

/**
 * Insert a row now if online, otherwise queue it offline. Always resolves;
 * `queued` is true when the insert is waiting for connectivity.
 *
 * When `upsertOnId` is true the row is written with an upsert keyed on `id`,
 * so re-submitting an edited record overwrites the existing row instead of
 * creating a duplicate. The same flag is preserved on the queued record and
 * honoured when the offline queue is flushed.
 */
export async function queueOrInsert(
  table: string,
  row: Record<string, any>,
  upsertOnId = false,
  opts: { mirrorEntryId?: string | null } = {},
): Promise<{ queued: boolean }> {
  if (isOnline()) {
    try {
      const { error } = await writeRecordToServer(table, row, upsertOnId);
      if (error) throw error;
      // Confirmed on the server — reconcile the UI mirror right away.
      await markMirrorSent(opts.mirrorEntryId);
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
    upsertOnId,
    mirrorEntryId: opts.mirrorEntryId ?? null,
  });
  ensureListeners();
  // Kick an immediate background flush attempt so a transient failure while
  // online does not leave the row sitting "queued" for the whole interval.
  scheduleFlush(500);
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
    const due = records.filter((rec) => {
      const delay = RETRY_DELAYS_MS[Math.min(rec.attempts, RETRY_DELAYS_MS.length - 1)];
      const last = Date.parse(rec.created_at || "") || 0;
      return rec.attempts === 0 || Date.now() - last >= delay;
    });
    for (const rec of due) {
      if (!isOnline()) break;
      try {
        const { error } = await writeRecordToServer(rec.table, rec.row, rec.upsertOnId ?? false);
        if (error) throw error;
        await deleteRecord(rec.id);
        await markMirrorSent(rec.mirrorEntryId);
        inserted++;
      } catch (e: any) {
        await putRecord({ ...rec, attempts: rec.attempts + 1, created_at: new Date().toISOString(), last_error: e?.message || "insert failed" });
      }
    }
  } finally {
    flushing = false;
  }
  const remaining = await getPendingInsertCount();
  if (remaining > 0) scheduleFlush(5_000);
  return { inserted, remaining };
}

function ensureListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => void flushSubmissionQueue());
  // Drain again whenever the app returns to the foreground (mobile devices
  // freeze background timers, so this guarantees a prompt retry on resume).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) {
      void flushSubmissionQueue();
    }
  });
  // Poll every 15s so a queued row is retried multiple times within a minute.
  window.setInterval(() => {
    if (isOnline()) void flushSubmissionQueue();
  }, 15000);
}

export function initOfflineSubmissions() {
  ensureListeners();
  if (isOnline()) void flushSubmissionQueue();
}
