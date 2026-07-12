// Offline-first media upload queue with client-side compression and
// resumable (TUS) uploads.
//
// Design pillars:
//  1. Client-side compression — phone photos are downscaled to <=1280px and
//     re-encoded to JPEG @70% BEFORE they ever touch IndexedDB, minimizing the
//     offline payload and the eventual network transfer.
//  2. Binary decoupling — form JSON is submitted through its own path so the
//     dashboard reflects data instantly; the (heavier) binary attachments live
//     in THIS queue and drain asynchronously in the background.
//  3. Resumable uploads — large binaries are uploaded via Supabase's TUS
//     resumable protocol in 6MB blocks. If the connection drops mid-transfer we
//     persist the byte offset and resume from the exact failed block instead of
//     restarting the whole file.
//
// Every media capture in the app should route through `queueOrUploadMedia`.

import { supabase } from "@/integrations/supabase/client";
import { encryptBlob, decryptBlob } from "@/lib/deviceCrypto";
import { compressImageFile } from "@/lib/net/resilientUpload";

const DB_NAME = "acg_offline_media";
const DB_VERSION = 1;
const STORE = "pending_media";

// ---- Compression defaults (per spec) --------------------------------------
const IMAGE_MAX_DIMENSION = 1280;
const IMAGE_JPEG_QUALITY = 0.7;

// ---- Resumable (TUS) upload constants -------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const RESUMABLE_ENDPOINT = `${SUPABASE_URL}/storage/v1/upload/resumable`;
const TUS_VERSION = "1.0.0";
// Supabase's resumable endpoint requires 6MB chunks (except the final chunk).
const CHUNK_SIZE = 6 * 1024 * 1024;

export interface PendingMedia {
  /** `${bucket}::${path}` — unique key */
  id: string;
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  upsert: boolean;
  created_at: string;
  attempts: number;
  last_error?: string | null;
  /** TUS upload URL once a resumable session has been created. */
  tusUrl?: string | null;
  /** Bytes already committed to the server; where a resume continues from. */
  uploadOffset?: number;
}

let flushing = false;
let listenersBound = false;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });

const putRecord = async (rec: PendingMedia): Promise<void> => {
  const db = await openDB();
  // Encrypt the blob bytes at rest; keep metadata plaintext for indexing.
  const { blob, ...meta } = rec;
  const stored: any = { ...meta, encBlob: await encryptBlob(blob) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const deleteRecord = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAllRecords = async (): Promise<PendingMedia[]> => {
  const db = await openDB();
  const rows: any[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
  return Promise.all(
    rows.map(async ({ encBlob, ...meta }) => {
      const blob = encBlob ? await decryptBlob(encBlob, meta.contentType) : meta.blob;
      return { ...meta, blob } as PendingMedia;
    }),
  );
};

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/**
 * Compress an image capture before it is stored/uploaded. Downscales to
 * <=1280px on the longest edge and re-encodes to JPEG @70%. Non-images and
 * anything that fails to decode are returned unchanged.
 */
async function compressForOffline(file: Blob, contentType: string): Promise<{ blob: Blob; contentType: string }> {
  if (!contentType.startsWith("image/") || contentType === "image/gif") {
    return { blob: file, contentType };
  }
  try {
    const asFile =
      file instanceof File
        ? file
        : new File([file], "capture", { type: contentType });
    const compressed = await compressImageFile(asFile, {
      maxDimension: IMAGE_MAX_DIMENSION,
      quality: IMAGE_JPEG_QUALITY,
      // Force re-encode even for modestly sized photos so widths are capped.
      maxBytes: 0,
    });
    return { blob: compressed, contentType: compressed.type || "image/jpeg" };
  } catch {
    return { blob: file, contentType };
  }
}

// ---- Resumable (TUS) helpers ----------------------------------------------

async function getAuthToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || SUPABASE_ANON;
  } catch {
    return SUPABASE_ANON;
  }
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/** Create a resumable upload session and return its TUS upload URL. */
async function createTusUpload(rec: PendingMedia): Promise<string> {
  const token = await getAuthToken();
  const metadata = [
    `bucketName ${b64(rec.bucket)}`,
    `objectName ${b64(rec.path)}`,
    `contentType ${b64(rec.contentType)}`,
    `cacheControl ${b64("3600")}`,
  ].join(",");

  const res = await fetch(RESUMABLE_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
      "tus-resumable": TUS_VERSION,
      "upload-length": String(rec.blob.size),
      "upload-metadata": metadata,
      "x-upsert": rec.upsert ? "true" : "false",
    },
  });
  if (!res.ok && res.status !== 201) throw new Error(`tus create failed (${res.status})`);
  const location = res.headers.get("location");
  if (!location) throw new Error("tus create returned no Location");
  // Location may be absolute or relative to the storage endpoint.
  return location.startsWith("http") ? location : `${RESUMABLE_ENDPOINT}/${location.replace(/^\/+/, "")}`;
}

