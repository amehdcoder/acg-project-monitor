// Offline-safe writes for the Longitudinal Beneficiary Records and Programme
// Report. Online, the change goes straight to the server; offline (or when the
// network drops mid-request) it is queued on the device and replayed by
// flushQueue when connectivity returns. Inserts carry a client-generated id so
// a replay can never create a duplicate.

import { supabase } from "@/integrations/supabase/client";
import { enqueue, flushQueue, mergeIntoQueued, newUuid } from "./offlineQueue";
import { cachePatchRows } from "./offlineReadCache";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type OpAction = "insert" | "update" | "delete" | "graduation" | "batch";
export interface OpPayload {
  table: string;
  action: OpAction;
  values?: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
  operations?: OpPayload[];
  userId?: string;
}

const isNetworkError = (e: unknown): boolean => {
  const msg = String((e as { message?: string })?.message || e || "");
  return e instanceof TypeError || /failed to fetch|network|load failed|timeout|fetch/i.test(msg);
};

/** Executes one operation against the server. Duplicate inserts count as done. */
export async function runOp(op: OpPayload): Promise<void> {
  if (op.action === "batch") {
    for (const child of op.operations ?? []) await runOp(child);
    return;
  }
  if (op.action === "graduation") {
    const { data, error } = await supabase.rpc("save_graduation_gate", { _beneficiary: op.id, _gate: op.values } as never);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Graduation decision was not saved.");
    return;
  }
  let res: { error: { code?: string; message: string } | null };
  if (op.action === "insert") res = await db.from(op.table).insert(op.values);
  else if (op.action === "update") {
    const result = await db.from(op.table).update(op.values).eq("id", op.id).select("id");
    if (!result.error && !result.data?.length) throw new Error("This record could not be updated. Check your project access and try again.");
    res = result;
  } else res = await db.from(op.table).delete().eq("id", op.id);
  if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
}

const CACHE_PREFIX: Record<string, string> = { microplan_entries: "microplan-entries:", beneficiaries: "beneficiaries:", livelihood_verifications: "livelihood-verifications:" };

/** Current user id from the local session — works offline. */
export async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id;
}

/**
 * Saves a change, queuing it on the device when offline. Returns the row id
 * (generated for inserts) and whether it was queued.
 */
export async function offlineMutate(op: OpPayload & { forceQueue?: boolean }): Promise<{ id?: string; queued: boolean }> {
  const { forceQueue: _f, ...rest } = op;
  const prepared: OpPayload = { ...rest };
  if (op.action === "insert") {
    const add = (v: Record<string, unknown>) => ({ ...v, id: (v.id as string) || newUuid() });
    prepared.values = Array.isArray(op.values) ? op.values.map(add) : add(op.values || {});
  }
  const id = op.action === "insert" && !Array.isArray(prepared.values) ? (prepared.values as Record<string, unknown>).id as string : op.id;
  const patchCache = async () => {
    const prefix = CACHE_PREFIX[op.table];
    if (prefix && id) await cachePatchRows(prefix, id, op.action === "delete" ? null : op.action === "graduation" ? { profile: { graduation: prepared.values } } : prepared.values as Record<string, unknown>, op.action === "insert");
  };

  // Edits to a record that itself is still waiting to sync: fold them into it.
  if (op.action === "update" && op.id && mergeIntoQueued(op.id, op.values as Record<string, unknown>)) {
    await patchCache();
    return { id: op.id, queued: true };
  }

  const queue = async () => {
    enqueue("op", prepared as unknown as Record<string, unknown>);
    await patchCache();
    return { id, queued: true };
  };

  if (!navigator.onLine || op.forceQueue) return queue();
  try {
    await runOp(prepared);
    await patchCache();
    void flushQueue();
    return { id, queued: false };
  } catch (e) {
    if (isNetworkError(e)) return queue();
    throw e;
  }
}
