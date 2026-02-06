import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import type { Question, GeofenceArea } from "@/components/FormBuilder/types";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 2;
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
    };
  });
};

// Save a form for offline use
const saveFormOffline = async (form: OfflineForm): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readwrite");
    const store = tx.objectStore(FORMS_STORE_NAME);
    const request = store.put(form);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Get all offline forms
const getOfflineForms = async (): Promise<OfflineForm[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readonly");
    const store = tx.objectStore(FORMS_STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

// Get a specific offline form
const getOfflineForm = async (formId: string): Promise<OfflineForm | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FORMS_STORE_NAME, "readonly");
    const store = tx.objectStore(FORMS_STORE_NAME);
    const request = store.get(formId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
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
  useEffect(() => {
    loadOfflineForms();
  }, []);

  const loadOfflineForms = useCallback(async () => {
    try {
      setLoading(true);
      const forms = await getOfflineForms();
      setOfflineForms(forms);
      setOfflineFormIds(new Set(forms.map(f => f.id)));
    } catch (error) {
      console.error("Error loading offline forms:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Download a form for offline use
  const downloadForm = useCallback(async (form: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    project_id: string;
    questions: Question[];
    geofence: GeofenceArea | null;
    settings: FormSettings;
    updated_at?: string;
  }): Promise<boolean> => {
    try {
      const offlineForm: OfflineForm = {
        id: form.id,
        name: form.name,
        description: form.description,
        status: form.status,
        project_id: form.project_id,
        questions: form.questions,
        geofence: form.geofence,
        settings: form.settings,
        downloaded_at: new Date().toISOString(),
        updated_at: form.updated_at || new Date().toISOString(),
      };

      await saveFormOffline(offlineForm);
      await loadOfflineForms();
      
      toast({
        title: "Form Downloaded",
        description: `"${form.name}" is now available offline.`,
      });
      
      return true;
    } catch (error) {
      console.error("Error downloading form:", error);
      toast({
        title: "Download Failed",
        description: "Could not save form for offline use.",
        variant: "destructive",
      });
      return false;
    }
  }, [loadOfflineForms]);

  // Remove a form from offline storage
  const removeForm = useCallback(async (formId: string): Promise<boolean> => {
    try {
      await removeOfflineForm(formId);
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
  }, [loadOfflineForms]);

  // Get a specific offline form
  const getForm = useCallback(async (formId: string): Promise<OfflineForm | null> => {
    return getOfflineForm(formId);
  }, []);

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
    removeForm,
    getForm,
    isFormAvailableOffline,
    refreshOfflineForms: loadOfflineForms,
  };
};

export default useOfflineForms;
