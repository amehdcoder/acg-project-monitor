/**
 * Offline-first Geography Hierarchy cache
 * ────────────────────────────────────────────────────────────────────────
 * Models the State → LGA → Ward administrative hierarchy as a local
 * "lookup table" in the style of KoboToolbox `select_from_file` and
 * CommCare Lookup Tables:
 *
 *   • The canonical dataset ships in the JS bundle (`NIGERIA_ADMIN_DATA`,
 *     the INEC Electoral Wards Registry). That guarantees the hierarchy is
 *     available *synchronously and offline* the instant the app boots — no
 *     network round-trip is ever required to render the geography pickers
 *     (optimistic initialization).
 *
 *   • On first startup/login the complete hierarchy is persisted into
 *     IndexedDB *once*, stamped with a version. On every subsequent boot the
 *     stored copy is hydrated and the seed step is skipped entirely — exactly
 *     the "fetch once, then read from local storage" contract.
 *
 *   • All dropdown filtering (State → LGA → Ward) resolves purely in-memory
 *     from the hydrated hierarchy. There are NO per-change network / Supabase
 *     calls when a parent selector changes.
 *
 *   • Administrators can force a rebuild via `refreshGeographyHierarchy()`
 *     when the underlying administrative boundaries actually change; that is
 *     the only time the local dataset is rewritten.
 */

import { NIGERIA_ADMIN_DATA, type NigeriaAdminHierarchy } from "@/lib/nigeriaAdminData";

const DB_NAME = "amehnities_geography";
const DB_VERSION = 1;
const STORE = "hierarchy";
const RECORD_KEY = "state_lga_ward";

// Dataset fingerprint — bump implicitly whenever the bundled dataset changes so
// the stored copy is refreshed on next boot. Cheap, deterministic hash over the
// state/LGA counts keeps it stable across reloads without hashing ~9k strings.
const datasetVersion = (data: NigeriaAdminHierarchy): string => {
  const states = Object.keys(data);
  let lgaCount = 0;
  let wardCount = 0;
  for (const st of states) {
    const lgas = Object.keys(data[st] || {});
    lgaCount += lgas.length;
    for (const lg of lgas) wardCount += (data[st][lg] || []).length;
  }
  return `v1:${states.length}-${lgaCount}-${wardCount}`;
};

const BUNDLED_VERSION = datasetVersion(NIGERIA_ADMIN_DATA);

interface StoredHierarchy {
  key: string;
  version: string;
  data: NigeriaAdminHierarchy;
  cachedAt: number;
}

// ── In-memory hierarchy ───────────────────────────────────────────────────
// Seeded SYNCHRONOUSLY from the bundle at module load so the pickers are usable
// immediately (optimistic init). `initGeographyCache()` may later swap in the
// IndexedDB-hydrated copy, and `refreshGeographyHierarchy()` may replace it.
let memHierarchy: NigeriaAdminHierarchy = NIGERIA_ADMIN_DATA;
let memVersion: string = BUNDLED_VERSION;

// Sorted-state cache (invalidated when the in-memory hierarchy is swapped).
let statesCache: string[] | null = null;
const lgasCache = new Map<string, string[]>();
const wardsCache = new Map<string, string[]>();

const clearDerivedCaches = () => {
  statesCache = null;
  lgasCache.clear();
  wardsCache.clear();
};

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });

const idbGet = async (): Promise<StoredHierarchy | null> => {
  try {
    const db = await openDB();
    return await new Promise<StoredHierarchy | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve((req.result as StoredHierarchy) || null);
    });
  } catch {
    return null;
  }
};

const idbPut = async (record: StoredHierarchy): Promise<void> => {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {
    // Persistence is best-effort; the bundled dataset already covers reads.
  }
};

let initPromise: Promise<void> | null = null;

/**
 * Load the geography hierarchy into the local cache exactly once.
 *
 *   • If IndexedDB already holds a copy at the current dataset version, hydrate
 *     from it and skip any seeding (no network, no rewrite).
 *   • Otherwise persist the bundled dataset once so future boots read locally.
 *
 * Safe to call repeatedly (e.g. on every login) — it de-dupes via a shared
 * promise and never blocks the UI: the pickers already work from the
 * synchronously-seeded in-memory copy while this resolves.
 */
export function initGeographyCache(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const stored = await idbGet();
    if (stored && stored.version === BUNDLED_VERSION && stored.data && Object.keys(stored.data).length > 0) {
      // Local copy is present and current — use it, skip the seed entirely.
      memHierarchy = stored.data;
      memVersion = stored.version;
      clearDerivedCaches();
      return;
    }
    // Empty or stale cache → seed once from the bundled dataset.
    memHierarchy = NIGERIA_ADMIN_DATA;
    memVersion = BUNDLED_VERSION;
    clearDerivedCaches();
    await idbPut({
      key: RECORD_KEY,
      version: BUNDLED_VERSION,
      data: NIGERIA_ADMIN_DATA,
      cachedAt: Date.now(),
    });
  })();
  return initPromise;
}

/**
 * Force-rebuild the local geography dataset. Intended as a hidden admin
 * "Refresh Hierarchy Data" action, used only when administrative boundaries
 * are structurally modified. Rewrites the IndexedDB copy from the current
 * bundled dataset and refreshes the in-memory cache.
 *
 * Returns a small summary for admin feedback.
 */
export async function refreshGeographyHierarchy(): Promise<{ states: number; version: string; cachedAt: number }> {
  const cachedAt = Date.now();
  memHierarchy = NIGERIA_ADMIN_DATA;
  memVersion = BUNDLED_VERSION;
  clearDerivedCaches();
  await idbPut({ key: RECORD_KEY, version: BUNDLED_VERSION, data: NIGERIA_ADMIN_DATA, cachedAt });
  return { states: Object.keys(memHierarchy).length, version: memVersion, cachedAt };
}

// ── Synchronous, in-memory accessors (no network on parent change) ─────────

/** All state/region names, sorted. */
export function getCachedStates(): string[] {
  if (!statesCache) statesCache = Object.keys(memHierarchy).sort((a, b) => a.localeCompare(b));
  return statesCache;
}

/** LGAs for a state, filtered entirely in-memory from the cached hierarchy. */
export function getCachedLGAsForState(state: string): string[] {
  const key = state || "";
  const hit = lgasCache.get(key);
  if (hit) return hit;
  const bucket = memHierarchy[state];
  const list = bucket ? Object.keys(bucket).sort((a, b) => a.localeCompare(b)) : [];
  lgasCache.set(key, list);
  return list;
}

/** Wards for a state+LGA, filtered entirely in-memory from the cached hierarchy. */
export function getCachedWardsForLGA(state: string, lga: string): string[] {
  const key = `${state || ""}||${lga || ""}`;
  const hit = wardsCache.get(key);
  if (hit) return hit;
  const list = [...(memHierarchy[state]?.[lga] || [])].sort((a, b) => a.localeCompare(b));
  wardsCache.set(key, list);
  return list;
}

/** Current cached dataset version (for diagnostics / admin display). */
export function getGeographyVersion(): string {
  return memVersion;
}
