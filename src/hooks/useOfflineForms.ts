import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import type { Question, GeofenceArea } from "@/components/FormBuilder/types";
import { sealRecord, unsealRecord, unsealAll } from "@/lib/deviceCrypto";
import { useAuth } from "@/hooks/useAuth";
import { offlineFormKey, ownedOfflineForm, visibleOfflineForms } from "@/lib/offlineFormAccess";
import { downloadSelectedUserForms, OFFLINE_FORMS_UPDATED_EVENT } from "@/lib/offlineFormCache";
import type { FormDownloadForm, FormDownloadResult } from "@/lib/offlineFormDownload";

const DB_NAME = "acg_monitor_offline";
// Keep this version in lockstep with useOfflineStorage/offlineFormCache.
// v4 repairs devices that previously opened the same DB at v2 after another
// hook had upgraded it to v3, which caused IndexedDB VersionError and made
// offline forms disappear.
const DB_VERSION = 4;
const FORMS_STORE_NAME = "offline_forms";

interface FormSettings {
  requireLocation?: boolean;
  allowAnonymous?: boolean;
  offlineEnabled?: boolean;
  autoSave?: boolean;
  enforceGeofence?: boolean;
  autoSaveInterval?: number;
}

export interface OfflineForm {
  id: string;
  name: string;
  description: string | null;
  status: string;
  project_id: string;
  questions: Question[];
  geofence: GeofenceArea | null;
  settings: FormSettings;
  downloaded_at: string;
  updated_at: string;
}

