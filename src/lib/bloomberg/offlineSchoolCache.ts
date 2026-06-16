// Offline cache for the Bloomberg school register + the current user's cascade
// assignments, so the School Enrolment Validation form can fetch schools and the
// State→LGA→Ward→Community cascade even with no connectivity.
//
// Uses IndexedDB (the same database family used elsewhere for offline data) to
// hold the full ~2,800-row register, which can exceed the localStorage quota.

import type { BloombergSchool } from "@/lib/bloomberg/definition";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 3;
const STORE = "bloomberg_cache";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Preserve any stores created by other modules on the same DB.
      if (!db.objectStoreNames.contains("pending_submissions")) {
        const s = db.createObjectStore("pending_submissions", { keyPath: "id" });
        s.createIndex("form_id", "form_id", { unique: false });
        s.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("offline_forms")) {
        const f = db.createObjectStore("offline_forms", { keyPath: "id" });
        f.createIndex("project_id", "project_id", { unique: false });
        f.createIndex("downloaded_at", "downloaded_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });

interface CachedSchools {
  key: string;
  schools: BloombergSchool[];
  cached_at: number;
}
interface CachedAssignments {
  key: string;
  assignments: { field_key: string; value: string }[];
  cached_at: number;
}

const SCHOOLS_KEY = "schools";
const assignmentsKey = (userId: string) => `assignments:${userId}`;

const put = (db: IDBDatabase, value: any): Promise<void> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(value);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });

const get = <T,>(db: IDBDatabase, key: string): Promise<T | null> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as T) ?? null);
  });

export async function cacheBloombergSchools(schools: BloombergSchool[]): Promise<void> {
  if (!schools.length) return;
  try {
    const db = await openDB();
    await put(db, { key: SCHOOLS_KEY, schools, cached_at: Date.now() } as CachedSchools);
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function readCachedBloombergSchools(): Promise<{
  schools: BloombergSchool[];
  cachedAt: number | null;
}> {
  try {
    const db = await openDB();
    const rec = await get<CachedSchools>(db, SCHOOLS_KEY);
    db.close();
    return { schools: rec?.schools ?? [], cachedAt: rec?.cached_at ?? null };
  } catch {
    return { schools: [], cachedAt: null };
  }
}

export async function cacheBloombergAssignments(
  userId: string,
  assignments: { field_key: string; value: string }[],
): Promise<void> {
  try {
    const db = await openDB();
    await put(db, {
      key: assignmentsKey(userId),
      assignments,
      cached_at: Date.now(),
    } as CachedAssignments);
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function readCachedBloombergAssignments(
  userId: string,
): Promise<{ field_key: string; value: string }[]> {
  try {
    const db = await openDB();
    const rec = await get<CachedAssignments>(db, assignmentsKey(userId));
    db.close();
    return rec?.assignments ?? [];
  } catch {
    return [];
  }
}
