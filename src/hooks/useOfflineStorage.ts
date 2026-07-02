import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { sealRecord, unsealRecord, unsealAll } from "@/lib/deviceCrypto";

const DB_NAME = "acg_monitor_offline";
const DB_VERSION = 3;
const STORE_NAME = "pending_submissions";
const CONFLICT_STORE = "edit_conflicts";

interface PendingSubmission {
  id: string;
  form_id: string;
  user_id: string;
  data: Record<string, any>;
  location: { lat: number; lng: number } | null;
  within_geofence: boolean | null;
  submission_type: string;
  created_at: string;
  retryCount: number;
  /**
   * When true this queued row is an EDIT of an existing server submission,
   * not a brand-new capture. Edits are synced with a conflict-safe rule
   * (see doSync) instead of a blind insert.
   */
  is_edit?: boolean;
  /**
   * On-device moment the change was made. Used as the last-write-wins clock
   * so an offline edit never overwrites a NEWER server record.
   */
  client_updated_at?: string;
}

/** Recorded when an offline edit is rejected because the server was newer. */
export interface EditConflict {
  id: string;               // conflict record id
  submission_id: string;    // the form_submissions row
  form_id: string;
  user_id: string;
  offline_data: Record<string, any>;
  server_data: Record<string, any>;
  offline_updated_at: string;
  server_updated_at: string;
  detected_at: string;
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
      // NEW: Drafts store for auto-save functionality
      if (!db.objectStoreNames.contains("autosave_drafts")) {
        const draftStore = db.createObjectStore("autosave_drafts", { keyPath: "id" });
        draftStore.createIndex("form_id", "form_id", { unique: false });
        draftStore.createIndex("updated_at", "updated_at", { unique: false });
      }
      // NEW (v3): Conflict log for offline edits that lost to newer server data.
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflictStore = db.createObjectStore(CONFLICT_STORE, { keyPath: "id" });
        conflictStore.createIndex("submission_id", "submission_id", { unique: false });
        conflictStore.createIndex("detected_at", "detected_at", { unique: false });
      }

    };

  });
};

// Add a submission to offline storage
const SUBMISSION_PLAIN_FIELDS = ["id", "form_id", "created_at"];

