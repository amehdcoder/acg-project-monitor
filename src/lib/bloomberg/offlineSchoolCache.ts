// Offline cache for the Bloomberg school register + the current user's cascade
// assignments, so the School Enrolment Validation form can fetch schools and the
// State→LGA→Ward→Community cascade even with no connectivity.
//
// Uses a DEDICATED IndexedDB database (not the shared offline DB) to avoid
// version-upgrade conflicts with the other offline modules. It holds the full
// ~2,800-row register, which can exceed the localStorage quota.

import { supabase } from "@/integrations/supabase/client";
import {
  BLOOMBERG_FORM_ID,
  normalizeMissingLabel,
  type BloombergSchool,
} from "@/lib/bloomberg/definition";

const DB_NAME = "amehnities_bloomberg_cache";
const DB_VERSION = 1;
const STORE = "cache";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
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

const SCHOOL_COLUMNS =
  "school_key,label,school_name,school_code,school_type,school_level,ownership,state,lga,ward,location,state_label,lga_label,ward_label,location_label";

/**
 * Eagerly download the FULL Bloomberg school register + the user's cascade
 * assignments and persist them into IndexedDB, so the School Enrolment
 * Validation form works fully offline even if the user never opened it while
 * online. Safe to call repeatedly; it's a best-effort online-only refresh.
 */
// In-memory guard so concurrent callers in the same tab don't each kick off a
// full register download.
let prewarmInFlight: Promise<number> | null = null;
// How long a freshly downloaded register stays "fresh" before we refetch it.
// The register changes rarely, so refetching on every token refresh / reconnect
// was the single biggest source of slow, repeated full-table scans.
const PREWARM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function prewarmBloombergOffline(userId: string): Promise<number> {
  if (!navigator.onLine) return 0;
  if (prewarmInFlight) return prewarmInFlight;

  // Skip entirely when we already hold a fresh cached register. This avoids
  // re-running the expensive RLS-filtered full-table scan on every session
  // restore, token refresh, or reconnect.
  try {
    const { schools, cachedAt } = await readCachedBloombergSchools();
    if (schools.length > 0 && cachedAt && Date.now() - cachedAt < PREWARM_TTL_MS) {
      return schools.length;
    }
  } catch {
    /* fall through and refetch */
  }

  prewarmInFlight = (async () => {
  try {
    const all: BloombergSchool[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("bloomberg_schools")
        .select(SCHOOL_COLUMNS)
        .order("school_name")
        .range(from, from + PAGE - 1);
      if (error) return 0; // network/db failure → keep any existing cache
      if (!data || data.length === 0) break;
      const normalized = (data as BloombergSchool[]).map((s) => ({
        ...s,
        ward_label: normalizeMissingLabel(s.ward_label),
        location_label: normalizeMissingLabel(s.location_label),
        label: normalizeMissingLabel(s.label),
      }));
      all.push(...normalized);
      if (data.length < PAGE) break;
    }

    if (all.length > 0) await cacheBloombergSchools(all);

    if (userId) {
      const { data: a, error } = await supabase
        .from("user_cascade_assignments")
        .select("field_key,value")
        .eq("user_id", userId)
        .eq("form_id", BLOOMBERG_FORM_ID);
      if (!error) {
        await cacheBloombergAssignments(
          userId,
          (a as { field_key: string; value: string }[]) || [],
        );
      }
    }
    return all.length;
  } catch {
    return 0;
  }
}
