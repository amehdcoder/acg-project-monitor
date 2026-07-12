/**
 * Cascading Sync Ledger.
 *
 * Locally-created reference entities (Community / Village / Location Hub) are
 * selected into form payloads while offline using their temporary `local-…`
 * ids. When connectivity returns the sync engine must:
 *
 *   1. Commit the new reference entity to the server FIRST (see
 *      `syncLocalEntities` in offlineReferenceData.ts) and retrieve its real
 *      database id.
 *   2. Cascade that server id into every dependent form payload BEFORE the
 *      payload is transmitted, so no submission ever lands on the server
 *      pointing at a phantom `local-…` id.
 *
 * This module owns step 2: a persisted local→server id map plus a deep-walk
 * resolver that rewrites any queued payload before it is sent.
 */

import { syncLocalEntities } from "@/lib/offlineReferenceData";

const LEDGER_KEY = "amehnities_reference_id_ledger";

type IdMap = Record<string, string>;

function loadLedger(): IdMap {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "{}") as IdMap;
  } catch {
    return {};
  }
}

function saveLedger(map: IdMap) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(map));
  } catch {
    /* storage full / unavailable — resolution still works in-memory this session */
  }
}

/** Merge newly-resolved ids into the persisted ledger. */
export function recordResolvedIds(map: IdMap): IdMap {
  const merged = { ...loadLedger(), ...map };
  saveLedger(merged);
  return merged;
}

/** The full known local→server id map. */
export function getLedger(): IdMap {
  return loadLedger();
}

/**
 * Deep-walk any value and replace any local reference id with its resolved
 * server id. Non-destructive: returns a new object/array; leaves untouched
 * everything that is not a known local id string.
 */
export function resolveReferences<T>(value: T, map: IdMap = loadLedger()): T {
  if (typeof value === "string") {
    return (map[value] ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveReferences(v, map)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      out[k] = resolveReferences(v, map);
    }
    return out as unknown as T;
  }
  return value;
}

/** True if a payload still references any unresolved `local-…` id. */
export function hasUnresolvedLocalRefs(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("local-");
  if (Array.isArray(value)) return value.some(hasUnresolvedLocalRefs);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasUnresolvedLocalRefs);
  }
  return false;
}

/**
 * Run the full cascade: commit pending reference drafts to the server, then
 * fold the resulting local→server ids into the persisted ledger. Returns the
 * complete ledger so the caller can rewrite queued payloads immediately.
 *
 * Safe to call repeatedly; drafts that are already committed are skipped.
 */
export async function cascadeReferenceEntities(): Promise<IdMap> {
  let resolved: IdMap = {};
  try {
    resolved = await syncLocalEntities();
  } catch {
    // offline or transient failure — keep whatever ledger we already have
  }
  return recordResolvedIds(resolved);
}
