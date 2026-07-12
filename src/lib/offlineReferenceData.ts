/**
 * Offline-first reference-data registry for location entities.
 *
 * Supervisors can register a new Community, Village, or Location Hub while
 * completely offline. Each locally-created entity gets a temporary UUID and an
 * `is_local_draft: true` flag so it instantly populates dropdowns across every
 * form. When connectivity returns, the sync engine commits drafts to the
 * server FIRST, retrieves the real database id, and cascades that id into any
 * dependent form payloads (see `referenceSyncLedger.ts`).
 *
 * A dedicated IndexedDB database keeps this store isolated from other offline
 * stores to avoid version conflicts.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReferenceEntityType = "community" | "village" | "location_hub";

export interface ReferenceLocation {
  id: string; // server uuid OR temp local uuid while draft
  entity_type: ReferenceEntityType;
  name: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  parent_id?: string | null;
  project_id?: string | null;
  is_local_draft?: boolean;
  /** original local uuid — retained after promotion so payload references resolve */
  local_ref?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

const DB_NAME = "amehnities_reference_data";
const DB_VERSION = 1;
const DRAFT_STORE = "local_drafts"; // entities created offline, awaiting sync
const CACHE_STORE = "server_cache"; // server entities cached for offline reads

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function getAll<T>(store: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store, "readonly").objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      })
  );
}

function put(store: string, value: any): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        t.objectStore(store).put(value);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}

function del(store: string, key: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        t.objectStore(store).delete(key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      })
  );
}

function genLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `local-${crypto.randomUUID()}`;
  } catch {
    /* ignore */
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True for any id that is still a locally-generated draft reference. */
export function isLocalDraftId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("local-");
}

/**
 * Register a new location entity locally. Works fully offline — returns
 * immediately with a temp uuid + `is_local_draft: true` so the UI can select it.
 */
export async function createLocalEntity(
  input: Omit<ReferenceLocation, "id" | "is_local_draft" | "local_ref" | "created_at" | "updated_at">
): Promise<ReferenceLocation> {
  const id = genLocalId();
  const now = new Date().toISOString();
  let created_by = input.created_by ?? null;
  if (!created_by) {
    try {
      const { data } = await supabase.auth.getUser();
      created_by = data.user?.id ?? null;
    } catch {
      /* offline — resolved at sync time */
    }
  }
  const entity: ReferenceLocation = {
    ...input,
    id,
    local_ref: id,
    is_local_draft: true,
    created_by,
    created_at: now,
    updated_at: now,
  };
  await put(DRAFT_STORE, entity);
  return entity;
}

/** All local drafts still awaiting sync. */
export async function getLocalDrafts(): Promise<ReferenceLocation[]> {
  const drafts = await getAll<ReferenceLocation>(DRAFT_STORE);
  return drafts.filter((d) => d.is_local_draft);
}

/** Merge server cache + local drafts into a single dropdown-ready list. */
export async function getMergedEntities(type?: ReferenceEntityType): Promise<ReferenceLocation[]> {
  const [cache, drafts] = await Promise.all([
    getAll<ReferenceLocation>(CACHE_STORE),
    getLocalDrafts(),
  ]);
  const merged = [...drafts, ...cache];
  const seen = new Set<string>();
  const out: ReferenceLocation[] = [];
  for (const e of merged) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (!type || e.entity_type === type) out.push(e);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Cache server rows locally for offline reads. */
export async function cacheServerEntities(rows: ReferenceLocation[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(CACHE_STORE, "readwrite");
    const store = t.objectStore(CACHE_STORE);
    rows.forEach((r) => store.put({ ...r, is_local_draft: false }));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/**
 * Pull the shared registry from the server (when online) and refresh the local
 * cache. Safe no-op on failure so the app keeps working offline.
 */
export async function refreshServerEntities(): Promise<ReferenceLocation[]> {
  try {
    const { data, error } = await supabase
      .from("reference_locations")
      .select("*")
      .order("name", { ascending: true });
    if (error || !data) return getAll<ReferenceLocation>(CACHE_STORE);
    const rows = data as unknown as ReferenceLocation[];
    await cacheServerEntities(rows);
    return rows;
  } catch {
    return getAll<ReferenceLocation>(CACHE_STORE);
  }
}

/**
 * Commit one local draft to the server and promote the cache entry.
 * Returns the resolved server id (or null if it could not be committed).
 * Idempotent via the (created_by, local_ref) unique key.
 */
export async function promoteDraft(localId: string): Promise<string | null> {
  const drafts = await getLocalDrafts();
  const draft = drafts.find((d) => d.id === localId);
  if (!draft) return null;

  let created_by = draft.created_by;
  if (!created_by) {
    const { data } = await supabase.auth.getUser();
    created_by = data.user?.id ?? null;
  }
  if (!created_by) return null;

  const payload = {
    entity_type: draft.entity_type,
    name: draft.name,
    state: draft.state ?? null,
    lga: draft.lga ?? null,
    ward: draft.ward ?? null,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    parent_id: isLocalDraftId(draft.parent_id) ? null : draft.parent_id ?? null,
    project_id: draft.project_id ?? null,
    local_ref: draft.local_ref ?? draft.id,
    created_by,
  };

  // Upsert on the idempotency key so retries never duplicate.
  const { data, error } = await supabase
    .from("reference_locations")
    .upsert(payload as any, { onConflict: "created_by,local_ref" })
    .select("*")
    .single();

  if (error || !data) return null;

  const server = data as unknown as ReferenceLocation;
  await cacheServerEntities([{ ...server, local_ref: payload.local_ref }]);
  await del(DRAFT_STORE, localId); // draft has graduated
  return server.id;
}

/**
 * Sync ALL pending drafts. Returns a map of localId → serverId so callers
 * can cascade the resolved ids into dependent payloads before transmitting.
 */
export async function syncLocalEntities(): Promise<Record<string, string>> {
  const drafts = await getLocalDrafts();
  const map: Record<string, string> = {};
  // hubs first so child village/community parent_id can resolve.
  const ordered = [...drafts].sort((a, b) =>
    a.entity_type === "location_hub" ? -1 : b.entity_type === "location_hub" ? 1 : 0
  );
  for (const draft of ordered) {
    // resolve a locally-created parent that may have synced earlier this pass.
    if (isLocalDraftId(draft.parent_id) && map[draft.parent_id!]) {
      draft.parent_id = map[draft.parent_id!];
      await put(DRAFT_STORE, draft);
    }
    const serverId = await promoteDraft(draft.id);
    if (serverId) map[draft.id] = serverId;
  }
  return map;
}