/** Ask the server how many bytes it has already committed (resume point). */
async function getTusOffset(tusUrl: string): Promise<number | null> {
  const token = await getAuthToken();
  const res = await fetch(tusUrl, {
    method: "HEAD",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
      "tus-resumable": TUS_VERSION,
    },
  });
  if (!res.ok) return null;
  const offset = Number(res.headers.get("upload-offset"));
  return Number.isFinite(offset) ? offset : null;
}

/**
 * Upload a record via TUS, one 6MB block at a time, persisting the committed
 * offset after every block so a mid-transfer drop resumes from the exact block
 * that failed instead of restarting the whole file.
 */
async function resumableUpload(rec: PendingMedia): Promise<void> {
  let tusUrl = rec.tusUrl || null;
  let offset = rec.uploadOffset ?? 0;

  // Resume an existing session, or start a fresh one.
  if (tusUrl) {
    const serverOffset = await getTusOffset(tusUrl);
    if (serverOffset === null) {
      tusUrl = null; // stale/expired session — recreate below
      offset = 0;
    } else {
      offset = serverOffset;
    }
  }
  if (!tusUrl) {
    tusUrl = await createTusUpload(rec);
    offset = 0;
    await putRecord({ ...rec, tusUrl, uploadOffset: 0 });
  }

  const token = await getAuthToken();
  while (offset < rec.blob.size) {
    if (!isOnline()) throw new Error("offline mid-transfer");
    const end = Math.min(offset + CHUNK_SIZE, rec.blob.size);
    const chunk = rec.blob.slice(offset, end);

    const res = await fetch(tusUrl, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
        "tus-resumable": TUS_VERSION,
        "upload-offset": String(offset),
        "content-type": "application/offset+octet-stream",
      },
      body: chunk,
    });
    if (!res.ok && res.status !== 204) throw new Error(`tus patch failed (${res.status})`);

    const newOffset = Number(res.headers.get("upload-offset"));
    offset = Number.isFinite(newOffset) ? newOffset : end;
    // Persist the committed block so a later resume continues from here.
    await putRecord({ ...rec, tusUrl, uploadOffset: offset });
  }
}

/** Simple one-shot upload for small files that fit inside a single block. */
async function directUpload(rec: PendingMedia): Promise<void> {
  const { error } = await supabase.storage
    .from(rec.bucket)
    .upload(rec.path, rec.blob, { upsert: rec.upsert, contentType: rec.contentType });
  if (error) throw error;
}

/** Route to resumable vs. direct based on size. */
async function uploadRecord(rec: PendingMedia): Promise<void> {
  if (rec.blob.size > CHUNK_SIZE || rec.tusUrl) {
    await resumableUpload(rec);
  } else {
    await directUpload(rec);
  }
}

/**
 * Compress (images) then upload now if possible, otherwise queue offline.
 * Always resolves with the storage path so callers can store the reference
 * immediately. `queued` is true when the file is waiting for connectivity.
 */
export async function queueOrUploadMedia(
  bucket: string,
  path: string,
  file: Blob,
  opts: { upsert?: boolean; contentType?: string } = {},
): Promise<{ path: string; queued: boolean }> {
  const rawContentType = opts.contentType || (file as File).type || "application/octet-stream";
  const upsert = opts.upsert ?? true;

  // Pillar 1: compress before anything else so both the offline store and the
  // eventual upload carry the minimized payload.
  const { blob, contentType } = await compressForOffline(file, rawContentType);

  const rec: PendingMedia = {
    id: `${bucket}::${path}`,
    bucket,
    path,
    blob,
    contentType,
    upsert,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
    tusUrl: null,
    uploadOffset: 0,
  };

  if (isOnline()) {
    try {
      await uploadRecord(rec);
      return { path, queued: false };
    } catch {
      // fall through to queue — never lose the capture
    }
  }

  await putRecord(rec);
  ensureListeners();
  return { path, queued: true };
}

/** Number of media files still waiting to upload. */
export async function getPendingMediaCount(): Promise<number> {
  try {
    return (await getAllRecords()).length;
  } catch {
    return 0;
  }
}

/**
 * Attempt to upload every queued media file, resuming any partially-uploaded
 * binaries from their last committed block. Safe to call repeatedly.
 */
export async function flushMediaQueue(): Promise<{ uploaded: number; remaining: number }> {
  if (flushing || !isOnline()) {
    return { uploaded: 0, remaining: await getPendingMediaCount() };
  }
  flushing = true;
  let uploaded = 0;
  try {
    const records = await getAllRecords();
    for (const rec of records) {
      if (!isOnline()) break;
      try {
        await uploadRecord(rec);
        await deleteRecord(rec.id);
        uploaded++;
      } catch (e: any) {
        await putRecord({ ...rec, attempts: rec.attempts + 1, last_error: e?.message || "upload failed" });
      }
    }
  } finally {
    flushing = false;
  }
  return { uploaded, remaining: await getPendingMediaCount() };
}

function ensureListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => void flushMediaQueue());
  // Periodic safety net in case the 'online' event was missed.
  window.setInterval(() => {
    if (isOnline()) void flushMediaQueue();
  }, 30000);
}

/** Call once on app start to bind listeners and drain any leftover queue. */
export function initOfflineMedia() {
  ensureListeners();
  if (isOnline()) void flushMediaQueue();
}