// Initialize IndexedDB with forms store
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create pending_submissions store if it doesn't exist
      if (!db.objectStoreNames.contains("pending_submissions")) {
        const store = db.createObjectStore("pending_submissions", { keyPath: "id" });
        store.createIndex("form_id", "form_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
      
      // Create offline_forms store if it doesn't exist
      if (!db.objectStoreNames.contains(FORMS_STORE_NAME)) {
        const formStore = db.createObjectStore(FORMS_STORE_NAME, { keyPath: "id" });
        formStore.createIndex("project_id", "project_id", { unique: false });
        formStore.createIndex("downloaded_at", "downloaded_at", { unique: false });
      }

      // Stores owned by useOfflineStorage. They must also be created here
      // because whichever hook opens this shared database first performs the
      // version upgrade for the whole app.
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
};

const FORM_PLAIN_FIELDS = ["id", "project_id", "downloaded_at"];

// Save a form for offline use (encrypted at rest)
const saveFormOffline = async (form: OfflineForm, userId: string): Promise<void> => {
  const db = await initDB();
  const owned = (form as any).owner_user_id === userId && (form as any).form_id
    ? form
    : ownedOfflineForm(form, userId);
  const sealed = await sealRecord(owned, FORM_PLAIN_FIELDS);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readwrite");
    const store = tx.objectStore(FORMS_STORE_NAME);
    const request = store.put(sealed);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Get all offline forms (transparently decrypted)
const getOfflineForms = async (): Promise<OfflineForm[]> => {
  const db = await initDB();
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readonly");
    const request = tx.objectStore(FORMS_STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  return unsealAll<OfflineForm>(rows);
};

// Get a specific offline form
const getOfflineForm = async (formId: string): Promise<OfflineForm | null> => {
  const db = await initDB();
  const row: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readonly");
    const request = tx.objectStore(FORMS_STORE_NAME).get(formId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
  return row ? unsealRecord<OfflineForm>(row) : null;
};

// Remove an offline form
const removeOfflineForm = async (formId: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readwrite");
    const store = tx.objectStore(FORMS_STORE_NAME);
    const request = store.delete(formId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Check if a form is available offline
const isFormOffline = async (formId: string): Promise<boolean> => {
  const form = await getOfflineForm(formId);
  return form !== null;
};

export const useOfflineForms = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineForms, setOfflineForms] = useState<OfflineForm[]>([]);
  const [offlineFormIds, setOfflineFormIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load offline forms on mount
  const loadOfflineForms = useCallback(async () => {
    try {
      setLoading(true);
      const forms = visibleOfflineForms(await getOfflineForms(), userId);
      if (activeUserRef.current !== userId) return;
      setOfflineForms(forms);
      setOfflineFormIds(new Set(forms.map(f => f.id)));
    } catch (error) {
      console.error("Error loading offline forms:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setOfflineForms([]); setOfflineFormIds(new Set());
    const refresh = async () => {
      const forms = visibleOfflineForms(await getOfflineForms(), userId);
      if (cancelled) return;
      setOfflineForms(forms); setOfflineFormIds(new Set(forms.map(f => f.id))); setLoading(false);
    };
    void refresh().catch(() => { if (!cancelled) setLoading(false); });
    window.addEventListener("forms-project-access", refresh);
    window.addEventListener(OFFLINE_FORMS_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("forms-project-access", refresh);
      window.removeEventListener(OFFLINE_FORMS_UPDATED_EVENT, refresh);
    };
  }, [userId]);

  // No mount, reconnect or list event writes definitions. Only explicit choices do.
  const downloadForms = useCallback(async (forms: FormDownloadForm[]): Promise<FormDownloadResult> => {
    if (!userId) throw new Error("Sign in before downloading forms.");
    const result = await downloadSelectedUserForms(userId, forms.map(form => form.id), () => activeUserRef.current === userId);
    if (activeUserRef.current === userId) await loadOfflineForms();
    return result;
  }, [loadOfflineForms, userId]);

  const downloadForm = useCallback(async (form: FormDownloadForm): Promise<boolean> => {
    try {
      const result = await downloadForms([form]);
      toast({ title: result.updated ? "Form updated offline" : result.added ? "Form downloaded" : "Form is up to date", description: `"${form.name}" is available offline.` });
      return true;
    } catch (error) {
      toast({ title: "Download failed", description: error instanceof Error ? error.message : "Could not save form for offline use.", variant: "destructive" });
      return false;
    }
  }, [downloadForms]);

  // Prune stale cached forms. Removes any offline form whose id is NOT in the
  // authoritative server set. This eliminates "ghost" duplicates left behind
  // when a form was recreated/deduplicated on the server (the old id lingers in
  // IndexedDB and would otherwise render as a second, submission-less copy).
  // When scopeProjectId is provided, only forms in that project are pruned so
  // that caches for other projects (fetched separately) are preserved.
  const pruneStaleForms = useCallback(
    async (validIds: Iterable<string>, scopeProjectId?: string | null): Promise<number> => {
      try {
        const valid = new Set(validIds);
        const existing = visibleOfflineForms(await getOfflineForms(), userId);
        const stale = existing.filter(
          // A regular forms-table response cannot establish special-form staleness.
          // Revoked special grants hide these copies; only explicit removal deletes them.
          (f) => !f.id.startsWith("special:") && (!scopeProjectId || f.project_id === scopeProjectId) && !valid.has(f.id),
        );
        if (stale.length === 0) return 0;
        for (const f of stale) {
          if (userId) await removeOfflineForm(offlineFormKey(userId, f.id));
        }
        await loadOfflineForms();
        return stale.length;
      } catch (error) {
        console.error("Error pruning stale offline forms:", error);
        return 0;
      }
    },
    [loadOfflineForms, userId],
  );

  // Remove a form from offline storage
  const removeForm = useCallback(async (formId: string): Promise<boolean> => {
    try {
      if (!userId) return false;
      await removeOfflineForm(offlineFormKey(userId, formId));
      await loadOfflineForms();
      
      toast({
        title: "Form Removed",
        description: "Form removed from offline storage.",
      });
      
      return true;
    } catch (error) {
      console.error("Error removing offline form:", error);
      toast({
        title: "Remove Failed",
        description: "Could not remove form from offline storage.",
        variant: "destructive",
      });
      return false;
    }
  }, [loadOfflineForms, userId]);

  // Get a specific offline form
  const getForm = useCallback(async (formId: string): Promise<OfflineForm | null> => {
    if (!userId) return null;
    const form = await getOfflineForm(offlineFormKey(userId, formId));
    return visibleOfflineForms(form ? [form] : [], userId)[0] || null;
  }, [userId]);

  // Check if a form is available offline
  const isFormAvailableOffline = useCallback((formId: string): boolean => {
    return offlineFormIds.has(formId);
  }, [offlineFormIds]);

  return {
    isOnline,
    offlineForms,
    offlineFormIds,
    loading,
    downloadForm,
    downloadForms,
    removeForm,
    pruneStaleForms,
    getForm,
    isFormAvailableOffline,
    refreshOfflineForms: loadOfflineForms,
  };
};

export default useOfflineForms;
