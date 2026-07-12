// Bidirectional master-data DELTA sync engine.
//
// Instead of re-downloading whole reference tables on every app boot, we keep a
// per-resource "watermark" (the newest updated_at we have already stored) and
// ask the backend only for rows changed SINCE that moment:
//
//     select * from <table> where updated_at > <watermark> order by updated_at
//
// Results are merged into a local IndexedDB cache so the app has offline access
// to projects, form definitions, geography, targets and role assignments, and
// so subsequent syncs transfer only the delta — a few rows instead of the whole
// registry. This mirrors the incremental sync model used by CommCare / ODK.

const DB_NAME = "acg_master_data";
const DB_VERSION = 1;
const RECORD_STORE = "records"; // keyPath: "key" = `${resource}:${id}`
const META_STORE = "meta"; // keyPath: "resource" -> { resource, watermark, syncedAt }

export type MasterResource =
  | "projects"
  | "forms"
  | "locations"
  | "microplan_entries"
  | "user_roles"
  | "user_project_assignments";

export const MASTER_RESOURCES: MasterResource[] = [
  "projects",
  "forms",
  "locations",
  "microplan_entries",
  "user_roles",
  "user_project_assignments",
];

export interface MasterSyncMeta {
  resource: MasterResource;
  watermark: string | null;
  syncedAt: string | null;
  count: number;
}

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        const s = db.createObjectStore(RECORD_STORE, { keyPath: "key" });
        s.createIndex("resource", "resource", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "resource" });
      }
    };
  });

const getMeta = async (resource: MasterResource): Promise<MasterSyncMeta | null> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(resource);
    req.onsuccess = () => resolve((req.result as MasterSyncMeta) || null);
    req.onerror = () => resolve(null);
  });
};

const putMeta = async (meta: MasterSyncMeta): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const putRecords = async (
  resource: MasterResource,
  rows: Array<Record<string, any>>,
): Promise<void> => {
  if (rows.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    const store = tx.objectStore(RECORD_STORE);
    for (const row of rows) {
      if (row?.id == null) continue;
      store.put({ key: `${resource}:${row.id}`, resource, id: row.id, row });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const countRecords = async (resource: MasterResource): Promise<number> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(RECORD_STORE, "readonly");
    const idx = tx.objectStore(RECORD_STORE).index("resource");
    const req = idx.count(IDBKeyRange.only(resource));
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });
};

/** Read all locally cached rows for a resource (works fully offline). */
export async function getMasterRecords<T = Record<string, any>>(
  resource: MasterResource,
): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(RECORD_STORE, "readonly");
      const idx = tx.objectStore(RECORD_STORE).index("resource");
      const req = idx.getAll(IDBKeyRange.only(resource));
      req.onsuccess = () =>
        resolve(((req.result as any[]) || []).map((r) => r.row as T));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const PAGE = 1000;

/**
 * Delta-sync a single resource. Pages through everything changed since the
 * stored watermark and advances the watermark to the newest row seen. Never
 * throws — a resource the current user cannot read (RLS) is simply skipped.
 */
export async function syncResource(resource: MasterResource): Promise<MasterSyncMeta> {
  // Lazy import to avoid pulling the client into non-sync bundles.
  const { supabase } = await import("@/integrations/supabase/client");

  const existing = await getMeta(resource);
  let watermark = existing?.watermark ?? null;

  try {
    // Loop pages until a short page signals we've caught up.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!isOnline()) break;
      let q = supabase
        .from(resource as any)
        .select("*")
        .order("updated_at", { ascending: true })
        .limit(PAGE);
      if (watermark) q = q.gt("updated_at", watermark);

      const { data, error } = await q;
      if (error) break; // RLS/permission/transient — keep prior cache & watermark
      const rows = (data as Array<Record<string, any>>) || [];
      if (rows.length === 0) break;

      await putRecords(resource, rows);
      const newest = rows[rows.length - 1]?.updated_at as string | undefined;
      if (newest && newest !== watermark) watermark = newest;
      if (rows.length < PAGE) break;
    }
  } catch {
    // swallow — offline resilience
  }

  const meta: MasterSyncMeta = {
    resource,
    watermark,
    syncedAt: new Date().toISOString(),
    count: await countRecords(resource),
  };
  await putMeta(meta).catch(() => {});
  return meta;
}

let running = false;

/** Delta-sync every master resource. Safe to call on boot and on reconnect. */
export async function runMasterDataDeltaSync(): Promise<MasterSyncMeta[]> {
  if (running || !isOnline()) return getMasterSyncStatus();
  running = true;
  try {
    const results: MasterSyncMeta[] = [];
    for (const resource of MASTER_RESOURCES) {
      results.push(await syncResource(resource));
    }
    return results;
  } finally {
    running = false;
  }
}

/** Snapshot of what is cached locally and when it last synced. */
export async function getMasterSyncStatus(): Promise<MasterSyncMeta[]> {
  const out: MasterSyncMeta[] = [];
  for (const resource of MASTER_RESOURCES) {
    const meta = await getMeta(resource);
    out.push(
      meta ?? {
        resource,
        watermark: null,
        syncedAt: null,
        count: await countRecords(resource).catch(() => 0),
      },
    );
  }
  return out;
}
