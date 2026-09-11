// Offline capture queue for the Longitudinal Beneficiary Record.
//
// Every write (register beneficiary, record service, create referral) is
// stamped with a permanent client UUID and stored locally first, so records can
// be captured with no network at all. When connectivity returns the queue is
// flushed; the server-side unique index on `submission_uuid` makes every replay
// idempotent, so a retried batch can never create a duplicate.

import { supabase } from "@/integrations/supabase/client";

const KEY = "amehnities.programme_module.queue.v1";

export type QueueKind = "beneficiary" | "service" | "referral";

export interface QueuedItem {
  submission_uuid: string;
  kind: QueueKind;
  payload: Record<string, unknown>;
  queued_at: string;
  attempts: number;
  last_error?: string;
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

export const listQueued = (): QueuedItem[] => read();

export const queueCount = (): number => read().length;

export const enqueue = (kind: QueueKind, payload: Record<string, unknown>): QueuedItem => {
  const item: QueuedItem = {
    submission_uuid: (payload.submission_uuid as string) || newUuid(),
    kind,
    payload,
    queued_at: new Date().toISOString(),
    attempts: 0,
  };
  item.payload.submission_uuid = item.submission_uuid;
  write([...read(), item]);
  return item;
};

const TABLES: Record<QueueKind, "beneficiaries" | "beneficiary_services" | "beneficiary_referrals"> = {
  beneficiary: "beneficiaries",
  service: "beneficiary_services",
  referral: "beneficiary_referrals",
};

let flushing = false;

/** Sends every queued item. Safe to call repeatedly; runs one flush at a time. */
export const flushQueue = async (): Promise<{ sent: number; failed: number }> => {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = read();
    const remaining: QueuedItem[] = [];
    for (const item of items) {
      try {
        const { error } = await supabase
          .from(TABLES[item.kind])
          .upsert(item.payload as never, { onConflict: "submission_uuid" });
        if (error) throw error;
        sent += 1;
      } catch (e) {
        failed += 1;
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          last_error: (e as Error).message,
        });
      }
    }
    write(remaining);
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
  window.addEventListener("online", () => { void flushQueue(); });
  void flushQueue();
};
