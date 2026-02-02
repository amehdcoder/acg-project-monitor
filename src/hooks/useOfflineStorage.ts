import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 1;
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

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back Online",
        description: "Connection restored. Syncing pending submissions...",
      });
      syncPendingSubmissions();
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
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await getPendingSubmissions();
      setPendingCount(pending.length);
    } catch (error) {
      console.error("Error getting pending count:", error);
    }
  }, []);

  // Save submission (either to Supabase or offline storage)
  const saveSubmission = useCallback(
    async (
      formId: string,
      userId: string,
      data: Record<string, any>,
      location: { lat: number; lng: number } | null = null,
      withinGeofence: boolean | null = null
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

      // Check if we're online
      const currentlyOnline = navigator.onLine;
      
      if (currentlyOnline) {
        try {
          console.log("Attempting to save submission to server:", { formId, userId, submissionId });
          
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
            })
            .select()
            .single();

          if (error) {
            console.error("Supabase insert error:", error);
            throw error;
          }

          console.log("Submission saved successfully:", result.id);
          
          // Update the form's last_used_at timestamp
          await supabase
            .from("forms")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", formId);

          return { success: true, offline: false, id: result.id };
        } catch (error: any) {
          console.error("Error saving to Supabase, storing offline:", error);
          
          // Check if it's an RLS or auth error
          if (error.code === "42501" || error.message?.includes("policy")) {
            toast({
              title: "Permission Error",
              description: "You don't have permission to submit this form. Please contact an administrator.",
              variant: "destructive",
            });
            return { success: false, offline: false, id: submissionId };
          }
          
          // Fall back to offline storage for network errors
          await addToOfflineStorage(submission);
          await updatePendingCount();
          
          toast({
            title: "Saved Offline",
            description: "Connection issue detected. Your submission is saved locally and will sync when you're back online.",
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

  // Sync all pending submissions
  const syncPendingSubmissions = useCallback(async (): Promise<{
    synced: number;
    failed: number;
  }> => {
    // Check current online status
    const currentlyOnline = navigator.onLine;
    
    if (!currentlyOnline) {
      toast({
        title: "You're Offline",
        description: "Please connect to the internet to sync pending submissions.",
        variant: "destructive",
      });
      return { synced: 0, failed: 0 };
    }
    
    if (isSyncing) {
      return { synced: 0, failed: 0 };
    }

    setIsSyncing(true);
    let synced = 0;
    let failed = 0;

    try {
      const pending = await getPendingSubmissions();
      
      console.log(`Starting sync of ${pending.length} pending submissions...`);

      if (pending.length === 0) {
        toast({
          title: "All Synced",
          description: "No pending submissions to sync.",
        });
        return { synced: 0, failed: 0 };
      }

      for (const submission of pending) {
        try {
          console.log(`Syncing submission ${submission.id}...`);
          
          // First check if this submission already exists (avoid duplicates)
          const { data: existing } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("id", submission.id)
            .maybeSingle();

          if (existing) {
            // Already synced, just remove from offline storage
            console.log(`Submission ${submission.id} already exists, removing from offline storage`);
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
            // Check if it's a duplicate key error (already synced)
            if (error.code === "23505") {
              console.log(`Submission ${submission.id} already synced (duplicate key)`);
              await removeFromOfflineStorage(submission.id);
              synced++;
            } else {
              throw error;
            }
          } else {
            console.log(`Successfully synced submission ${submission.id}`);
            
            // Update the form's last_used_at timestamp
            await supabase
              .from("forms")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", submission.form_id);
              
            await removeFromOfflineStorage(submission.id);
            synced++;
          }
        } catch (error: any) {
          console.error("Error syncing submission:", submission.id, error);
          
          // Update retry count
          const newRetryCount = submission.retryCount + 1;
          if (newRetryCount >= 5) {
            // Remove after 5 failed attempts
            console.log(`Submission ${submission.id} failed 5 times, removing`);
            await removeFromOfflineStorage(submission.id);
            failed++;
          } else {
            await updateRetryCount(submission.id, newRetryCount);
            failed++;
          }
        }
      }

      await updatePendingCount();

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
      setIsSyncing(false);
    }
  }, [isSyncing, updatePendingCount]);

  // Get all pending submissions for UI
  const getPending = useCallback(async () => {
    return getPendingSubmissions();
  }, []);

  // Clear all pending (use with caution)
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
  };
};

export default useOfflineStorage;
