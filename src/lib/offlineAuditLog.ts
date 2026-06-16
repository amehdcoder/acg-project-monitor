// Offline authentication & cache-lifecycle audit trail.
//
// Records events that happen on-device around offline login and the lifecycle
// of cached offline credential profiles:
//   • offline login attempt / success / failure
//   • cache seed (credentials cached after an online login)
//   • cache reveal / export (encrypted device-profile exported)
//   • cache import (device profile restored from a file)
//   • cache invalidate (credentials removed)
//
// Because many of these happen while the device is OFFLINE (and possibly while
// no Supabase session exists), every event is first written to a durable local
// IndexedDB queue. The queue is flushed to the `offline_auth_audit` table the
// next time the device is online with a valid session. From there the data can
// be synced to Google Sheets / Looker Studio like any other table.

import { supabase } from "@/integrations/supabase/client";

export type OfflineAuditEvent =
  | "offline_login_attempt"
  | "offline_login_success"
  | "offline_login_failure"
  | "cache_seed"
  | "cache_reveal"
  | "cache_export"
  | "cache_import"
  | "cache_invalidate";

interface QueuedAuditRow {
  client_id: string;
  user_id: string | null;
  email: string | null;
  event_type: OfflineAuditEvent;
  success: boolean | null;
  device_id: string | null;
  details: Record<string, unknown>;
  occurred_at: string;
}

const DB_NAME = "acg_offline_audit";
const DB_VERSION = 1;
const STORE = "queue";
const DEVICE_ID_KEY = "acg_audit_device_id";

const normalizeEmail = (email?: string | null) => (email || "").trim().toLowerCase() || null;

/** Stable, anonymous per-device identifier (not tied to any account). */
export const getAuditDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
};

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_id" });
      }
    };
  });

const enqueue = async (row: QueuedAuditRow): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const readAll = async (): Promise<QueuedAuditRow[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedAuditRow[]) || []);
    req.onerror = () => reject(req.error);
  });
};

const remove = async (clientIds: string[]): Promise<void> => {
  if (!clientIds.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    clientIds.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

let flushing = false;

/**
 * Push any queued audit rows to the backend. Safe to call often — it no-ops
 * when offline, when there's no session, or when the queue is empty.
 */
export const flushOfflineAuditQueue = async (): Promise<number> => {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  flushing = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) return 0;

    const rows = await readAll();
    if (!rows.length) return 0;

    const uid = session.user.id;
    const payload = rows.map((r) => ({
      // Stamp the authenticated user so RLS accepts the insert. Anonymous
      // offline attempts keep their original email for the trail.
      user_id: r.user_id || uid,
      email: r.email,
      event_type: r.event_type,
      success: r.success,
      device_id: r.device_id,
      details: r.details,
      occurred_at: r.occurred_at,
    }));

    const { error } = await supabase.from("offline_auth_audit" as any).insert(payload);
    if (error) {
      console.warn("Offline audit flush failed:", error.message);
      return 0;
    }
    await remove(rows.map((r) => r.client_id));
    return rows.length;
  } catch (e) {
    console.warn("Offline audit flush error:", e);
    return 0;
  } finally {
    flushing = false;
  }
};

/**
 * Record an offline auth / cache-lifecycle event. Never throws — auditing must
 * not break the action it is tracking. Queues locally, then opportunistically
 * flushes when online.
 */
export const logOfflineAuditEvent = async (
  event_type: OfflineAuditEvent,
  args: {
    email?: string | null;
    userId?: string | null;
    success?: boolean | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> => {
  try {
    const row: QueuedAuditRow = {
      client_id: crypto.randomUUID?.() || `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user_id: args.userId ?? null,
      email: normalizeEmail(args.email),
      event_type,
      success: args.success ?? null,
      device_id: getAuditDeviceId(),
      details: args.details ?? {},
      occurred_at: new Date().toISOString(),
    };
    await enqueue(row);
  } catch (e) {
    console.warn("Could not queue offline audit event:", e);
    return;
  }
  // Fire-and-forget flush; ignore result.
  void flushOfflineAuditQueue();
};

// Flush whenever connectivity returns.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOfflineAuditQueue());
}
