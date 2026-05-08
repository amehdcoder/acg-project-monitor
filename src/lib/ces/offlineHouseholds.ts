/**
 * CES Offline Household Visit Queue
 * -----------------------------------------
 * Dedicated IndexedDB store for CES household visits captured without connectivity.
 * The sync engine uploads pending rows to `ces_household_visits` + optional
 * `ces_blockchain_proof` when the device comes back online.
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CES_DB_NAME = "ces_offline";
const CES_DB_VERSION = 1;
const HH_STORE = "pending_households";
const AUDIT_STORE = "pending_audit_logs";

export function getDeviceId(): string {
  let d = localStorage.getItem("ces_device_id");
  if (!d) {
    d = `dev-${generateUUID().slice(0, 8)}`;
    localStorage.setItem("ces_device_id", d);
  }
  return d;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface OfflineHousehold {
  local_id: string;         // uuid generated on device
  survey_id: string;
  hh_number: string;
  latitude: number;
  longitude: number;
  gps_accuracy: number;
  coverage_status: string;
  commodity: string;
  notes: string;
  duplicate_reason: string | null;
  evidence_hash: string;
  device_id: string;
  visited_at: string;
  created_by: string | null;
  synced: boolean;
  retry_count: number;
  // Extra offline metadata
  segment_label: string | null;
  gps_snapshot: string;   // JSON of GPS reading at capture time
}

export interface OfflineAuditEntry {
  local_id: string;
  survey_id: string;
  actor_id: string | null;
  action: string;
  payload: string;  // JSON string
  lat: number | null;
  lng: number | null;
  device_id: string;
  created_at: string;
  synced: boolean;
}

// ─── DB Init ─────────────────────────────────────────────────────────────────

const initCESDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(CES_DB_NAME, CES_DB_VERSION);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => resolve(req.result);
  req.onupgradeneeded = (e) => {
    const db = (e.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(HH_STORE)) {
      const s = db.createObjectStore(HH_STORE, { keyPath: "local_id" });
      s.createIndex("survey_id", "survey_id", { unique: false });
      s.createIndex("synced", "synced", { unique: false });
    }
    if (!db.objectStoreNames.contains(AUDIT_STORE)) {
      const s = db.createObjectStore(AUDIT_STORE, { keyPath: "local_id" });
      s.createIndex("survey_id", "survey_id", { unique: false });
      s.createIndex("synced", "synced", { unique: false });
    }
  };
});

// ─── IDB helpers ─────────────────────────────────────────────────────────────

async function idbPut(store: string, record: any) {
  const db = await initCESDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    const r = s.put(record);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve();
  });
}

async function idbGetAll(store: string): Promise<any[]> {
  const db = await initCESDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const s = tx.objectStore(store);
    const r = s.getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}

async function idbDelete(store: string, key: string) {
  const db = await initCESDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    const r = s.delete(key);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve();
  });
}

// ─── Public save ─────────────────────────────────────────────────────────────

export async function saveHouseholdOffline(row: OfflineHousehold): Promise<void> {
  await idbPut(HH_STORE, { ...row, local_id: row.local_id || generateUUID(), synced: false });
}

export async function saveAuditOffline(entry: OfflineAuditEntry): Promise<void> {
  await idbPut(AUDIT_STORE, { ...entry, local_id: entry.local_id || generateUUID(), synced: false });
}

export async function getPendingHouseholds(surveyId?: string): Promise<OfflineHousehold[]> {
  const all = await idbGetAll(HH_STORE);
  if (surveyId) return all.filter(r => r.survey_id === surveyId && !r.synced);
  return all.filter(r => !r.synced);
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPendingHouseholds();
  return pending.length;
}

// ─── Sync engine ─────────────────────────────────────────────────────────────

let _syncing = false;

export async function syncCESOfflineQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number }> {
  if (_syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  _syncing = true;

  const pending = await getPendingHouseholds();
  if (pending.length === 0) { _syncing = false; return { synced: 0, failed: 0 }; }

  let synced = 0;
  let failed = 0;

  for (const hh of pending) {
    try {
      // Build the canonical DB row (strip local-only fields)
      const row = {
        survey_id: hh.survey_id,
        hh_number: hh.hh_number,
        latitude: hh.latitude,
        longitude: hh.longitude,
        gps_accuracy: hh.gps_accuracy,
        coverage_status: hh.coverage_status,
        commodity: hh.commodity,
        notes: hh.notes,
        duplicate_reason: hh.duplicate_reason,
        evidence_hash: hh.evidence_hash,
        device_id: hh.device_id,
        visited_at: hh.visited_at,
        synced_at: new Date().toISOString(),
        created_by: hh.created_by,
      };

      const { data, error } = await supabase
        .from("ces_household_visits" as any)
        .insert(row)
        .select("id")
        .single();

      if (error) throw error;

      // Mock blockchain proof insertion for this synced visit
      if (data) {
        const txHash = "0x" + Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("");
        await supabase.from("ces_blockchain_proof" as any).insert({
          survey_id: hh.survey_id,
          household_id: (data as any).id,
          evidence_hash: hh.evidence_hash,
          blockchain_tx_hash: txHash,
          block_number: Math.floor(Math.random() * 100000) + 40000000,
          chain_timestamp: new Date().toISOString(),
          status: "Verified",
        }).maybeSingle();
      }

      // Mark synced locally
      await idbPut(HH_STORE, { ...hh, synced: true });
      await idbDelete(HH_STORE, hh.local_id);
      synced++;
      onProgress?.(synced, pending.length);
    } catch (err: any) {
      console.warn("CES offline sync failed for", hh.local_id, err);
      const retries = (hh.retry_count || 0) + 1;
      if (retries >= 5) {
        await idbDelete(HH_STORE, hh.local_id);
        failed++;
      } else {
        await idbPut(HH_STORE, { ...hh, retry_count: retries });
        failed++;
      }
    }
  }

  // Sync pending audit logs too
  const pendingAudits = (await idbGetAll(AUDIT_STORE)).filter(r => !r.synced);
  for (const entry of pendingAudits) {
    try {
      await supabase.from("ces_audit_log" as any).insert({
        survey_id: entry.survey_id,
        actor_id: entry.actor_id,
        action: entry.action,
        payload: JSON.parse(entry.payload || "{}"),
        lat: entry.lat,
        lng: entry.lng,
        device_id: entry.device_id,
        created_at: entry.created_at,
      });
      await idbDelete(AUDIT_STORE, entry.local_id);
    } catch {
      // audit log failures are non-fatal
    }
  }

  if (synced > 0) {
    toast({
      title: "CES Sync Complete",
      description: `${synced} household visit${synced > 1 ? "s" : ""} synced to server.`,
      className: "bg-green-700 text-white",
    });
  }

  _syncing = false;
  return { synced, failed };
}

// Call this on network restore
export function registerCESSyncOnReconnect() {
  window.addEventListener("online", () => {
    setTimeout(() => syncCESOfflineQueue(), 2000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      syncCESOfflineQueue();
    }
  });
}
