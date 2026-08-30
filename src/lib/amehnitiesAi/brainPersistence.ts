/**
 * brainPersistence — durable, automatic storage of the live Amehnities model.
 *
 * The Transformer trains continuously in a Web Worker. Everything it learns
 * (weights, Adam moments, vocabulary, step/token counters, loss history and the
 * architecture itself, which grows through neurogenesis) is snapshotted here to
 * IndexedDB so a reload, a navigation away, or a closed tab never loses the
 * model. On the next boot the worker is warm-started from this record.
 *
 * IndexedDB is used rather than localStorage because checkpoints are megabytes
 * of base64 weights and must not block the main thread.
 */
import type { CheckpointFile } from "./checkpoint";

const DB_NAME = "amehnities-brain";
const DB_VERSION = 2;
const STORE = "state";
const VERSIONS = "versions";
const KEY = "latest";
/** How many rollback points are kept on the device. */
export const MAX_VERSIONS = 15;


export interface PersistedBrain {
  savedAt: string;
  step: number;
  params: number;
  loss: number;
  bytes: number;
  file: CheckpointFile;
}

export interface PersistenceStatus {
  supported: boolean;
  savedAt: string | null;
  step: number;
  params: number;
  bytes: number;
  restored: boolean;
  saving: boolean;
  error: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(VERSIONS)) db.createObjectStore(VERSIONS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the model store"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
  store: string = STORE,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("Model store request failed"));
    });
  } finally {
    db.close();
  }
}


/** Persist the newest snapshot of the model (overwrites the previous one). */
export async function saveBrain(file: CheckpointFile): Promise<PersistedBrain> {
  const bytes = JSON.stringify(file).length;
  const record: PersistedBrain = {
    savedAt: new Date().toISOString(),
    step: file.training.step,
    params: file.training.paramCount,
    loss: file.training.loss,
    bytes,
    file,
  };
  await withStore("readwrite", (s) => s.put(record, KEY) as IDBRequest<IDBValidKey>);
  return record;
}

/** Read back the last automatically saved model, if any. */
export async function loadBrain(): Promise<PersistedBrain | null> {
  try {
    const rec = await withStore<PersistedBrain | undefined>("readonly", (s) => s.get(KEY));
    if (!rec?.file?.weights?.base64) return null;
    return rec;
  } catch {
    return null;
  }
}

/** Forget the persisted model — the next boot starts from fresh weights. */
export async function clearBrain(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(KEY) as IDBRequest<undefined>);
  } catch { /* nothing to clear */ }
}


/* ------------------------------------------------------------------ *
 * Model versioning
 *
 * Every meaningful training milestone (an autosave crossing the version
 * cadence, a dataset training run, a manual "Save version") writes an
 * immutable, dated snapshot here. If a training run degrades results, any
 * version can be rolled back into the live worker in one click.
 * ------------------------------------------------------------------ */

export type VersionTrigger = "manual" | "auto" | "dataset" | "pre-rollback";

export interface ModelVersion {
  id: string;
  label: string;
  createdAt: string;
  trigger: VersionTrigger;
  step: number;
  params: number;
  loss: number;
  perplexity: number;
  valLoss?: number | null;
  accuracy?: number | null;
  bytes: number;
  notes?: string;
  file: CheckpointFile;
}

export type ModelVersionMeta = Omit<ModelVersion, "file">;

const stripFile = (v: ModelVersion): ModelVersionMeta => {
  const { file: _f, ...meta } = v;
  return meta;
};

/** Store a new immutable version and prune the oldest beyond MAX_VERSIONS. */
export async function saveVersion(
  file: CheckpointFile,
  meta: {
    label?: string; trigger?: VersionTrigger; notes?: string;
    perplexity?: number; valLoss?: number | null; accuracy?: number | null;
  } = {},
): Promise<ModelVersionMeta> {
  const createdAt = new Date().toISOString();
  const rec: ModelVersion = {
    id: `v-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
    label: meta.label?.trim() || `Step ${file.training.step.toLocaleString()}`,
    createdAt,
    trigger: meta.trigger ?? "manual",
    step: file.training.step,
    params: file.training.paramCount,
    loss: file.training.loss,
    perplexity: meta.perplexity ?? 0,
    valLoss: meta.valLoss ?? null,
    accuracy: meta.accuracy ?? null,
    bytes: JSON.stringify(file).length,
    notes: meta.notes,
    file,
  };
  await withStore("readwrite", (s) => s.put(rec) as IDBRequest<IDBValidKey>, VERSIONS);
  const all = await listVersions();
  for (const old of all.slice(MAX_VERSIONS)) await deleteVersion(old.id);
  return stripFile(rec);
}

/** Newest-first version history (metadata only — weights stay on disk). */
export async function listVersions(): Promise<ModelVersionMeta[]> {
  try {
    const all = await withStore<ModelVersion[]>("readonly", (s) => s.getAll() as IDBRequest<ModelVersion[]>, VERSIONS);
    return (all ?? [])
      .filter((v) => v?.file?.weights?.base64)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(stripFile);
  } catch {
    return [];
  }
}

export async function getVersion(id: string): Promise<ModelVersion | null> {
  try {
    const rec = await withStore<ModelVersion | undefined>("readonly", (s) => s.get(id), VERSIONS);
    return rec?.file?.weights?.base64 ? rec : null;
  } catch {
    return null;
  }
}

export async function deleteVersion(id: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(id) as IDBRequest<undefined>, VERSIONS);
  } catch { /* already gone */ }
}

export async function clearVersions(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.clear() as IDBRequest<undefined>, VERSIONS);
  } catch { /* nothing to clear */ }
}
