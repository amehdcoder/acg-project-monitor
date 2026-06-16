import type { User } from "@supabase/supabase-js";
import { hashOfflinePassword, verifyOfflinePassword } from "@/lib/offlineAuthCrypto";
import { sealRecord, unsealRecord } from "@/lib/deviceCrypto";
import { logOfflineAuditEvent } from "@/lib/offlineAuditLog";

const DB_NAME = "acg_offline_auth";
const DB_VERSION = 1;
const STORE = "credentials";
const LEGACY_PREFIX = "ces_auth_cache_";

export interface OfflineAuthCredential {
  email: string;
  user_id: string;
  passwordHash: string;
  salt?: string;
  iterations?: number;
  algo?: string;
  user: User;
  profile: any | null;
  role: string | null;
  lastUpdated: string;
}

const normalizeEmail = (email: string) => (email || "").trim().toLowerCase();
const legacyKey = (email: string) => `${LEGACY_PREFIX}${normalizeEmail(email)}`;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "email" });
        store.createIndex("user_id", "user_id", { unique: false });
        store.createIndex("lastUpdated", "lastUpdated", { unique: false });
      }
    };
  });

const putIndexedCredential = async (credential: OfflineAuthCredential): Promise<void> => {
  const db = await openDB();
  const sealed = await sealRecord(credential as any, ["email", "user_id", "lastUpdated"]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(sealed);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getIndexedCredential = async (email: string): Promise<OfflineAuthCredential | null> => {
  const db = await openDB();
  const row: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(normalizeEmail(email));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  return row ? unsealRecord<OfflineAuthCredential>(row) : null;
};

const getAllIndexedCredentials = async (): Promise<OfflineAuthCredential[]> => {
  const db = await openDB();
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
  return Promise.all(rows.map((row) => unsealRecord<OfflineAuthCredential>(row)));
};

const readLocalCredential = async (email: string): Promise<OfflineAuthCredential | null> => {
  try {
    const raw = localStorage.getItem(legacyKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const credential = parsed?.__sealed
      ? await unsealRecord<OfflineAuthCredential>(parsed)
      : (parsed as OfflineAuthCredential);
    if (!credential?.passwordHash || !credential?.user) return null;
    credential.email = normalizeEmail(credential.email || email);
    credential.user_id = credential.user_id || credential.user?.id;
    credential.role = credential.role ?? null;
    credential.profile = credential.profile ?? null;
    credential.lastUpdated = credential.lastUpdated || new Date().toISOString();
    return credential;
  } catch {
    return null;
  }
};

const writeLocalCredential = async (credential: OfflineAuthCredential): Promise<void> => {
  try {
    const sealed = await sealRecord(credential as any, ["email", "user_id", "lastUpdated"]);
    localStorage.setItem(legacyKey(credential.email), JSON.stringify(sealed));
  } catch {
    // IndexedDB remains the primary durable store.
  }
};

export const saveOfflineCredential = async (args: {
  email: string;
  password: string;
  user: User;
  profile: any | null;
  role: string | null;
}): Promise<OfflineAuthCredential> => {
  const email = normalizeEmail(args.email || args.user.email || "");
  if (!email) throw new Error("Cannot cache offline credentials without an email.");
  const cred = await hashOfflinePassword(args.password);
  const credential: OfflineAuthCredential = {
    email,
    user_id: args.user.id,
    passwordHash: cred.passwordHash,
    salt: cred.salt,
    iterations: cred.iterations,
    algo: cred.algo,
    user: args.user,
    profile: args.profile,
    role: args.role,
    lastUpdated: new Date().toISOString(),
  };
  const results = await Promise.allSettled([
    putIndexedCredential(credential),
    writeLocalCredential(credential),
  ]);
  if (results.every((r) => r.status === "rejected")) {
    throw new Error("Offline credential cache could not be written on this device.");
  }
  void logOfflineAuditEvent("cache_seed", {
    email: credential.email,
    userId: credential.user_id,
    success: true,
    details: { role: credential.role },
  });
  return credential;
};

export const refreshOfflineCredentialSnapshot = async (args: {
  email: string;
  user?: User | null;
  profile: any | null;
  role: string | null;
}): Promise<void> => {
  const existing = await getOfflineCredential(args.email);
  if (!existing?.passwordHash) return;
  const credential: OfflineAuthCredential = {
    ...existing,
    user: args.user || existing.user,
    profile: args.profile,
    role: args.role ?? existing.role ?? null,
    user_id: (args.user || existing.user)?.id || existing.user_id,
    lastUpdated: new Date().toISOString(),
  };
  await Promise.allSettled([
    putIndexedCredential(credential),
    writeLocalCredential(credential),
  ]);
};

export const getOfflineCredential = async (email: string): Promise<OfflineAuthCredential | null> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const indexed = await getIndexedCredential(normalized);
    if (indexed?.passwordHash) return indexed;
  } catch {
    // Fall through to sealed local fallback / legacy migration.
  }
  const local = await readLocalCredential(normalized);
  if (local?.passwordHash) {
    try { await putIndexedCredential(local); } catch {}
    return local;
  }
  return null;
};

export const listOfflineCredentials = async (): Promise<OfflineAuthCredential[]> => {
  const byEmail = new Map<string, OfflineAuthCredential>();
  try {
    for (const credential of await getAllIndexedCredentials()) {
      if (credential?.passwordHash && credential?.email) byEmail.set(normalizeEmail(credential.email), credential);
    }
  } catch {}
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(LEGACY_PREFIX));
    for (const key of keys) {
      const credential = await readLocalCredential(key.slice(LEGACY_PREFIX.length));
      if (credential?.passwordHash && credential?.email && !byEmail.has(normalizeEmail(credential.email))) {
        byEmail.set(normalizeEmail(credential.email), credential);
        try { await putIndexedCredential(credential); } catch {}
      }
    }
  } catch {}
  return Array.from(byEmail.values()).sort((a, b) => (b.lastUpdated || "").localeCompare(a.lastUpdated || ""));
};

export const getLatestOfflineCredential = async (): Promise<OfflineAuthCredential | null> => {
  const credentials = await listOfflineCredentials();
  return credentials[0] || null;
};

export const verifyOfflineCredentialPassword = (password: string, credential: OfflineAuthCredential) =>
  verifyOfflinePassword(password, credential);

/**
 * Restore a previously-exported credential record directly into the device
 * cache, preserving its existing (PBKDF2) password hash. Used by the encrypted
 * device-profile import flow so users can log in offline after clearing browser
 * data — without needing the plaintext password.
 */
export const restoreOfflineCredential = async (
  credential: OfflineAuthCredential,
): Promise<void> => {
  const email = normalizeEmail(credential.email || credential.user?.email || "");
  if (!email || !credential.passwordHash || !credential.user) {
    throw new Error("Invalid credential profile — missing email, hash, or user.");
  }
  const record: OfflineAuthCredential = {
    ...credential,
    email,
    user_id: credential.user_id || credential.user.id,
    role: credential.role ?? null,
    profile: credential.profile ?? null,
    lastUpdated: credential.lastUpdated || new Date().toISOString(),
  };
  const results = await Promise.allSettled([
    putIndexedCredential(record),
    writeLocalCredential(record),
  ]);
  if (results.every((r) => r.status === "rejected")) {
    throw new Error("Could not write restored credential on this device.");
  }
};

export const removeOfflineCredential = async (email: string): Promise<void> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
  try { localStorage.removeItem(legacyKey(normalized)); } catch {}
};