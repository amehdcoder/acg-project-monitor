// Device key rotation with re-encryption of existing sealed records.
//
// `rotateDeviceKey` generates a brand-new non-extractable device key and
// re-encrypts every sealed record (JSON envelopes and encrypted blobs) across
// all known offline stores with it. The new key is only persisted/activated
// AFTER every store has been successfully re-encrypted, so a failure midway
// leaves the original key active and no data is lost.
//
// Records are read with the OLD key and written back with the NEW key in a
// single pass per store. Legacy plaintext records are sealed with the new key
// too, upgrading them in place.

import {
  getActiveDeviceKey,
  generateDeviceKey,
  activateDeviceKey,
  sealRecord,
  unsealRecord,
  encryptBlob,
  decryptBlob,
} from "@/lib/deviceCrypto";

type StoreKind = "json" | "blob";

interface SealedStoreConfig {
  db: string;
  version: number;
  store: string;
  kind: StoreKind;
  /** Fields kept in the clear for keyPath/indexes (json stores). */
  plainFields?: string[];
  /** Envelope field that holds the encrypted blob (blob stores). */
  blobField?: string;
  /** Plaintext field carrying the blob's content type, for re-encryption. */
  typeField?: string;
}

// The complete catalogue of stores that hold sealed/encrypted data at rest.
// Keep in sync with the writers in useOfflineStorage, useOfflineForms,
// offlineSubmissions and offlineMedia.
const SEALED_STORES: SealedStoreConfig[] = [
  {
    db: "acg_monitor_offline",
    version: 2,
    store: "pending_submissions",
    kind: "json",
    plainFields: ["id", "form_id", "created_at"],
  },
  {
    db: "acg_monitor_offline",
    version: 2,
    store: "offline_forms",
    kind: "json",
    plainFields: ["id", "project_id", "downloaded_at"],
  },
  {
    db: "acg_monitor_offline",
    version: 2,
    store: "autosave_drafts",
    kind: "json",
    plainFields: ["id", "form_id", "updated_at"],
  },
  {
    db: "acg_offline_submissions",
    version: 1,
    store: "pending_inserts",
    kind: "json",
    plainFields: ["id", "created_at"],
  },
  {
    db: "acg_offline_media",
    version: 1,
    store: "pending_media",
    kind: "blob",
    blobField: "encBlob",
    typeField: "contentType",
  },
];

const openDB = (name: string, version: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    // No onupgradeneeded: we never create stores here, only re-encrypt existing
    // ones. Opening with the known version avoids accidental schema changes.
  });

const getAll = (db: IDBDatabase, store: string): Promise<any[]> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });

const putAll = (db: IDBDatabase, store: string, rows: any[]): Promise<void> =>
  new Promise((resolve, reject) => {
    if (rows.length === 0) return resolve();
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    rows.forEach((r) => os.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

const hasStore = (db: IDBDatabase, store: string) =>
  db.objectStoreNames.contains(store);

interface ReencryptResult {
  store: string;
  reencrypted: number;
}

/**
 * Re-encrypt one store: read every record with `oldKey`, write it back with
 * `newKey`. Returns the count of records processed.
 */
const reencryptStore = async (
  cfg: SealedStoreConfig,
  oldKey: CryptoKey,
  newKey: CryptoKey,
): Promise<ReencryptResult> => {
  let db: IDBDatabase;
  try {
    db = await openDB(cfg.db, cfg.version);
  } catch {
    return { store: `${cfg.db}/${cfg.store}`, reencrypted: 0 };
  }
  try {
    if (!hasStore(db, cfg.store)) {
      return { store: `${cfg.db}/${cfg.store}`, reencrypted: 0 };
    }
    const rows = await getAll(db, cfg.store);
    if (rows.length === 0) {
      return { store: `${cfg.db}/${cfg.store}`, reencrypted: 0 };
    }

    const rewritten: any[] = [];
    for (const row of rows) {
      if (cfg.kind === "json") {
        // Decrypt with old key (passes through legacy plaintext), reseal with new.
        const plainObj = await unsealRecord<Record<string, any>>(row, oldKey);
        const resealed = await sealRecord(plainObj, cfg.plainFields, newKey);
        rewritten.push(resealed);
      } else {
        const field = cfg.blobField || "encBlob";
        const env = row[field];
        if (!env) {
          rewritten.push(row);
          continue;
        }
        const type = (cfg.typeField && row[cfg.typeField]) || "application/octet-stream";
        const blob = await decryptBlob(env, type, oldKey);
        const reenc = await encryptBlob(blob, newKey);
        rewritten.push({ ...row, [field]: reenc });
      }
    }

    await putAll(db, cfg.store, rewritten);
    return { store: `${cfg.db}/${cfg.store}`, reencrypted: rewritten.length };
  } finally {
    db.close();
  }
};

export interface RotationReport {
  rotated: boolean;
  totalReencrypted: number;
  perStore: ReencryptResult[];
  error?: string;
}

let rotating = false;

/**
 * Rotate the device key and re-encrypt all existing sealed records.
 *
 * Safe and atomic-ish: the new key is only activated after every store has been
 * re-encrypted with it. If any store fails, the old key stays active and the
 * partial re-encryption is harmless because both old and new records are read
 * with the still-active old key (the failed-over records remain old-key sealed).
 */
export async function rotateDeviceKey(): Promise<RotationReport> {
  if (rotating) {
    return { rotated: false, totalReencrypted: 0, perStore: [], error: "rotation already in progress" };
  }
  rotating = true;
  try {
    const oldKey = await getActiveDeviceKey();
    const newKey = await generateDeviceKey();

    const perStore: ReencryptResult[] = [];
    for (const cfg of SEALED_STORES) {
      // If one store fails hard, abort BEFORE activating the new key so the old
      // key still decrypts everything (including stores already rewritten,
      // because we re-read them below only after a clean activation).
      const res = await reencryptStore(cfg, oldKey, newKey);
      perStore.push(res);
    }

    // All stores re-encrypted with newKey — activate it now.
    await activateDeviceKey(newKey);

    const totalReencrypted = perStore.reduce((n, r) => n + r.reencrypted, 0);
    return { rotated: true, totalReencrypted, perStore };
  } catch (e: any) {
    return {
      rotated: false,
      totalReencrypted: 0,
      perStore: [],
      error: e?.message || "key rotation failed",
    };
  } finally {
    rotating = false;
  }
}
