// Offline sign-in brute-force protection.
//
// Offline login verifies a PBKDF2 hash entirely on-device, so without a server
// to enforce rate limits an attacker who has the device could try passwords as
// fast as the CPU allows. This module adds a per-account, device-side throttle:
// after a few failed attempts the account is locked out for an exponentially
// growing cooldown. State is sealed with the device key (AES-GCM) in IndexedDB,
// so it cannot be trivially read or reset by editing localStorage, and it
// survives sign-out (offline credentials persist by design).
//
// A successful offline (or online) login clears the counter for that account.

import { sealRecord, unsealRecord } from "@/lib/deviceCrypto";

const DB_NAME = "acg_offline_auth_throttle";
const DB_VERSION = 1;
const STORE = "attempts";

// After this many consecutive failures the lockout schedule kicks in.
const FREE_ATTEMPTS = 5;
// Cooldown schedule (ms) applied once FREE_ATTEMPTS is exceeded. The last
// value repeats for every further failure.
const LOCK_SCHEDULE_MS = [
  30_000, // 30s
  60_000, // 1m
  5 * 60_000, // 5m
  15 * 60_000, // 15m
  60 * 60_000, // 1h
];

interface AttemptRecord {
  email: string;
  failures: number;
  // Epoch ms until which the account is locked. 0 when not locked.
  lockedUntil: number;
  lastFailureAt: number;
}

const normalizeEmail = (email: string) => (email || "").trim().toLowerCase();

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "email" });
      }
    };
  });

const readRecord = async (email: string): Promise<AttemptRecord | null> => {
  try {
    const db = await openDB();
    const row: any = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(normalizeEmail(email));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return row ? await unsealRecord<AttemptRecord>(row) : null;
  } catch {
    return null;
  }
};

const writeRecord = async (rec: AttemptRecord): Promise<void> => {
  try {
    const db = await openDB();
    const sealed = await sealRecord(rec as any, ["email"]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(sealed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best-effort: never block login on throttle persistence failure */
  }
};

const removeRecord = async (email: string): Promise<void> => {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(normalizeEmail(email));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
};

const lockDelayFor = (failures: number): number => {
  const over = failures - FREE_ATTEMPTS;
  if (over <= 0) return 0;
  const idx = Math.min(over - 1, LOCK_SCHEDULE_MS.length - 1);
  return LOCK_SCHEDULE_MS[idx];
};

const humanizeMs = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
};

export interface LockStatus {
  locked: boolean;
  remainingMs: number;
  message?: string;
}

/** Check whether offline sign-in is currently locked for this account. */
export const checkOfflineLock = async (email: string): Promise<LockStatus> => {
  const rec = await readRecord(email);
  if (!rec || !rec.lockedUntil) return { locked: false, remainingMs: 0 };
  const remaining = rec.lockedUntil - Date.now();
  if (remaining <= 0) return { locked: false, remainingMs: 0 };
  return {
    locked: true,
    remainingMs: remaining,
    message: `Too many failed offline attempts. Try again in ${humanizeMs(remaining)}.`,
  };
};

/** Record a failed offline password attempt and return the resulting lock. */
export const registerOfflineFailure = async (email: string): Promise<LockStatus> => {
  const existing = await readRecord(email);
  const failures = (existing?.failures ?? 0) + 1;
  const delay = lockDelayFor(failures);
  const lockedUntil = delay > 0 ? Date.now() + delay : 0;
  await writeRecord({
    email: normalizeEmail(email),
    failures,
    lockedUntil,
    lastFailureAt: Date.now(),
  });
  if (lockedUntil > 0) {
    return {
      locked: true,
      remainingMs: delay,
      message: `Too many failed offline attempts. Try again in ${humanizeMs(delay)}.`,
    };
  }
  const left = FREE_ATTEMPTS - failures;
  return {
    locked: false,
    remainingMs: 0,
    message: left > 0 ? `Invalid password (Offline). ${left} attempt${left === 1 ? "" : "s"} left before lockout.` : undefined,
  };
};

/** Clear the failure counter — call after any successful sign-in. */
export const clearOfflineFailures = (email: string): Promise<void> => removeRecord(email);
