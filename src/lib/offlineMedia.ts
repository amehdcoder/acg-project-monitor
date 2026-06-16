// Offline-first media upload queue.
//
// Every media (photo / file) capture in the app should route through
// `queueOrUploadMedia`. When the device is online the file is uploaded
// immediately to Supabase Storage. When offline — or if the upload fails for a
// transient reason — the raw blob is persisted in IndexedDB and the intended
// storage path is returned immediately so the form can keep working. A
// background flusher drains the queue automatically whenever connectivity
// returns (and on app start), so nothing is ever lost and the user never has
// to wait for the network to attach evidence.
//
// This makes ALL media uploads (Bloomberg evidence, SeeClear evidence, and any
// other feature that adopts this helper) work 100% offline.

import { supabase } from "@/integrations/supabase/client";
import { encryptBlob, decryptBlob } from "@/lib/deviceCrypto";

const DB_NAME = "acg_offline_media";
const DB_VERSION = 1;
const STORE = "pending_media";

export interface PendingMedia {
  /** `${bucket}::${path}` — unique key */
  id: string;
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  upsert: boolean;
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
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });

const putRecord = async (rec: PendingMedia): Promise<void> => {
  const db = await openDB();
  // Encrypt the blob bytes at rest; keep metadata plaintext for indexing.
  const { blob, ...meta } = rec;
  const stored: any = { ...meta, encBlob: await encryptBlob(blob) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
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

const getAllRecords = async (): Promise<PendingMedia[]> => {
  const db = await openDB();
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
  return Promise.all(
    rows.map(async ({ encBlob, ...meta }) => {
      const blob = encBlob ? await decryptBlob(encBlob, meta.contentType) : meta.blob;
      return { ...meta, blob } as PendingMedia;
    }),
  );
};

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/**
 * Upload media now if possible, otherwise queue it offline. Always resolves with
 * the storage path so callers can store the reference immediately. `queued` is
 * true when the file is waiting for connectivity.
 */
export async function queueOrUploadMedia(
  bucket: string,
  path: string,
  file: Blob,
  opts: { upsert?: boolean; contentType?: string } = {},
): Promise<{ path: string; queued: boolean }> {
  const contentType = opts.contentType || (file as File).type || "application/octet-stream";
  const upsert = opts.upsert ?? true;

  if (isOnline()) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert, contentType });
      if (error) throw error;
      return { path, queued: false };
    } catch {
      // fall through to queue — never lose the capture
    }
  }

  await putRecord({
    id: `${bucket}::${path}`,
    bucket,
    path,
    blob: file,
    contentType,
    upsert,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });
  ensureListeners();
  return { path, queued: true };
}

/** Number of media files still waiting to upload. */
export async function getPendingMediaCount(): Promise<number> {
  try {
    return (await getAllRecords()).length;
  } catch {
    return 0;
  }
}

/** Attempt to upload every queued media file. Safe to call repeatedly. */
export async function flushMediaQueue(): Promise<{ uploaded: number; remaining: number }> {
  if (flushing || !isOnline()) {
    return { uploaded: 0, remaining: await getPendingMediaCount() };
  }
  flushing = true;
  let uploaded = 0;
  try {
    const records = await getAllRecords();
    for (const rec of records) {
      if (!isOnline()) break;
      try {
        const { error } = await supabase.storage
          .from(rec.bucket)
          .upload(rec.path, rec.blob, { upsert: rec.upsert, contentType: rec.contentType });
        if (error) throw error;
        await deleteRecord(rec.id);
        uploaded++;
      } catch (e: any) {
        await putRecord({ ...rec, attempts: rec.attempts + 1, last_error: e?.message || "upload failed" });
      }
    }
  } finally {
    flushing = false;
  }
  return { uploaded, remaining: await getPendingMediaCount() };
}

function ensureListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => void flushMediaQueue());
  // Periodic safety net in case the 'online' event was missed.
  window.setInterval(() => {
    if (isOnline()) void flushMediaQueue();
  }, 30000);
}

/** Call once on app start to bind listeners and drain any leftover queue. */
export function initOfflineMedia() {
  ensureListeners();
  if (isOnline()) void flushMediaQueue();
}
