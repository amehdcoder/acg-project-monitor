/**
 * Speech replay log — Batch 11.
 *
 * Local-only ring of the last 10 captured utterance audio blobs so a field
 * supervisor can replay "what did the enumerator actually say?" when a
 * transcript looks suspicious. Auto-purges anything older than 24 h on
 * every write. Never leaves the device.
 *
 * Backed by IndexedDB to avoid bloating localStorage with binary data.
 */

const DB_NAME = "speech_replay_v1";
const STORE = "clips";
const MAX_CLIPS = 10;
const TTL_MS = 24 * 60 * 60 * 1000;

export interface ReplayClipMeta {
  id: string;
  ts: number;
  qId?: string;
  tier: string;
  lang?: string;
  transcript?: string;
  conf?: number;
  durationMs?: number;
}

export interface ReplayClip extends ReplayClipMeta {
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no_idb"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("ts", "ts", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

export async function addReplayClip(blob: Blob, meta: Omit<ReplayClipMeta, "id" | "ts">) {
  try {
    const store = await tx("readwrite");
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    const rec: ReplayClip = { ...meta, id, ts: Date.now(), blob };
    await new Promise<void>((res, rej) => {
      const r = store.put(rec);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
    await trimAndPurge();
  } catch {
    /* best-effort */
  }
}

export async function listReplayClips(): Promise<ReplayClip[]> {
  try {
    const store = await tx("readonly");
    return await new Promise<ReplayClip[]>((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => {
        const all = (r.result as ReplayClip[]).sort((a, b) => b.ts - a.ts);
        res(all);
      };
      r.onerror = () => rej(r.error);
    });
  } catch {
    return [];
  }
}

export async function clearReplayLog() {
  try {
    const store = await tx("readwrite");
    await new Promise<void>((res) => {
      const r = store.clear();
      r.onsuccess = () => res();
      r.onerror = () => res();
    });
  } catch { /* noop */ }
}

async function trimAndPurge() {
  const all = await listReplayClips();
  const cutoff = Date.now() - TTL_MS;
  const expired = all.filter((c) => c.ts < cutoff);
  const overflow = all.length - expired.length > MAX_CLIPS
    ? all.filter((c) => c.ts >= cutoff).slice(MAX_CLIPS)
    : [];
  const toDelete = [...expired, ...overflow];
  if (!toDelete.length) return;
  try {
    const store = await tx("readwrite");
    await Promise.all(
      toDelete.map(
        (c) =>
          new Promise<void>((res) => {
            const r = store.delete(c.id);
            r.onsuccess = () => res();
            r.onerror = () => res();
          }),
      ),
    );
  } catch { /* noop */ }
}
