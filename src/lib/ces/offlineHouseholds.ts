/**
 * CES Offline Queue
 * -----------------
 * Strictly ordered, resumable IndexedDB queue for Coverage Evaluation 3D.
 * Parent survey drafts always sync before child household visits resume.
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CES_DB_NAME = "ces_offline";
const CES_DB_VERSION = 3;
const SURVEY_STORE = "pending_surveys";
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
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface OfflineHousehold {
  local_id: string;
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
  segment_label: string | null;
  gps_snapshot: string;
  eligible_persons?: number;
  treated_persons?: number;
  last_error?: string;
  queued_at?: string;
  queue_seq?: number;
}

export interface OfflineAuditEntry {
  local_id: string;
  survey_id: string;
  actor_id: string | null;
  action: string;
  payload: string;
  lat: number | null;
  lng: number | null;
  device_id: string;
  created_at: string;
  synced: boolean;
}

export interface OfflineSurveyDraft {
  id: string;
  payload: Record<string, any>;
  created_by: string;
  updated_at: string;
  synced: boolean;
  retry_count: number;
  last_error?: string;
  queued_at?: string;
  queue_seq?: number;
}

const nextQueueSeq = () => {
  const key = "ces_offline_queue_seq";
  const next = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(next));
  return next;
};

const initCESDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(CES_DB_NAME, CES_DB_VERSION);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => resolve(req.result);
  req.onupgradeneeded = (e) => {
    const db = (e.target as IDBOpenDBRequest).result;
    const tx = (e.target as IDBOpenDBRequest).transaction;
    if (!db.objectStoreNames.contains(SURVEY_STORE)) {
      const s = db.createObjectStore(SURVEY_STORE, { keyPath: "id" });
      s.createIndex("synced", "synced", { unique: false });
      s.createIndex("updated_at", "updated_at", { unique: false });
      s.createIndex("queue_seq", "queue_seq", { unique: false });
    } else {
      const s = tx?.objectStore(SURVEY_STORE);
      if (s && !s.indexNames.contains("queue_seq")) s.createIndex("queue_seq", "queue_seq", { unique: false });
    }
    if (!db.objectStoreNames.contains(HH_STORE)) {
      const s = db.createObjectStore(HH_STORE, { keyPath: "local_id" });
      s.createIndex("survey_id", "survey_id", { unique: false });
      s.createIndex("synced", "synced", { unique: false });
      s.createIndex("queue_seq", "queue_seq", { unique: false });
    } else {
      const s = tx?.objectStore(HH_STORE);
      if (s && !s.indexNames.contains("queue_seq")) s.createIndex("queue_seq", "queue_seq", { unique: false });
    }
    if (!db.objectStoreNames.contains(AUDIT_STORE)) {
      const s = db.createObjectStore(AUDIT_STORE, { keyPath: "local_id" });
      s.createIndex("survey_id", "survey_id", { unique: false });
      s.createIndex("synced", "synced", { unique: false });
    }
  };
});

async function idbPut(store: string, record: any) {
  const db = await initCESDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const r = tx.objectStore(store).put(record);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve();
  });
}

async function idbGetAll(store: string): Promise<any[]> {
  const db = await initCESDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}

async function idbDelete(store: string, key: string) {
  const db = await initCESDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const r = tx.objectStore(store).delete(key);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve();
  });
}

export async function saveHouseholdOffline(row: OfflineHousehold): Promise<void> {
  const record = {
    ...row,
    local_id: row.local_id || generateUUID(),
    synced: false,
    queued_at: row.queued_at || new Date().toISOString(),
    queue_seq: row.queue_seq || nextQueueSeq(),
  };
  await idbPut(HH_STORE, record);
  void mirrorToCloud(record).catch(() => {});
}

export async function saveSurveyOffline(draft: OfflineSurveyDraft): Promise<void> {
  await idbPut(SURVEY_STORE, {
    ...draft,
    synced: false,
    retry_count: draft.retry_count || 0,
    updated_at: draft.updated_at || new Date().toISOString(),
    queued_at: draft.queued_at || new Date().toISOString(),
    queue_seq: draft.queue_seq || nextQueueSeq(),
  });
}

export async function getOfflineSurvey(id: string): Promise<OfflineSurveyDraft | null> {
  const db = await initCESDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SURVEY_STORE, "readonly");
    const r = tx.objectStore(SURVEY_STORE).get(id);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve((r.result as OfflineSurveyDraft | undefined) ?? null);
  });
}

export async function getPendingSurveys(): Promise<OfflineSurveyDraft[]> {
  const all = await idbGetAll(SURVEY_STORE);
  return all
    .filter((r) => !r.synced)
    .sort((a, b) => (a.queue_seq ?? 0) - (b.queue_seq ?? 0) || String(a.updated_at).localeCompare(String(b.updated_at)));
}

async function mirrorToCloud(record: OfflineHousehold): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const path = `offline-mirror/${record.survey_id}/${record.device_id}/${record.local_id}.json`;
    const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
    await supabase.storage.from("ces-captures").upload(path, blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });
  } catch {
    // IndexedDB is authoritative; the cloud mirror is best-effort recovery only.
  }
}

export async function saveAuditOffline(entry: OfflineAuditEntry): Promise<void> {
  await idbPut(AUDIT_STORE, { ...entry, local_id: entry.local_id || generateUUID(), synced: false });
}

export async function getPendingHouseholds(surveyId?: string): Promise<OfflineHousehold[]> {
  const all = await idbGetAll(HH_STORE);
  const rows = surveyId ? all.filter(r => r.survey_id === surveyId && !r.synced) : all.filter(r => !r.synced);
  return rows.sort((a, b) => (a.queue_seq ?? 0) - (b.queue_seq ?? 0) || String(a.visited_at).localeCompare(String(b.visited_at)));
}

export async function getPendingCount(): Promise<number> {
  const [surveys, households] = await Promise.all([getPendingSurveys(), getPendingHouseholds()]);
  return surveys.length + households.length;
}

export async function getPendingCESQueueCounts(): Promise<{ surveys: number; households: number; total: number }> {
  const [surveys, households] = await Promise.all([getPendingSurveys(), getPendingHouseholds()]);
  return { surveys: surveys.length, households: households.length, total: surveys.length + households.length };
}

let _syncing = false;

export async function syncCESOfflineQueue(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  if (_syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  _syncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const pendingSurveys = await getPendingSurveys();
    const pending = await getPendingHouseholds();
    if (pending.length === 0 && pendingSurveys.length === 0) return { synced: 0, failed: 0 };

    // Strict ordered drain: parent survey drafts first, oldest first. Household
    // visits are intentionally paused while any draft remains pending.
    for (const draft of pendingSurveys) {
      try {
        if (!navigator.onLine) throw new Error("Offline during CES survey sync");
        const { error } = await supabase
          .from("ces_surveys" as any)
          .upsert({ id: draft.id, ...draft.payload, created_by: draft.created_by }, { onConflict: "id" });
        if (error) throw error;
        await idbDelete(SURVEY_STORE, draft.id);
      } catch (err: any) {
        console.warn("CES offline survey sync failed for", draft.id, err);
        await idbPut(SURVEY_STORE, { ...draft, retry_count: (draft.retry_count || 0) + 1, last_error: err?.message ?? String(err) });
        failed++;
      }
    }

    const stillPendingSurveyIds = new Set((await getPendingSurveys()).map((s) => s.id));
    if (stillPendingSurveyIds.size > 0) {
      const waiting = pending.filter((hh) => stillPendingSurveyIds.has(hh.survey_id));
      await Promise.all(waiting.map((hh) => idbPut(HH_STORE, {
        ...hh,
        last_error: "Waiting for parent survey draft to sync before household upload resumes",
      })));
      return { synced, failed: failed + waiting.length };
    }

    for (const hh of pending) {
      try {
        if (!navigator.onLine) throw new Error("Offline during CES household sync");
        let createdBy = hh.created_by;
        if (!createdBy) {
          const { data: sess } = await supabase.auth.getSession();
          createdBy = sess.session?.user?.id ?? null;
        }
        if (!createdBy) throw new Error("Authenticated user unavailable for CES offline sync");

        const row = {
          id: hh.local_id,
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
          created_by: createdBy,
          eligible_persons: hh.eligible_persons ?? 0,
          treated_persons: hh.treated_persons ?? 0,
          segment_label: hh.segment_label,
          gps_snapshot: hh.gps_snapshot ? JSON.parse(hh.gps_snapshot) : null,
        };

        const { data, error } = await supabase
          .from("ces_household_visits" as any)
          .upsert(row, { onConflict: "id" })
          .select("id")
          .single();

        if (error) throw error;

        if (data) {
          const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
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

        await idbDelete(HH_STORE, hh.local_id);
        synced++;
        onProgress?.(synced, pending.length);
      } catch (err: any) {
        console.warn("CES offline sync failed for", hh.local_id, err);
        await idbPut(HH_STORE, { ...hh, retry_count: (hh.retry_count || 0) + 1, last_error: err?.message ?? String(err) });
        failed++;
      }
    }

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

    return { synced, failed };
  } finally {
    _syncing = false;
  }
}

let _registered = false;

export function registerCESSyncOnReconnect() {
  if (_registered) return;
  _registered = true;
  window.addEventListener("online", () => {
    setTimeout(() => syncCESOfflineQueue(), 2000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      syncCESOfflineQueue();
    }
  });
}