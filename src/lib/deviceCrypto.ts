// Device-bound encryption-at-rest for offline data.
//
// All cached forms and offline-collected responses persisted in IndexedDB are
// encrypted with an AES-GCM 256 key that is generated once per device and stored
// as a NON-EXTRACTABLE CryptoKey. Because the raw key bytes can never be read
// back out of the browser (the Web Crypto API refuses to export a
// non-extractable key), simply reading the IndexedDB contents — or the keystore
// itself — does not reveal the plaintext. The data is only usable from within
// this origin on this device.
//
// Records are "sealed" as envelopes: a small set of plaintext fields needed for
// IndexedDB keys/indexes are preserved, and everything else is encrypted into a
// single opaque `__sealed` blob. Blobs (media) are encrypted byte-for-byte.

const KEY_DB = "acg_device_keystore";
const KEY_DB_VERSION = 1;
const KEY_STORE = "keys";
const KEY_ID = "device-key-v1";

let cachedKey: CryptoKey | null = null;
let keyPromise: Promise<CryptoKey> | null = null;

const openKeyDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, KEY_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
    };
  });

const readStoredKey = async (): Promise<CryptoKey | null> => {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const req = tx.objectStore(KEY_STORE).get(KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey) || null);
    req.onerror = () => reject(req.error);
  });
};

const writeStoredKey = async (key: CryptoKey): Promise<void> => {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/** Resolve (and lazily create + persist) the device's non-extractable key. */
export async function getDeviceKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    try {
      const existing = await readStoredKey();
      if (existing) {
        cachedKey = existing;
        return existing;
      }
    } catch {
      /* fall through to generate */
    }
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable — raw bytes can never leave the browser
      ["encrypt", "decrypt"],
    );
    try {
      await writeStoredKey(key);
    } catch {
      /* in-memory only if persistence fails */
    }
    cachedKey = key;
    return key;
  })();
  return keyPromise;
}

const toB64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromB64 = (b64: string): ArrayBuffer => {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
};

/** Encrypt a JSON-serialisable value. Returns a compact `iv.ct` base64 string. */
export async function encryptJSON(value: unknown): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `${toB64(iv.buffer)}.${toB64(ct)}`;
}

/** Decrypt a string produced by encryptJSON. */
export async function decryptJSON<T = any>(payload: string): Promise<T> {
  const key = await getDeviceKey();
  const [ivB64, ctB64] = payload.split(".");
  const iv = fromB64(ivB64);
  const ct = fromB64(ctB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

interface SealedRecord {
  __sealed: string;
  [plainField: string]: any;
}

const isSealed = (rec: any): rec is SealedRecord =>
  rec && typeof rec === "object" && typeof rec.__sealed === "string";

/**
 * Seal a record for storage: keep `plainFields` (needed for keyPath/indexes) in
 * the clear, encrypt everything else into `__sealed`.
 */
export async function sealRecord(
  record: Record<string, any>,
  plainFields: string[] = ["id"],
): Promise<SealedRecord> {
  const plain: Record<string, any> = {};
  const secret: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    if (plainFields.includes(k)) plain[k] = v;
    else secret[k] = v;
  }
  return { ...plain, __sealed: await encryptJSON(secret) };
}

/** Reverse of sealRecord. Passes through already-plaintext (legacy) records. */
export async function unsealRecord<T = any>(record: any): Promise<T> {
  if (!isSealed(record)) return record as T;
  const { __sealed, ...plain } = record;
  try {
    const secret = await decryptJSON<Record<string, any>>(__sealed);
    return { ...plain, ...secret } as T;
  } catch {
    // Key mismatch / corruption — return what we can rather than crash.
    return plain as T;
  }
}

export async function unsealAll<T = any>(records: any[]): Promise<T[]> {
  return Promise.all((records || []).map((r) => unsealRecord<T>(r)));
}

/** Encrypt a Blob's bytes. Returns an envelope safe to store in IndexedDB. */
export async function encryptBlob(
  blob: Blob,
): Promise<{ __encBlob: true; iv: string; ct: ArrayBuffer; type: string }> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await blob.arrayBuffer();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
  return { __encBlob: true, iv: toB64(iv.buffer), ct, type: blob.type };
}

/** Decrypt an envelope produced by encryptBlob back into a Blob. */
export async function decryptBlob(env: any, fallbackType = "application/octet-stream"): Promise<Blob> {
  if (!env || env.__encBlob !== true) {
    // Legacy plaintext blob.
    return env instanceof Blob ? env : new Blob([env], { type: fallbackType });
  }
  const key = await getDeviceKey();
  const iv = fromB64(env.iv);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, env.ct);
  return new Blob([plaintext], { type: env.type || fallbackType });
}
