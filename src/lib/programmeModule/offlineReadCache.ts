// On-device read cache for the Longitudinal Beneficiary Records. Every
// successful server read is saved to IndexedDB, so the register and each
// record still open with no internet. Reads fall back to the cache whenever the
// device is offline or the server request fails.

const DB_NAME = "amehnities-records-cache";
const STORE = "reads";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const openDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
};

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ value, saved_at: Date.now() }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result?.value as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Runs a server read with offline fallback: offline → cached copy straight
 * away; online → server result (saved to cache), or the cached copy if the
 * request errors or times out.
 */
export async function cachedRead<T>(
  key: string,
  fetcher: () => PromiseLike<{ data: T | null; error: unknown }>,
  timeoutMs = 12_000,
): Promise<{ data: T | null; fromCache: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { data: await cacheGet<T>(key), fromCache: true };
  }
  try {
    const res = await Promise.race([
      Promise.resolve(fetcher()),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    if (res.error) throw res.error;
    if (res.data !== null && res.data !== undefined) void cacheSet(key, res.data);
    return { data: res.data, fromCache: false };
  } catch {
    return { data: await cacheGet<T>(key), fromCache: true };
  }
}

/** Applies a change to a row inside every cached list whose key starts with `prefix`. */
export async function cachePatchRows(prefix: string, id: string, patch: Record<string, unknown> | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const key = String(cur.key);
      const entry = cur.value as { value: unknown; saved_at: number };
      if (key.startsWith(prefix) && Array.isArray(entry.value)) {
        const rows = (entry.value as Record<string, unknown>[])
          .map((r) => (r.id === id ? (patch ? { ...r, ...patch } : null) : r))
          .filter(Boolean);
        cur.update({ ...entry, value: rows });
      }
      cur.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
