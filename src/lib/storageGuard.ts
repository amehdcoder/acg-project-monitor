/**
 * Local storage quota guard.
 *
 * Symptom this fixes: sign-in failing with
 *   "Failed to execute 'setItem' on 'Storage': Setting the value of
 *    'sb-<project>-auth-token' exceeded the quota."
 *
 * The app caches a lot of offline material in `localStorage` (dashboard KPI
 * caches, satellite prewarm hints, last-known-good geography, unread counts,
 * report schedules...). Once the ~5 MB origin quota fills up, EVERY subsequent
 * write throws — including the Supabase auth token write that completes login,
 * which is exactly what locks users out.
 *
 * Strategy:
 *  1. Never let a critical write fail. `Storage.prototype.setItem` is wrapped
 *     so a quota error triggers eviction of disposable cache entries (largest
 *     first) and the write is retried.
 *  2. Protected keys — the auth session, offline queues, drafts, device
 *     sessions and pending submissions — are never evicted; losing those would
 *     lose field data.
 *  3. At boot, if storage is already near the ceiling, disposable caches are
 *     pruned pre-emptively so the first login write has room.
 */

/** Keys that must never be evicted: auth, queues, unsent field data. */
const PROTECTED_PATTERNS: RegExp[] = [
  /auth[-_]?token/i,
  /^sb-/i,
  /supabase/i,
  /device[-_:]?session/i,
  /device[-_]?id/i,
  /queue/i,
  /pending/i,
  /draft/i,
  /saved[-_]?form/i,
  /offline[-_]?(submission|audit|auth)/i,
  /outbox/i,
  /programme[-_]module/i,
  /biometric_credentials/i,
];

/** Disposable, always-rebuildable caches — evicted first. */
const DISPOSABLE_PATTERNS: RegExp[] = [
  /cache/i,
  /_cache_/i,
  /\.lkg\./i,
  /prewarm/i,
  /warm/i,
  /snapshot/i,
  /prefetch/i,
  /geography/i,
  /grid3/i,
  /satellite/i,
  /tiles?/i,
  /unread/i,
  /drilldown/i,
  /analytics/i,
  /report_schedules/i,
  /resmask/i,
  /^detail_/i,
  /^kpi_/i,
];

const isProtected = (key: string) => PROTECTED_PATTERNS.some((p) => p.test(key));
const isDisposable = (key: string) =>
  !isProtected(key) && DISPOSABLE_PATTERNS.some((p) => p.test(key));

const isQuotaError = (err: unknown): boolean => {
  const e = err as { name?: string; code?: number; message?: string };
  if (!e) return false;
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(e.message || "")
  );
};

interface Entry { key: string; size: number }

const inventory = (store: Storage): Entry[] => {
  const out: Entry[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key) continue;
    let size = key.length;
    try { size += (store.getItem(key) || "").length; } catch { /* ignore */ }
    out.push({ key, size });
  }
  return out;
};

export const localStorageBytes = (): number => {
  try {
    return inventory(window.localStorage).reduce((a, e) => a + e.size, 0) * 2;
  } catch {
    return 0;
  }
};

/**
 * Free at least `needBytes` by dropping cache entries, largest first.
 * Pass `aggressive` to also drop any other non-protected key as a last resort.
 */
export const freeLocalStorage = (needBytes: number, aggressive = false): number => {
  let freed = 0;
  try {
    const store = window.localStorage;
    const entries = inventory(store)
      .filter((e) => (aggressive ? !isProtected(e.key) : isDisposable(e.key)))
      .sort((a, b) => b.size - a.size);
    for (const entry of entries) {
      try {
        store.removeItem(entry.key);
        freed += entry.size * 2;
      } catch { /* ignore */ }
      if (freed >= needBytes) break;
    }
  } catch { /* ignore */ }
  return freed;
};

/** Drop disposable caches when storage is already close to the ceiling. */
export const pruneLocalStorage = (thresholdBytes = 3_500_000): boolean => {
  try {
    if (localStorageBytes() < thresholdBytes) return false;
    freeLocalStorage(1_500_000);
    return true;
  } catch {
    return false;
  }
};

let installed = false;

/**
 * Wrap `Storage.prototype.setItem` so a full quota can never break sign-in.
 * Must run before the Supabase client (and anything else) writes.
 */
export const installStorageQuotaGuard = () => {
  if (installed || typeof window === "undefined" || !window.localStorage) return;
  installed = true;

  const proto = Storage.prototype;
  const original = proto.setItem;

  proto.setItem = function patchedSetItem(this: Storage, key: string, value: string) {
    try {
      return original.call(this, key, value);
    } catch (err) {
      if (!isQuotaError(err)) throw err;

      const need = Math.max((String(key).length + String(value ?? "").length) * 2, 512_000);

      // Pass 1 — evict disposable caches.
      freeLocalStorage(need);
      try {
        return original.call(this, key, value);
      } catch (err2) {
        if (!isQuotaError(err2)) throw err2;

        // Pass 2 — for critical writes (auth/session/queues) sacrifice any
        // other non-protected key rather than lose the login.
        if (isProtected(key)) {
          freeLocalStorage(need * 2, true);
          try {
            return original.call(this, key, value);
          } catch (err3) {
            if (!isQuotaError(err3)) throw err3;
          }
        }
        // Non-critical write: swallow so a cache write never breaks the UI.
        if (!isProtected(key)) return;
        throw err2;
      }
    }
  };

  // Give the very first auth write headroom on an already-full device.
  pruneLocalStorage();
};
