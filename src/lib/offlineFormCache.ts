// Warm-cache the current user's accessible forms into the offline store right
// after login. New and changed definitions are written; unchanged definitions
// keep their existing encrypted copy. A complete successful authorization read
// also prunes definitions whose access has been revoked, without touching saved
// drafts, finalized submissions, media, or any other account's library.

import { sealRecord, unsealAll } from "@/lib/deviceCrypto";
import { fetchAuthorizedForms } from "./authorizedForms";
import { planOfflineFormChanges } from "./offlineFormPlan";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 4;
const FORMS_STORE = "offline_forms";
const PENDING_STORE = "pending_submissions";
export const OFFLINE_FORMS_UPDATED_EVENT = "offline-forms-updated";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        const store = db.createObjectStore(PENDING_STORE, { keyPath: "id" });
        store.createIndex("form_id", "form_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(FORMS_STORE)) {
        const formStore = db.createObjectStore(FORMS_STORE, { keyPath: "id" });
        formStore.createIndex("project_id", "project_id", { unique: false });
        formStore.createIndex("downloaded_at", "downloaded_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("autosave_drafts")) {
        const draftStore = db.createObjectStore("autosave_drafts", { keyPath: "id" });
        draftStore.createIndex("form_id", "form_id", { unique: false });
        draftStore.createIndex("updated_at", "updated_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("edit_conflicts")) {
        const conflictStore = db.createObjectStore("edit_conflicts", { keyPath: "id" });
        conflictStore.createIndex("submission_id", "submission_id", { unique: false });
        conflictStore.createIndex("detected_at", "detected_at", { unique: false });
      }
    };
  });

const readAllForms = async (db: IDBDatabase): Promise<Record<string, any>[]> => {
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE, "readonly");
    const req = tx.objectStore(FORMS_STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
  return unsealAll<Record<string, any>>(rows);
};

const applyPlan = async (
  db: IDBDatabase,
  plan: ReturnType<typeof planOfflineFormChanges>,
): Promise<void> => {
  if (!plan.puts.length && !plan.removeKeys.length) return;
  const sealed = [];
  for (const form of plan.puts) {
    sealed.push(await sealRecord(form, ["id", "project_id", "downloaded_at"]));
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE, "readwrite");
    const store = tx.objectStore(FORMS_STORE);
    for (const form of sealed) store.put(form);
    for (const key of plan.removeKeys) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("offline_form_transaction_aborted"));
  });
};

interface WarmCacheCtx {
  userId: string;
  isAdmin?: boolean;
  role?: string | null;
}

export interface WarmCacheResult {
  /** Total authorized forms available offline after the completed refresh. */
  count: number;
  forms: { id: string; name: string; project_id: string }[];
  scopedToGrants: boolean;
  ok: boolean;
  userId: string;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  addedForms: { id: string; name: string; project_id: string }[];
  updatedForms: { id: string; name: string; project_id: string }[];
  syncedAt: string | null;
  error?: string;
}

const emptyResult = (ctx: WarmCacheCtx, error?: string): WarmCacheResult => ({
  count: 0,
  forms: [],
  scopedToGrants: !ctx.isAdmin,
  ok: false,
  userId: ctx.userId,
  added: 0,
  updated: 0,
  unchanged: 0,
  removed: 0,
  addedForms: [],
  updatedForms: [],
  syncedAt: null,
  error,
});

const inFlight = new Map<string, Promise<WarmCacheResult>>();
const syncStateKey = (userId: string) => `amehnities:forms:offline-sync:v1:${userId}`;

export const warmCacheUserForms = async (ctx: WarmCacheCtx): Promise<number> => {
  return (await warmCacheUserFormsDetailed(ctx)).count;
};

/**
 * Fetch and persist all currently authorized form definitions. Calls for the
 * same account share one in-flight refresh, so auth callbacks, realtime,
 * reconnect, focus and a manual tap cannot duplicate work or writes.
 */
export const warmCacheUserFormsDetailed = (ctx: WarmCacheCtx): Promise<WarmCacheResult> => {
  if (!ctx.userId) return Promise.resolve(emptyResult(ctx, "no_user"));
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return Promise.resolve(emptyResult(ctx, "offline"));
  }
  const running = inFlight.get(ctx.userId);
  if (running) return running;

  const promise = (async (): Promise<WarmCacheResult> => {
    let db: IDBDatabase | null = null;
    try {
      const formsData = await fetchAuthorizedForms(ctx.userId);
      db = await openDB();
      const existing = await readAllForms(db);
      const syncedAt = new Date().toISOString();
      const plan = planOfflineFormChanges(existing, formsData, ctx.userId, { prune: true, now: syncedAt });
      await applyPlan(db, plan);
      const forms = formsData.map((form: any) => ({
        id: String(form.id),
        name: String(form.name || "Untitled form"),
        project_id: String(form.project_id || ""),
      }));
      const result: WarmCacheResult = {
        count: forms.length,
        forms,
        scopedToGrants: !ctx.isAdmin,
        ok: true,
        userId: ctx.userId,
        added: plan.addedForms.length,
        updated: plan.updatedForms.length,
        unchanged: plan.unchangedForms.length,
        removed: plan.removeKeys.length,
        addedForms: plan.addedForms,
        updatedForms: plan.updatedForms,
        syncedAt,
      };
      try {
        localStorage.setItem(syncStateKey(ctx.userId), JSON.stringify({
          userId: ctx.userId,
          count: result.count,
          added: result.added,
          updated: result.updated,
          unchanged: result.unchanged,
          removed: result.removed,
          syncedAt,
        }));
      } catch { /* storage may be unavailable; IndexedDB remains authoritative */ }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(OFFLINE_FORMS_UPDATED_EVENT, { detail: result }));
      }
      return result;
    } catch (error) {
      console.warn("warmCacheUserForms failed:", error);
      return emptyResult(ctx, String((error as Error)?.message || error || "offline_form_sync_failed"));
    } finally {
      db?.close();
    }
  })();
  inFlight.set(ctx.userId, promise);
  void promise.finally(() => {
    if (inFlight.get(ctx.userId) === promise) inFlight.delete(ctx.userId);
  });
  return promise;
};
