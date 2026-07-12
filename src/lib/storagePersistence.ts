// Defensive storage guarantees for offline-first field devices.
// ─────────────────────────────────────────────────────────────────────────
// 1. Requests *persistent* storage via the StorageManager API so the device OS
//    exempts our IndexedDB data (offline queues, saved forms, audit ledger)
//    from automated background eviction / disk-cleansing routines.
// 2. Exposes a quota estimate so the UI can warn the field worker before the
//    device runs out of space and the offline queue is put at risk.
//
// Every call is best-effort and never throws — a browser without the API (old
// Android WebView) simply degrades gracefully.

export interface StorageEstimateResult {
  /** Bytes currently used by this origin (best estimate). */
  usage: number;
  /** Total bytes granted to this origin (best estimate). */
  quota: number;
  /** Fraction of quota still available, 0..1. */
  availableRatio: number;
  /** Fraction of quota already used, 0..1. */
  usedRatio: number;
  /** True when the browser could actually report numbers. */
  supported: boolean;
}

const PERSIST_FLAG_KEY = "amehnities_storage_persist_granted";

/**
 * Ask the browser to mark this origin's storage as persistent. Returns true
 * when persistence is (already) granted. Safe to call on every app start.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;

    // If already persisted, don't re-prompt.
    if (navigator.storage.persisted) {
      const already = await navigator.storage.persisted();
      if (already) {
        try { localStorage.setItem(PERSIST_FLAG_KEY, "1"); } catch {}
        return true;
      }
    }

    const granted = await navigator.storage.persist();
    try { localStorage.setItem(PERSIST_FLAG_KEY, granted ? "1" : "0"); } catch {}
    return granted;
  } catch {
    return false;
  }
}

/** Whether persistent storage was granted in a previous session (cheap read). */
export function wasPersistentStorageGranted(): boolean {
  try {
    return localStorage.getItem(PERSIST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Read the current storage usage/quota estimate. Never throws. */
export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  const fallback: StorageEstimateResult = {
    usage: 0,
    quota: 0,
    availableRatio: 1,
    usedRatio: 0,
    supported: false,
  };
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return fallback;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota || quota <= 0) return fallback;
    const usedRatio = Math.min(1, Math.max(0, usage / quota));
    return {
      usage,
      quota,
      availableRatio: 1 - usedRatio,
      usedRatio,
      supported: true,
    };
  } catch {
    return fallback;
  }
}

/** Human-friendly byte formatter for banners / diagnostics. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