const addToOfflineStorage = async (submission: PendingSubmission): Promise<void> => {
  const db = await initDB();
  const sealed = await sealRecord(submission, SUBMISSION_PLAIN_FIELDS);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(sealed);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Get all pending submissions (transparently decrypted)
const getPendingSubmissions = async (): Promise<PendingSubmission[]> => {
  const db = await initDB();
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  return unsealAll<PendingSubmission>(rows);
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

// Update retry count (re-seals the record)
const updateRetryCount = async (id: string, retryCount: number): Promise<void> => {
  const db = await initDB();
  const existing: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const getRequest = tx.objectStore(STORE_NAME).get(id);
    getRequest.onsuccess = () => resolve(getRequest.result);
    getRequest.onerror = () => reject(getRequest.error);
  });
  if (!existing) return;
  const submission = await unsealRecord<PendingSubmission>(existing);
  submission.retryCount = retryCount;
  const sealed = await sealRecord(submission, SUBMISSION_PLAIN_FIELDS);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const putReq = tx.objectStore(STORE_NAME).put(sealed);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
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

  // Robust connectivity check using a real network request
  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    try {
      // Use a tiny HEAD request to confirm real internet access
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      clearTimeout(timeout);
      return response.ok || response.status === 401 || response.status === 406;
    } catch {
      return false;
    }
  }, []);

  // Core sync logic extracted to avoid stale closures
  const doSync = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    // Double-check with a real connectivity test
    const reallyOnline = await checkConnectivity();
    if (!reallyOnline) {
      setIsOnline(false);
      return { synced: 0, failed: 0 };
    }

    setIsOnline(true);

    if (isSyncingRef.current) {
      return { synced: 0, failed: 0 };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
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

      // ---- Scalable batched drain ----
      // Previously each row cost two network round-trips (a duplicate-check
      // SELECT + an INSERT), processed strictly sequentially. On a device with
      // thousands of queued field visits that drains far too slowly. We now
      // upsert in chunks (one request per chunk, duplicates ignored server-side
      // via the id primary key) and only fall back to per-row inserts when a
      // chunk fails — so a single bad row never blocks the rest and nothing is
      // ever lost.
      const CHUNK = 200;
      const toRow = (s: PendingSubmission) => ({
        id: s.id,
        form_id: s.form_id,
        user_id: s.user_id,
        data: s.data,
        location: s.location,
        within_geofence: s.within_geofence,
        submission_type: s.submission_type || "regular",
        status: "sent",
        submitted_at: s.created_at,
        synced_at: new Date().toISOString(),
      });
      const touchedFormIds = new Set<string>();

      for (let i = 0; i < pending.length; i += CHUNK) {
        if (!navigator.onLine) break;
        const slice = pending.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("form_submissions")
          .upsert(slice.map(toRow), { onConflict: "id", ignoreDuplicates: true });

        if (!error) {
          // Whole chunk landed (or duplicates were ignored) — clear locally.
          await Promise.all(slice.map((s) => removeFromOfflineStorage(s.id)));
          slice.forEach((s) => touchedFormIds.add(s.form_id));
          synced += slice.length;
          continue;
        }

        // Chunk failed — fall back to per-row so one offender can't block peers.
        for (const submission of slice) {
          if (!navigator.onLine) break;
          try {
            const { error: rowErr } = await supabase
              .from("form_submissions")
              .upsert(toRow(submission), { onConflict: "id", ignoreDuplicates: true });
            if (rowErr && rowErr.code !== "23505") throw rowErr;
            await removeFromOfflineStorage(submission.id);
            touchedFormIds.add(submission.form_id);
            synced++;
          } catch (rowError: any) {
            console.error("Error syncing submission:", submission.id, rowError);
            // Never delete failed field submissions automatically. A persistent
            // server/RLS/network problem must keep retrying until it succeeds or
            // an admin intentionally repairs it; dropping after N attempts caused
            // real field visits to disappear from dashboards.
            await updateRetryCount(submission.id, submission.retryCount + 1);
            failed++;
          }
        }
      }

      // Touch last_used_at once per distinct form instead of once per row.
      if (touchedFormIds.size > 0) {
        await supabase
          .from("forms")
          .update({ last_used_at: new Date().toISOString() })
          .in("id", Array.from(touchedFormIds));
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
  }, [checkConnectivity]);

  // Attempt sync if there are pending items
  const trySyncIfNeeded = useCallback(async () => {
    const pending = await getPendingSubmissions();
    setPendingCount(pending.length);
    if (pending.length > 0 && !isSyncingRef.current) {
      doSync();
    }
  }, [doSync]);

  // Monitor online/offline status with navigator events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back Online",
        description: "Connection restored. Syncing pending submissions...",
      });
      // Delay slightly to allow network to stabilize, then sync
      setTimeout(() => trySyncIfNeeded(), 2000);
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
  }, [trySyncIfNeeded, updatePendingCount]);

  // Network Information API: detect mobile data / wifi changes
  useEffect(() => {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!connection) return;

    const handleConnectionChange = () => {
      console.log("Network connection changed:", connection.type, connection.effectiveType);
      // When connection type changes (e.g., mobile data turned on), try syncing
      if (navigator.onLine) {
        setIsOnline(true);
        setTimeout(() => trySyncIfNeeded(), 2000);
      }
    };

    connection.addEventListener("change", handleConnectionChange);
    return () => connection.removeEventListener("change", handleConnectionChange);
  }, [trySyncIfNeeded]);

  // Visibility change: sync when app comes to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        trySyncIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [trySyncIfNeeded]);

  // Periodic sync check - every 30 seconds when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      trySyncIfNeeded();
    }, 15000);

    return () => clearInterval(interval);
  }, [isOnline, trySyncIfNeeded]);

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
        submission_type: submissionType,
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

          // Fire-and-forget: trigger automated data quality check
          supabase.functions.invoke("auto-data-quality", { body: { trigger: "submission", formId } }).catch(() => {});

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

  // --- Draft Management (encrypted at rest) ---
  const saveDraft = useCallback(async (formId: string, userId: string, data: Record<string, any>) => {
    const db = await initDB();
    const id = `draft_${formId}_${userId}`;
    const sealed = await sealRecord(
      { id, form_id: formId, user_id: userId, data, updated_at: new Date().toISOString() },
      ["id", "form_id", "updated_at"],
    );
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("autosave_drafts", "readwrite");
      const store = tx.objectStore("autosave_drafts");
      const request = store.put(sealed);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }, []);

  const getDraft = useCallback(async (formId: string, userId: string): Promise<Record<string, any> | null> => {
    const db = await initDB();
    const id = `draft_${formId}_${userId}`;
    const row: any = await new Promise((resolve, reject) => {
      const tx = db.transaction("autosave_drafts", "readonly");
      const request = tx.objectStore("autosave_drafts").get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    if (!row) return null;
    const unsealed = await unsealRecord<{ data?: Record<string, any> }>(row);
    return unsealed?.data || null;
  }, []);

  const clearDraft = useCallback(async (formId: string, userId: string) => {
    const db = await initDB();
    const id = `draft_${formId}_${userId}`;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("autosave_drafts", "readwrite");
      const store = tx.objectStore("autosave_drafts");
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
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
    // Drafts
    saveDraft,
    getDraft,
    clearDraft,
  };
};


export default useOfflineStorage;
