// Local-first store for full form entries that move through the
// draft -> finalized -> sent lifecycle. Backed by IndexedDB so entries
// survive reloads and work fully offline. Each entry carries a complete
// snapshot of the form definition so it can be re-rendered and edited
// later, plus the prepared submission payload so it can be synced to the
// server with exactly the same shape as a direct submission.

import type { Question, FormGroup, GeofenceArea } from "@/components/FormBuilder/types";

export type SavedFormStatus = "draft" | "finalized" | "sent";

export interface SavedFormEntry {
  id: string;
  userId: string;
  formId: string;
  formName: string;
  formDescription: string;
  projectId: string;
  // Full form definition snapshot — needed to re-render in FormFiller.
  questions: Question[];
  groups: FormGroup[];
  geofence: GeofenceArea | null;
  settings: Record<string, any>;
  // Respondent data.
  responses: Record<string, any>;
  gps: { lat: number; lng: number; accuracy?: number } | null;
  // Prepared submission payload (built at finalize time) so syncing matches
  // a normal submission.
  submissionData?: Record<string, any> | null;
  submissionLocation?: { lat: number; lng: number } | null;
  withinGeofence?: boolean | null;
  submissionType?: string;
  // Lifecycle.
  status: SavedFormStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
  sentAt?: string | null;
  submissionId?: string | null;
  offline?: boolean;
}

const DB_NAME = "amehnities_saved_forms";
const DB_VERSION = 1;
const STORE = "entries";

const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("formId", "formId", { unique: false });
      }
    };
  });

export const saveSavedEntry = async (entry: SavedFormEntry): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(entry);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
};

export const getSavedEntry = async (id: string): Promise<SavedFormEntry | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as SavedFormEntry) || null);
  });
};

export const listSavedEntries = async (
  userId: string,
  status?: SavedFormStatus,
): Promise<SavedFormEntry[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      let rows = (req.result as SavedFormEntry[]) || [];
      rows = rows.filter((r) => r.userId === userId);
      if (status) rows = rows.filter((r) => r.status === status);
      rows.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      resolve(rows);
    };
  });
};

export const deleteSavedEntries = async (ids: string[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const setSavedEntryStatus = async (
  id: string,
  status: SavedFormStatus,
  patch: Partial<SavedFormEntry> = {},
): Promise<void> => {
  const existing = await getSavedEntry(id);
  if (!existing) return;
  await saveSavedEntry({
    ...existing,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  });
};

export const newEntryId = (): string => crypto.randomUUID();
