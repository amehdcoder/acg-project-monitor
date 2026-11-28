// Persist only explicitly selected, freshly authorized form definitions.
// Updates never touch drafts, submissions or another account's library.

import { sealRecord, unsealAll } from "@/lib/deviceCrypto";
import { fetchProjectFormCatalogue } from "./projectFormCatalogue";
import { planOfflineFormChanges } from "./offlineFormPlan";
import type { FormDownloadResult } from "./offlineFormDownload";
import { visibleOfflineForms } from "./offlineFormAccess";

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

export async function readDownloadedForm(userId: string, collector: string): Promise<Record<string, any> | null> {
  const db = await openDB();
  try { return visibleOfflineForms((await readAllForms(db)) as Array<Record<string, any> & { id: string; project_id: string }>, userId).find(form => form.settings?.specialCollector === collector) || null; }
  finally { db.close(); }
}

const applyPlan = async (
  db: IDBDatabase,
  plan: ReturnType<typeof planOfflineFormChanges>,
  isCurrentAccount: () => boolean,
): Promise<void> => {
  if (!plan.puts.length && !plan.removeKeys.length) return;
  const sealed = [];
  for (const form of plan.puts) {
    sealed.push(await sealRecord(form, ["id", "project_id", "downloaded_at"]));
  }
  if (!isCurrentAccount()) throw new Error("Your account changed. Select forms again.");
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

export async function downloadSelectedUserForms(
  userId: string,
  selectedIds: string[],
  isCurrentAccount: () => boolean = () => true,
): Promise<FormDownloadResult> {
  if (!userId || !isCurrentAccount()) throw new Error("Sign in before downloading forms.");
  if (!selectedIds.length) return { added: 0, updated: 0, unchanged: 0 };
  if (!navigator.onLine) throw new Error("Connect to download new forms or updates.");
  const authorized = await fetchProjectFormCatalogue(userId);
  const ids = new Set(selectedIds);
  const chosen = authorized.filter(form => ids.has(form.id));
  if (chosen.length !== ids.size) throw new Error("Your form access has changed. Refresh the list and select again.");
  if (!isCurrentAccount()) throw new Error("Your account changed. Select forms again.");
  if (chosen.some(form => form.settings?.specialCollector === "bloomberg_form")) {
    const { prewarmBloombergOffline } = await import("./bloomberg/offlineSchoolCache");
    if (await prewarmBloombergOffline(userId) === 0) throw new Error("The school register could not be saved. Reconnect and try downloading again.");
  }
  const db = await openDB();
  try {
    const existing = await readAllForms(db);
    const plan = planOfflineFormChanges(existing, chosen, userId);
    await applyPlan(db, plan, isCurrentAccount);
    const result = { added: plan.addedForms.length, updated: plan.updatedForms.length, unchanged: plan.unchangedForms.length };
    window.dispatchEvent(new CustomEvent(OFFLINE_FORMS_UPDATED_EVENT, { detail: { ...result, userId } }));
    return result;
  } finally {
    db.close();
  }
}
