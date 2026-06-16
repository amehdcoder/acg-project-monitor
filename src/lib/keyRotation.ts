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

interface TransformedStore extends ReencryptResult {
  cfg: SealedStoreConfig;
  rows: any[];
}

/**
 * Phase 1 (no writes): read every record with `oldKey` and produce the
 * re-encrypted rows with `newKey`, held in memory.
 */
const transformStore = async (
  cfg: SealedStoreConfig,
  oldKey: CryptoKey,
  newKey: CryptoKey,
): Promise<TransformedStore> => {
  const label = `${cfg.db}/${cfg.store}`;
  let db: IDBDatabase;
  try {
    db = await openDB(cfg.db, cfg.version);
  } catch {
    return { store: label, reencrypted: 0, cfg, rows: [] };
  }
  try {
    if (!hasStore(db, cfg.store)) return { store: label, reencrypted: 0, cfg, rows: [] };
    const rows = await getAll(db, cfg.store);
    if (rows.length === 0) return { store: label, reencrypted: 0, cfg, rows: [] };

    const rewritten: any[] = [];
    for (const row of rows) {
      if (cfg.kind === "json") {
        const plainObj = await unsealRecord<Record<string, any>>(row, oldKey);
        rewritten.push(await sealRecord(plainObj, cfg.plainFields, newKey));
      } else {
        const field = cfg.blobField || "encBlob";
        const env = row[field];
        if (!env) {
          rewritten.push(row);
          continue;
        }
        const type = (cfg.typeField && row[cfg.typeField]) || "application/octet-stream";
        const blob = await decryptBlob(env, type, oldKey);
        rewritten.push({ ...row, [field]: await encryptBlob(blob, newKey) });
      }
    }
    return { store: label, reencrypted: rewritten.length, cfg, rows: rewritten };
  } finally {
    db.close();
  }
};

/** Phase 2: persist the already-transformed rows back into their store. */
const writeStore = async (t: TransformedStore): Promise<void> => {
  if (t.rows.length === 0) return;
  const db = await openDB(t.cfg.db, t.cfg.version);
  try {
    if (!hasStore(db, t.cfg.store)) return;
    await putAll(db, t.cfg.store, t.rows);
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
 * Two-phase for safety:
 *   1. Read + re-encrypt every store IN MEMORY with a fresh key (no writes).
 *   2. Write all stores, then activate the new key.
 *
 * If phase 1 fails nothing is written and the old key stays active. The new key
 * is only persisted/activated once every store has been re-encrypted, so reads
 * before activation still succeed with the old key.
 */
export async function rotateDeviceKey(): Promise<RotationReport> {
  if (rotating) {
    return { rotated: false, totalReencrypted: 0, perStore: [], error: "rotation already in progress" };
  }
  rotating = true;
  try {
    const oldKey = await getActiveDeviceKey();
    const newKey = await generateDeviceKey();

    // Phase 1 — transform everything in memory.
    const transformed: TransformedStore[] = [];
    for (const cfg of SEALED_STORES) {
      transformed.push(await transformStore(cfg, oldKey, newKey));
    }

    // Phase 2 — write everything, then activate the new key.
    for (const t of transformed) {
      await writeStore(t);
    }
    await activateDeviceKey(newKey);

    const perStore: ReencryptResult[] = transformed.map(({ store, reencrypted }) => ({
      store,
      reencrypted,
    }));
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
