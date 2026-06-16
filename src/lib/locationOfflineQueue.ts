/**
 * Offline-first location buffer.
 *
 * Two responsibilities:
 *  1. Queue location points captured while offline so they can be flushed to
 *     Supabase when connectivity returns ("outbox").
 *  2. Persist the locally-traced path per user so the admin dashboard can still
 *     draw movement trails while completely offline ("paths").
 *
 * Uses a dedicated IndexedDB database to avoid version conflicts with other
 * offline stores in the app.
 */

export interface LocationPoint {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  battery_level?: number | null;
  recorded_at: string; // ISO timestamp
}

const DB_NAME = "amehnities_location_tracking";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox"; // points awaiting sync
const PATH_STORE = "paths"; // last-known traced paths keyed by user_id

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(PATH_STORE)) {
        db.createObjectStore(PATH_STORE, { keyPath: "user_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Add a point to the offline outbox (awaiting Supabase sync). */
export async function queuePoint(point: LocationPoint): Promise<void> {
  await tx(OUTBOX_STORE, "readwrite", (s) => s.add(point as any));
}

/** Read every queued point with its internal key. */
export async function getQueuedPoints(): Promise<Array<LocationPoint & { id: number }>> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const t = db.transaction(OUTBOX_STORE, "readonly");
      const req = t.objectStore(OUTBOX_STORE).getAll();
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
  });
}

/** Remove successfully-synced points by their internal keys. */
export async function removeQueuedPoints(ids: number[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(OUTBOX_STORE, "readwrite");
    const store = t.objectStore(OUTBOX_STORE);
    ids.forEach((id) => store.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export interface StoredPath {
  user_id: string;
  points: Array<{ lat: number; lng: number; t: string }>;
  updated_at: string;
}

const MAX_PATH_POINTS = 5000;

/** Append a point to the locally-stored path for a user (capped). */
export async function appendToPath(userId: string, lat: number, lng: number, t: string): Promise<void> {
  const existing = (await tx<StoredPath | undefined>(PATH_STORE, "readonly", (s) => s.get(userId) as any)) || {
    user_id: userId,
    points: [],
    updated_at: t,
  };
  existing.points.push({ lat, lng, t });
  if (existing.points.length > MAX_PATH_POINTS) {
    existing.points = existing.points.slice(-MAX_PATH_POINTS);
  }
  existing.updated_at = t;
  await tx(PATH_STORE, "readwrite", (s) => s.put(existing as any));
}

/** Read all locally-stored paths (used for fully-offline dashboard rendering). */
export async function getAllPaths(): Promise<StoredPath[]> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const t = db.transaction(PATH_STORE, "readonly");
      const req = t.objectStore(PATH_STORE).getAll();
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
  });
}

/** Merge server paths into the local cache so admins keep them offline later. */
export async function cacheServerPaths(paths: StoredPath[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(PATH_STORE, "readwrite");
    const store = t.objectStore(PATH_STORE);
    paths.forEach((p) => store.put(p));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
