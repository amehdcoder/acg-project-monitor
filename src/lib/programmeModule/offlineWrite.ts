// Offline-safe writes for the Longitudinal Beneficiary Records and Programme
// Report. Online, the change goes straight to the server; offline (or when the
// network drops mid-request) it is queued on the device and replayed by
// flushQueue when connectivity returns. Inserts carry a client-generated id so
// a replay can never create a duplicate.

import { supabase } from "@/integrations/supabase/client";
import { enqueue, flushQueue, mergeIntoQueued, newUuid } from "./offlineQueue";
import { cachePatchRows } from "./offlineReadCache";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type OpAction = "insert" | "update" | "delete";
export interface OpPayload {
  table: string;
  action: OpAction;
  values?: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
}

const isNetworkError = (e: unknown): boolean => {
  const msg = String((e as { message?: string })?.message || e || "");
  return e instanceof TypeError || /failed to fetch|network|load failed|timeout|fetch/i.test(msg);
};

/** Executes one operation against the server. Duplicate inserts count as done. */
export async function runOp(op: OpPayload): Promise<void> {
  let res: { error: { code?: string; message: string } | null };
  if (op.action === "insert") res = await db.from(op.table).insert(op.values);
  else if (op.action === "update") res = await db.from(op.table).update(op.values).eq("id", op.id);
  else res = await db.from(op.table).delete().eq("id", op.id);
  if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
}

const CACHE_PREFIX: Record<string, string> = { beneficiaries: "beneficiaries:" };

/** Current user id from the local session — works offline. */
export async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id;
}

/**
 * Saves a change, queuing it on the device when offline. Returns the row id
 * (generated for inserts) and whether it was queued.
 */
export async function offlineMutate(op: OpPayload): Promise<{ id?: string; queued: boolean }> {
  const prepared: OpPayload = { ...op };
  if (op.action === "insert") {
    const add = (v: Record<string, unknown>) => ({ ...v, id: (v.id as string) || newUuid() });
    prepared.values = Array.isArray(op.values) ? op.values.map(add) : add(op.values || {});
  }
  const id = op.action === "insert" && !Array.isArray(prepared.values) ? (prepared.values as Record<string, unknown>).id as string : op.id;

  // Edits to a record that itself is still waiting to sync: fold them into it.
  if (op.action === "update" && op.id && mergeIntoQueued(op.id, op.values as Record<string, unknown>)) {
    return { id: op.id, queued: true };
  }

  const queue = () => {
    enqueue("op", prepared as unknown as Record<string, unknown>);
    const prefix = CACHE_PREFIX[op.table];
    if (prefix && id && op.action !== "insert") void cachePatchRows(prefix, id, op.action === "delete" ? null : (op.values as Record<string, unknown>));
    return { id, queued: true };
  };

  if (!navigator.onLine) return queue();
  try {
    await runOp(prepared);
    void flushQueue();
    return { id, queued: false };
  } catch (e) {
    if (isNetworkError(e)) return queue();
    throw e;
  }
}
