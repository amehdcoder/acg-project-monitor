// Offline capture queue for the Longitudinal Beneficiary Record.
//
// Every write (register beneficiary, record service, create referral) is
// stamped with a permanent client UUID and stored locally first, so records can
// be captured with no network at all. When connectivity returns the queue is
// flushed; the server-side unique index on `submission_uuid` makes every replay
// idempotent, so a retried batch can never create a duplicate.

import { supabase } from "@/integrations/supabase/client";

const KEY = "amehnities.programme_module.queue.v1";

export type QueueKind = "beneficiary" | "service" | "referral" | "op";

export interface QueuedItem {
  submission_uuid: string;
  kind: QueueKind;
  payload: Record<string, unknown>;
  queued_at: string;
  attempts: number;
  user_id?: string;
  last_error?: string;
  next_try_at?: number;
}

const read = (): QueuedItem[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as QueuedItem[];
  } catch {
    return [];
  }
};

const write = (items: QueuedItem[]) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("programme-module-queue"));
};

export const newUuid = (): string =>
  (crypto as unknown as { randomUUID?: () => string })?.randomUUID?.() ??
  `pm-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Merges a patch into a queued (not yet synced) record. Returns true if found. */
export const mergeIntoQueued = (uuid: string, patch: Record<string, unknown>): boolean => {
  const items = read();
  const hit = items.find((i) => i.kind !== "op" && i.submission_uuid === uuid);
  if (!hit) return false;
  hit.payload = { ...hit.payload, ...patch, submission_uuid: uuid };
  write(items);
  return true;
};

export const listQueued = (): QueuedItem[] => read();
export const isFormCollectionQueueItem = (item: QueuedItem): boolean => item.kind === "op" && ["microplan_entries", "eye_daily_reports", "eye_daily_patients"].includes(String(item.payload.table));


export const queueCount = (): number => read().length;

export const enqueue = (kind: QueueKind, payload: Record<string, unknown>): QueuedItem => {
  const item: QueuedItem = {
    submission_uuid: (payload.submission_uuid as string) || newUuid(),
    kind,
    payload,
    queued_at: new Date().toISOString(),
    attempts: 0,
    user_id: kind === "op" && payload.userId ? String(payload.userId) : kind === "op" && payload.table === "microplan_entries" ? String((payload.values as Record<string, unknown>)?.updated_by || (payload.values as Record<string, unknown>)?.created_by || "") : undefined,
  };
  item.payload.submission_uuid = item.submission_uuid;
  // Pending beneficiaries keep the same id on the server, so services or visits
  // recorded against them offline still point at the right person.
  if (kind === "beneficiary" && !item.payload.id) item.payload.id = item.submission_uuid;
  write([...read(), item]);
  return item;
};

const TABLES: Record<Exclude<QueueKind, "op">, "beneficiaries" | "beneficiary_services" | "beneficiary_referrals"> = {
  beneficiary: "beneficiaries",
  service: "beneficiary_services",
  referral: "beneficiary_referrals",
};

let flushing = false;
const ORDER: Record<QueueKind, number> = { beneficiary: 0, service: 1, referral: 2, op: 3 };
/** Exponential backoff per item (max 15 min) so failing rows don't hammer the server. */
const readyToRetry = (item: QueuedItem & { next_try_at?: number }) => !item.next_try_at || item.next_try_at <= Date.now();

/**
 * Sends every queued item. Only one tab per device flushes at a time (Web
 * Locks), parents are sent before children, and failed items back off.
 */
export const flushQueue = async (selectedFormIds: string[] = []): Promise<{ sent: number; failed: number }> => {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 };
  const locks = (navigator as Navigator & { locks?: { request: (n: string, o: { ifAvailable: boolean }, cb: (l: unknown) => Promise<unknown>) => Promise<unknown> } }).locks;
  if (locks) {
    let result = { sent: 0, failed: 0 };
    await locks.request("amehnities-records-flush", { ifAvailable: true }, async (lock) => {
      if (lock) result = await flushInner(selectedFormIds);
    });
    return result;
  }
  return flushInner(selectedFormIds);
};

const flushInner = async (selectedFormIds: string[]): Promise<{ sent: number; failed: number }> => {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const items = [...read()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.queued_at.localeCompare(b.queued_at));
    const remaining: QueuedItem[] = [];
    for (const item of items) {
      if (item.user_id && item.user_id !== userId) { remaining.push(item); continue; }
      if (isFormCollectionQueueItem(item) && !selectedFormIds.includes(item.submission_uuid)) { remaining.push(item); continue; }
      if (selectedFormIds.length && !selectedFormIds.includes(item.submission_uuid)) { remaining.push(item); continue; }
      if (!selectedFormIds.length && !readyToRetry(item)) { remaining.push(item); continue; }
      try {
        if (item.kind === "op") {
          const { runOp } = await import("./offlineWrite");
          await runOp(item.payload as never);
        } else {
          // People registered offline get their real Patient ID when they first reach the server.
          const pl = item.payload as Record<string, unknown>;
          if (item.kind === "beneficiary" && typeof pl.case_id === "string" && pl.case_id.startsWith("PENDING-") && pl.module_id) {
            const { data: cid, error: cidErr } = await supabase.rpc("next_beneficiary_case_id", { _module_id: pl.module_id, _facility_id: pl.facility_id || null } as never);
            if (cidErr) throw cidErr;
            if (cid) pl.case_id = cid as unknown as string;
          }
          const { error } = await supabase
            .from(TABLES[item.kind])
            .upsert(item.payload as never, { onConflict: "submission_uuid" });
          if (error) throw error;
        }
        sent += 1;
      } catch (e) {
        failed += 1;
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          last_error: (e as Error).message,
          next_try_at: Date.now() + Math.min(15 * 60_000, 2_000 * 2 ** item.attempts),
        } as QueuedItem);
      }
    }
    // Keep anything queued while this flush was running.
    const sentOrKept = new Set(items.map((i) => i.submission_uuid));
    write([...remaining, ...read().filter((i) => !sentOrKept.has(i.submission_uuid))]);
  } finally {
    flushing = false;
  }
  return { sent, failed };
};

/** Local pending rows for a module, merged into the list/record views. */
export const pendingFor = (kind: QueueKind, match: (payload: Record<string, unknown>) => boolean) =>
  read().filter((i) => i.kind === kind && match(i.payload)).map((i) => i.payload);

let listenerBound = false;
export const bindQueueAutoFlush = () => {
  if (listenerBound) return;
  listenerBound = true;
  // Random 0–20 s delay on reconnect so many devices coming back online at
  // once don't all hit the server in the same instant.
  window.addEventListener("online", () => { setTimeout(() => { void flushQueue(); }, Math.random() * 20_000); });
  // Periodic retry for items that backed off or devices that never fire "online".
  setInterval(() => { if (read().length) void flushQueue(); }, 60_000);
  void flushQueue();
};


/** Longest a record Save may wait on the server before keeping it on the device. */
export const SAVE_DEADLINE_MS = 8000;

/**
 * Inserts a queueable record, but never holds the Save button longer than the
 * deadline: on a slow or dropped connection the payload is queued instead.
 * Safe against duplicates because replays upsert on submission_uuid.
 */
export async function insertWithDeadline(
  kind: Exclude<QueueKind, "op">,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string; code?: string } | null; queued: boolean }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SAVE_DEADLINE_MS);
  try {
    const { error } = await supabase.from(TABLES[kind]).insert(payload as never).abortSignal(ctl.signal);
    if (!error || error.code === "23505") return { error: null, queued: false };
    if (ctl.signal.aborted || /failed to fetch|network|load failed/i.test(error.message)) {
      enqueue(kind, payload);
      return { error: null, queued: true };
    }
    return { error, queued: false };
  } catch {
    enqueue(kind, payload);
    return { error: null, queued: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Edits saved in the last 30 s. A server read that started before the edit
 * reached the server can arrive afterwards on a patchy connection; laying
 * these over it stops the screen flicking back to the old values.
 */
const recentEdits = new Map<string, { values: Record<string, unknown>; at: number }>();
export const rememberLocalEdit = (id: string, values: Record<string, unknown>) => {
  const prev = recentEdits.get(id);
  recentEdits.set(id, { values: { ...(prev?.values || {}), ...values }, at: Date.now() });
};
export const recentLocalEdit = (id: string): Record<string, unknown> | null => {
  const hit = recentEdits.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > 30_000) { recentEdits.delete(id); return null; }
  return hit.values;
};
