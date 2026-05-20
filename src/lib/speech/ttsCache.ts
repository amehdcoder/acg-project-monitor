/**
 * IndexedDB cache for generated TTS audio (MP3 blobs).
 * Keyed by hash(text + voiceId + lang + rate). Capped at ~150 entries / ~25 MB
 * via a simple FIFO eviction policy on write.
 */
const DB_NAME = "tts_cache_v1";
const STORE = "audio";
const MAX_ENTRIES = 400;
const MAX_BYTES = 50 * 1024 * 1024;

interface CacheEntry {
  key: string;
  blob: Blob;
  bytes: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function hashKey(parts: (string | number | undefined)[]): Promise<string> {
  const text = parts.map((p) => String(p ?? "")).join("|");
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: simple djb2
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}

export async function getCachedAudio(key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        resolve(entry?.blob || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putCachedAudio(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ key, blob, bytes: blob.size, createdAt: Date.now() } satisfies CacheEntry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    // Best-effort FIFO eviction
    void evictIfNeeded();
  } catch {
    /* noop */
  }
}

async function evictIfNeeded(): Promise<void> {
  try {
    const db = await openDB();
    const entries: { key: string; bytes: number; createdAt: number }[] = await new Promise(
      (resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const out: { key: string; bytes: number; createdAt: number }[] = [];
        const cursorReq = tx.objectStore(STORE).index("createdAt").openCursor();
        cursorReq.onsuccess = () => {
          const cur = cursorReq.result;
          if (cur) {
            const v = cur.value as CacheEntry;
            out.push({ key: v.key, bytes: v.bytes || 0, createdAt: v.createdAt });
            cur.continue();
          } else {
            resolve(out);
          }
        };
        cursorReq.onerror = () => resolve(out);
      },
    );
    let total = entries.reduce((a, e) => a + (e.bytes || 0), 0);
    let count = entries.length;
    const toDelete: string[] = [];
    let i = 0;
    while ((count > MAX_ENTRIES || total > MAX_BYTES) && i < entries.length) {
      toDelete.push(entries[i].key);
      total -= entries[i].bytes || 0;
      count -= 1;
      i += 1;
    }
    if (!toDelete.length) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      toDelete.forEach((k) => store.delete(k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* noop */
  }
}

export async function clearTTSCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* noop */
  }
}
