// Warm-cache the current user's accessible forms into the offline store right
// after login, so a freshly-authenticated user can collect data offline even
// if they never opened the Forms page while online.
//
// Writes into the SAME IndexedDB database/store that `useOfflineForms` reads
// from (`acg_monitor_offline` → `offline_forms`), so cached forms appear
// wherever the offline reader is used.

import { supabase } from "@/integrations/supabase/client";
import { sealRecord } from "@/lib/deviceCrypto";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 2;
const FORMS_STORE = "offline_forms";
const PENDING_STORE = "pending_submissions";

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
    };
  });

const putForm = (db: IDBDatabase, form: any): Promise<void> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE, "readwrite");
    const req = tx.objectStore(FORMS_STORE).put(form);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });

interface WarmCacheCtx {
  userId: string;
  isAdmin?: boolean;
  role?: string | null;
}

/**
 * Resolve which form rows the user can access, then persist a complete,
 * re-renderable snapshot of each into the offline store.
 */
export const warmCacheUserForms = async (ctx: WarmCacheCtx): Promise<number> => {
  if (!navigator.onLine || !ctx.userId) return 0;
  try {
    let formIds: string[] | null = null;

    if (!ctx.isAdmin) {
      // Regular users: forms assigned directly + forms from assigned projects.
      const [formAssign, projAssign] = await Promise.all([
        supabase.from("user_form_assignments").select("form_id").eq("user_id", ctx.userId),
        supabase.from("user_project_assignments").select("project_id").eq("user_id", ctx.userId),
      ]);
      const direct = (formAssign.data || []).map((a: any) => a.form_id);
      const projectIds = (projAssign.data || []).map((a: any) => a.project_id);
      let fromProjects: string[] = [];
      if (projectIds.length > 0) {
        const { data } = await supabase.from("forms").select("id").in("project_id", projectIds);
        fromProjects = (data || []).map((f: any) => f.id);
      }
      formIds = [...new Set([...direct, ...fromProjects])];
      if (formIds.length === 0) return 0;
    }

    let query = supabase.from("forms").select("*");
    if (formIds) query = query.in("id", formIds);
    const { data: formsData, error } = await query;
    if (error || !formsData) return 0;

    const db = await openDB();
    let cached = 0;
    for (const form of formsData) {
      const allItems = ((form.questions as unknown as any[]) || []);
      const offlineForm = {
        id: form.id,
        name: form.name,
        description: form.description ?? null,
        status: form.status,
        project_id: form.project_id,
        // Keep grouped + ungrouped items together so the offline copy is complete.
        questions: allItems,
        geofence: (form.geofence as any) ?? null,
        settings: (form.settings as any) ?? {},
        downloaded_at: new Date().toISOString(),
        updated_at: (form as any).updated_at || new Date().toISOString(),
      };
      try {
        await putForm(db, await sealRecord(offlineForm, ["id", "project_id", "downloaded_at"]));
        cached++;
      } catch {
        /* skip a single bad row */
      }
    }
    return cached;
  } catch (e) {
    console.warn("warmCacheUserForms failed:", e);
    return 0;
  }
};
