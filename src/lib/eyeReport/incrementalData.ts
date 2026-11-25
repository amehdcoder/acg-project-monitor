import { supabase } from "@/integrations/supabase/client";
import { cacheGetForUser, cacheSetForUser, cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { listQueued, type QueuedItem } from "@/lib/programmeModule/offlineQueue";
import type { OpPayload } from "@/lib/programmeModule/offlineWrite";

export type EyeTable = "eye_daily_reports" | "eye_daily_patients";
export type SyncRow = { id: string; project_id: string; updated_at?: string; report_date: string };
type SyncMeta = { cursor: string | null; reconciledAt: number };
const db = supabase as unknown as { from: (table: string) => any };
const flights = new Map<string, Promise<SyncResult<SyncRow>>>();
/** Source-document photos (some stored inline as base64, up to MBs each) are never part of dashboard sync; they load on demand for editing. */
export const EYE_REPORT_LIST_COLUMNS = "id,project_id,facility_id,facility_name,state,lga,report_date,summary,csom,notes,prepared_by,confirmed_by,created_by,device_id,collector_label,created_at,updated_at,gps";
const listColumns = (table: EyeTable) => table === "eye_daily_reports" ? EYE_REPORT_LIST_COLUMNS : "*";
export function withoutAttachments<T>(rows: T[]): T[] {
  return rows.map(r => r && typeof r === "object" && "attachments" in (r as object) ? (({ attachments: _a, ...rest }) => rest)(r as T & { attachments?: unknown }) as T : r);
}
export type SyncResult<T> = { rows: T[]; fromCache: boolean; unavailable: boolean; checkedAt: number | null };

export function mergeRows<T extends { id: string }>(previous: T[], changes: T[], ids?: Set<string>): T[] {
  const merged = new Map(previous.filter(r => !ids || ids.has(r.id)).map(r => [r.id, r]));
  for (const row of changes) if (!ids || ids.has(row.id)) merged.set(row.id, row);
  return [...merged.values()];
}

/** Overlay only this account's queued edits, including stable-ID batch envelopes. */
export function overlayPending<T extends SyncRow>(rows: T[], items: QueuedItem[], userId: string, projectId: string, table: EyeTable): T[] {
  const merged = new Map(rows.map(r => [r.id, r]));
  const apply = (op: OpPayload) => {
    if (op.action === "batch") { for (const child of op.operations ?? []) apply(child); return; }
    if (table === "eye_daily_patients" && op.table === "eye_daily_reports" && op.action === "delete" && op.id) {
      for (const [id, row] of merged) if ((row as T & { report_id?: string | null }).report_id === op.id && row.project_id === projectId) merged.delete(id);
      return;
    }
    if (op.table !== table) return;
    if (op.action === "delete") { if (op.id) merged.delete(op.id); return; }
    for (const values of Array.isArray(op.values) ? op.values : [op.values]) {
      if (!values) continue;
      const id = String(values.id || op.id || "");
      const prior = merged.get(id);
      if (!id || (values.project_id ?? prior?.project_id) !== projectId) continue;
      merged.set(id, { ...prior, ...values, id } as T);
    }
  };
  for (const item of items) if (item.kind === "op" && item.user_id === userId) apply(item.payload as unknown as OpPayload);
  return [...merged.values()].sort((a, b) => b.report_date.localeCompare(a.report_date) || a.id.localeCompare(b.id));
}

// Retire pre-cleanup screening snapshots and their cursors together. Never clear drafts or queues.
export const datasetKey = (table: EyeTable, projectId: string) => `${table === "eye_daily_reports" ? "eye-reports" : "eye-patients-v2"}:${projectId}`;

export async function savedEyeRows<T extends SyncRow>(userId: string, projectId: string, table: EyeTable) {
  const raw = await cacheGetForUser<T[]>(userId, datasetKey(table, projectId));
  const rows = raw === null ? null : table === "eye_daily_reports" ? withoutAttachments(raw) : raw;
  return rows === null ? null : overlayPending(rows, listQueued(), userId, projectId, table);
}

/** Warm reads transfer changed rows only; occasional ID-only scans recover missed deletes/access removals. */
export function syncEyeRows<T extends SyncRow>(userId: string, projectId: string, table: EyeTable, reconcile = false): Promise<SyncResult<T>> {
  const key = `${userId}:${table}:${projectId}`;
  const existing = flights.get(key);
  if (existing) return existing as Promise<SyncResult<T>>;
  const promise = sync<T>(userId, projectId, table, reconcile).finally(() => flights.delete(key));
  flights.set(key, promise as Promise<SyncResult<SyncRow>>);
  return promise;
}

async function sync<T extends SyncRow>(userId: string, projectId: string, table: EyeTable, reconcile: boolean): Promise<SyncResult<T>> {
  const key = datasetKey(table, projectId), metaKey = `${key}:sync-v1`;
  const [cachedPrevious, meta] = await Promise.all([cacheGetForUser<T[]>(userId, key), cacheGetForUser<SyncMeta>(userId, metaKey)]);
  const lean = (rows: T[]) => table === "eye_daily_reports" ? withoutAttachments(rows) : rows;
  const previous = cachedPrevious === null ? null : lean(cachedPrevious);
  let nextMeta = meta;
  const result = await cachedRead<T[]>(key, async () => {
    const changes: T[] = [];
    // Never use optimistic client timestamps as the server cursor. Replay a minute for timestamp ties.
    const since = previous !== null && meta?.cursor ? new Date(Date.parse(meta.cursor) - 60_000).toISOString() : null;
    let after: { updated_at: string; id: string } | null = null;
    for (;;) {
      let query = db.from(table).select(listColumns(table)).eq("project_id", projectId)
        .order("updated_at").order("id").limit(1000);
      if (since) query = query.gte("updated_at", since);
      if (after) query = query.or(`updated_at.gt.${after.updated_at},and(updated_at.eq.${after.updated_at},id.gt.${after.id})`);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(20_000));
      if (error) return { data: null, error };
      const page = (data ?? []) as T[];
      changes.push(...page);
      if (page.length < 1000) break;
      const last = page[page.length - 1];
      if (!last?.updated_at) return { data: null, error: new Error("Missing synchronization timestamp") };
      after = { updated_at: last.updated_at, id: last.id };
    }
    let ids: Set<string> | undefined;
    const shouldReconcile = previous !== null && (reconcile || !meta || Date.now() - meta.reconciledAt >= 300_000);
    if (shouldReconcile) {
      ids = new Set();
      let afterId: string | null = null;
      for (;;) {
        let query = db.from(table).select("id").eq("project_id", projectId).order("id").limit(1000);
        if (afterId) query = query.gt("id", afterId);
        const { data, error } = await query.abortSignal(AbortSignal.timeout(20_000));
        if (error) return { data: null, error };
        for (const row of data ?? []) ids.add(row.id);
        if (!data || data.length < 1000) break;
        afterId = data[data.length - 1].id;
      }
      // Fetch records the device never received (e.g. late offline syncs with older timestamps).
      const known = new Set([...(previous ?? []).map(r => r.id), ...changes.map(r => r.id)]);
      const missing = [...ids].filter(id => !known.has(id));
      for (let i = 0; i < missing.length; i += 200) {
        const { data, error } = await db.from(table).select(listColumns(table)).in("id", missing.slice(i, i + 200)).abortSignal(AbortSignal.timeout(20_000));
        if (error) return { data: null, error };
        changes.push(...((data ?? []) as T[]));
      }
    }
    const cursor = changes.reduce((latest, row) => row.updated_at && (!latest || row.updated_at > latest) ? row.updated_at : latest, meta?.cursor ?? null);
    nextMeta = { cursor, reconciledAt: shouldReconcile || previous === null ? Date.now() : meta?.reconciledAt ?? 0 };
    // Read the cache again to include local writes completed while the network was busy.
    const latestRaw = await cacheGetForUser<T[]>(userId, key);
    const latest = latestRaw === null ? null : lean(latestRaw);
    return { data: overlayPending(mergeRows(since ? latest ?? previous ?? [] : [], changes, ids), listQueued(), userId, projectId, table), error: null };
  }, 30_000, userId);
  if (!result.fromCache && nextMeta) await cacheSetForUser(userId, metaKey, nextMeta);
  return { rows: overlayPending(result.data ?? [], listQueued(), userId, projectId, table), fromCache: result.fromCache, unavailable: result.data === null, checkedAt: result.fromCache ? null : Date.now() };
}