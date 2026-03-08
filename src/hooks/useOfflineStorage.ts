import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 2;
const STORE_NAME = "pending_submissions";

interface PendingSubmission {
  id: string;
  form_id: string;
  user_id: string;
  data: Record<string, any>;
  location: { lat: number; lng: number } | null;
  within_geofence: boolean | null;
  created_at: string;
  retryCount: number;
}

// Initialize IndexedDB
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("form_id", "form_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
      // Keep offline_forms store in sync
      if (!db.objectStoreNames.contains("offline_forms")) {
        const formStore = db.createObjectStore("offline_forms", { keyPath: "id" });
        formStore.createIndex("project_id", "project_id", { unique: false });
        formStore.createIndex("downloaded_at", "downloaded_at", { unique: false });
      }
    };
  });
};

// Add a submission to offline storage
const addToOfflineStorage = async (submission: PendingSubmission): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(submission);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Get all pending submissions
const getPendingSubmissions = async (): Promise<PendingSubmission[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

// Remove a submission from offline storage
const removeFromOfflineStorage = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Update retry count
const updateRetryCount = async (id: string, retryCount: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const submission = getRequest.result;
      if (submission) {
        submission.retryCount = retryCount;
        store.put(submission);
      }
      resolve();
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const useOfflineStorage = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await getPendingSubmissions();
      setPendingCount(pending.length);
    } catch (error) {
      console.error("Error getting pending count:", error);
    }
  }, []);

  // Core sync logic extracted to avoid stale closures
  const doSync = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (!navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    if (isSyncingRef.current) {
      return { synced: 0, failed: 0 };
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    let synced = 0;
    let failed = 0;

    try {
      const pending = await getPendingSubmissions();
      console.log(`Starting sync of ${pending.length} pending submissions...`);

      if (pending.length === 0) {
        return { synced: 0, failed: 0 };
      }

      for (const submission of pending) {
        try {
          // Check for duplicates
          const { data: existing } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("id", submission.id)
            .maybeSingle();

          if (existing) {
            await removeFromOfflineStorage(submission.id);
            synced++;
            continue;
          }

          const { error } = await supabase.from("form_submissions").insert({
            id: submission.id,
            form_id: submission.form_id,
            user_id: submission.user_id,
            data: submission.data,
            location: submission.location,
            within_geofence: submission.within_geofence,
            status: "sent",
            submitted_at: submission.created_at,
            synced_at: new Date().toISOString(),
          });

          if (error) {
            if (error.code === "23505") {
              await removeFromOfflineStorage(submission.id);
              synced++;
            } else {
              throw error;
            }
          } else {
            await supabase
              .from("forms")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", submission.form_id);
            await removeFromOfflineStorage(submission.id);
            synced++;
          }
        } catch (error: any) {
          console.error("Error syncing submission:", submission.id, error);
          const newRetryCount = submission.retryCount + 1;
          if (newRetryCount >= 5) {
            await removeFromOfflineStorage(submission.id);
            failed++;
          } else {
            await updateRetryCount(submission.id, newRetryCount);
            failed++;
          }
        }
      }

      // Update pending count after sync
      const remainingPending = await getPendingSubmissions();
      setPendingCount(remainingPending.length);

      if (synced > 0) {
        toast({
          title: "Sync Complete",
          description: `Successfully synced ${synced} submission${synced > 1 ? "s" : ""}.`,
        });
      }

      if (failed > 0) {
        toast({
          title: "Some Submissions Failed",
          description: `${failed} submission${failed > 1 ? "s" : ""} failed to sync and will be retried.`,
          variant: "destructive",
        });
      }

      return { synced, failed };
    } catch (error) {
      console.error("Error during sync:", error);
      toast({
        title: "Sync Error",
        description: "An error occurred during sync. Please try again.",
        variant: "destructive",
      });
      return { synced, failed };
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back Online",
        description: "Connection restored. Syncing pending submissions...",
      });
      // Delay slightly to allow network to stabilize, then sync
      setTimeout(() => {
        doSync();
      }, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "You're Offline",
        description: "Submissions will be saved locally and synced when you're back online.",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending count on mount
    updatePendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [doSync, updatePendingCount]);

  // Periodic sync check - every 30 seconds when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(async () => {
      const pending = await getPendingSubmissions();
      setPendingCount(pending.length);
      if (pending.length > 0 && !isSyncingRef.current) {
        doSync();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, doSync]);

  // Save submission (either to Supabase or offline storage)
  const saveSubmission = useCallback(
    async (
      formId: string,
      userId: string,
      data: Record<string, any>,
      location: { lat: number; lng: number } | null = null,
      withinGeofence: boolean | null = null,
      submissionType: string = "regular"
    ): Promise<{ success: boolean; offline: boolean; id: string }> => {
      const submissionId = crypto.randomUUID();

      const submission: PendingSubmission = {
        id: submissionId,
        form_id: formId,
        user_id: userId,
        data,
        location,
        within_geofence: withinGeofence,
        created_at: new Date().toISOString(),
        retryCount: 0,
      };

      const currentlyOnline = navigator.onLine;

      if (currentlyOnline) {
        try {
          const { data: result, error } = await supabase
            .from("form_submissions")
            .insert({
              id: submissionId,
              form_id: formId,
              user_id: userId,
              data,
              location,
              within_geofence: withinGeofence,
              status: "sent",
              submitted_at: new Date().toISOString(),
              synced_at: new Date().toISOString(),
              submission_type: submissionType,
            })
            .select()
            .single();

          if (error) throw error;

          await supabase
            .from("forms")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", formId);

          return { success: true, offline: false, id: result.id };
        } catch (error: any) {
          if (error.code === "42501" || error.message?.includes("policy")) {
            toast({
              title: "Permission Error",
              description: "You don't have permission to submit this form.",
              variant: "destructive",
            });
            return { success: false, offline: false, id: submissionId };
          }

          // Fall back to offline storage
          await addToOfflineStorage(submission);
          await updatePendingCount();

          toast({
            title: "Saved Offline",
            description: "Connection issue. Saved locally and will sync when online.",
          });

          return { success: true, offline: true, id: submissionId };
        }
      } else {
        // Save to offline storage
        console.log("Device offline, saving to IndexedDB:", submissionId);
        await addToOfflineStorage(submission);
        await updatePendingCount();
        return { success: true, offline: true, id: submissionId };
      }
    },
    [updatePendingCount]
  );

  // Public sync function wrapping doSync
  const syncPendingSubmissions = useCallback(async () => {
    if (!navigator.onLine) {
      toast({
        title: "You're Offline",
        description: "Please connect to the internet to sync.",
        variant: "destructive",
      });
      return { synced: 0, failed: 0 };
    }
    return doSync();
  }, [doSync]);

  const getPending = useCallback(async () => {
    return getPendingSubmissions();
  }, []);

  const clearPending = useCallback(async () => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        setPendingCount(0);
        resolve();
      };
    });
  }, []);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    saveSubmission,
    syncPendingSubmissions,
    getPending,
    clearPending,
    updatePendingCount,
  };
};

export default useOfflineStorage;
