// Phase 4b — Transaction sync queue for case mutations.
//
// Each mutation (create OR delta update) is persisted as its own idempotent
// transaction. Media files are kept separate from the JSON payload so heavy
// binaries do not block the fast text/JSON channel.

import { getCase, type CaseEntity } from "./caseStore";

export interface CaseMediaChunk {
  id: string;                   // stable per-file uuid
  case_id: string;
  transaction_uuid: string;     // parent transaction
  field: string;                // form field name
  filename: string;
  mime: string;
  blob: Blob;
  uploaded: boolean;
}

export interface CaseTransaction {
  transaction_uuid: string;     // idempotency key
  case_id: string;
  kind: "create" | "update";
  delta: Record<string, unknown>;
  search_keys?: CaseEntity["search_keys"];
  case_type?: CaseEntity["case_type"];
  parent_case_id?: string | null;
  external_id?: string | null;
  flagged_override?: boolean;
  media: Array<Omit<CaseMediaChunk, "blob" | "uploaded">>;
  submitted_at: string;
  attempts: number;
  last_error?: string | null;
  project_id?: string | null;
  owner_user_id?: string | null;
}

const DB_NAME = "amehnities_case_engine";
const DB_VERSION = 2;
const TXN_STORE = "transactions";
const MEDIA_STORE = "media";

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Cases store is created by caseStore.ts; only add the queue stores.
      if (!db.objectStoreNames.contains("cases")) {
        const s = db.createObjectStore("cases", { keyPath: "case_id" });
        s.createIndex("sync_status", "sync_status", { unique: false });
      }
      if (!db.objectStoreNames.contains(TXN_STORE)) {
        const s = db.createObjectStore(TXN_STORE, { keyPath: "transaction_uuid" });
        s.createIndex("case_id", "case_id", { unique: false });
        s.createIndex("submitted_at", "submitted_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const s = db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        s.createIndex("transaction_uuid", "transaction_uuid", { unique: false });
        s.createIndex("uploaded", "uploaded", { unique: false });
      }
    };
  });
  return dbPromise;
};

const newUuid = (): string =>
  (crypto as any)?.randomUUID?.() ??
  `txn-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const runReq = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });

export interface EnqueueCaseInput {
  case_id: string;
  kind: "create" | "update";
  delta: Record<string, unknown>;
  search_keys?: CaseEntity["search_keys"];
  case_type?: CaseEntity["case_type"];
  parent_case_id?: string | null;
  external_id?: string | null;
  flagged_override?: boolean;
  project_id?: string | null;
  owner_user_id?: string | null;
  media?: Array<{ field: string; file: File | Blob; filename?: string }>;
}

export const enqueueCaseTransaction = async (
  input: EnqueueCaseInput,
): Promise<CaseTransaction> => {
  const db = await openDB();
  const transaction_uuid = newUuid();
  const mediaMeta: CaseTransaction["media"] = [];

  // Persist media chunks separately from the JSON payload.
  if (input.media?.length) {
    const mediaTx = db.transaction(MEDIA_STORE, "readwrite");
    const mediaStore = mediaTx.objectStore(MEDIA_STORE);
    for (const m of input.media) {
      const id = newUuid();
      const blob = m.file as Blob;
      const filename =
        m.filename ||
        ((m.file as File).name ?? `${m.field}-${id}`);
      const mime = (m.file as File).type || "application/octet-stream";
      await runReq(
        mediaStore.put({
          id,
          case_id: input.case_id,
          transaction_uuid,
          field: m.field,
          filename,
          mime,
          blob,
          uploaded: false,
        } as CaseMediaChunk),
      );
      mediaMeta.push({
        id,
        case_id: input.case_id,
        transaction_uuid,
        field: m.field,
        filename,
        mime,
      });
    }
  }

  const record: CaseTransaction = {
    transaction_uuid,
    case_id: input.case_id,
    kind: input.kind,
    delta: input.delta,
    search_keys: input.search_keys,
    case_type: input.case_type,
    parent_case_id: input.parent_case_id ?? null,
    external_id: input.external_id ?? null,
    flagged_override: input.flagged_override,
    media: mediaMeta,
    submitted_at: new Date().toISOString(),
    attempts: 0,
    project_id: input.project_id ?? null,
    owner_user_id: input.owner_user_id ?? null,
  };

  const txnTx = db.transaction(TXN_STORE, "readwrite");
  await runReq(txnTx.objectStore(TXN_STORE).put(record));
  return record;
};

export const listPendingCaseTransactions = async (): Promise<CaseTransaction[]> => {
  const db = await openDB();
  const store = db.transaction(TXN_STORE, "readonly").objectStore(TXN_STORE);
  const rows = await runReq(store.getAll());
  return ((rows as CaseTransaction[]) || []).sort(
    (a, b) => a.submitted_at.localeCompare(b.submitted_at),
  );
};

export const deleteCaseTransaction = async (
  transaction_uuid: string,
): Promise<void> => {
  const db = await openDB();
  const store = db.transaction(TXN_STORE, "readwrite").objectStore(TXN_STORE);
  await runReq(store.delete(transaction_uuid));
};

export const loadTransactionMedia = async (
  transaction_uuid: string,
): Promise<CaseMediaChunk[]> => {
  const db = await openDB();
  const store = db.transaction(MEDIA_STORE, "readonly").objectStore(MEDIA_STORE);
  const idx = store.index("transaction_uuid");
  return runReq(idx.getAll(IDBKeyRange.only(transaction_uuid))) as Promise<
    CaseMediaChunk[]
  >;
};

/**
 * Build the wire payload for a case transaction, including the
 * `x-idempotency-key` header value. The actual HTTP dispatch lives in the
 * application's shared submission pipeline; this helper just standardises
 * payload shape so calling code stays consistent.
 */
export const buildTransactionPayload = async (
  txn: CaseTransaction,
): Promise<{
  headers: Record<string, string>;
  body: {
    transaction_uuid: string;
    case_id: string;
    kind: CaseTransaction["kind"];
    delta: Record<string, unknown>;
    search_keys?: CaseEntity["search_keys"];
    submitted_at: string;
    flagged_override?: boolean;
    parent_case_id?: string | null;
    external_id?: string | null;
    project_id?: string | null;
  };
  mediaRefs: CaseTransaction["media"];
}> => {
  const existing = txn.kind === "update" ? await getCase(txn.case_id) : null;
  return {
    headers: {
      "x-idempotency-key": txn.transaction_uuid,
      "content-type": "application/json",
    },
    body: {
      transaction_uuid: txn.transaction_uuid,
      case_id: txn.case_id,
      kind: txn.kind,
      delta: txn.delta,
      search_keys: txn.search_keys ?? existing?.search_keys,
      submitted_at: txn.submitted_at,
      flagged_override: txn.flagged_override,
      parent_case_id: txn.parent_case_id ?? existing?.parent_case_id ?? null,
      external_id: txn.external_id ?? existing?.external_id ?? null,
      project_id: txn.project_id ?? existing?.project_id ?? null,
    },
    mediaRefs: txn.media,
  };
};
