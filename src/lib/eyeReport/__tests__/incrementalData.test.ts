import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cache: new Map<string, unknown>(), queries: [] as Record<string, unknown>[], replies: [] as { data: unknown[] | null; error: unknown }[], queued: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const params: Record<string, unknown> = { table };
  const q: any = {};
  for (const method of ["select", "eq", "order", "limit", "gte", "gt", "or"]) q[method] = (...args: unknown[]) => { params[method] = args; return q; };
  q.abortSignal = async () => { mocks.queries.push(params); return mocks.replies.shift() ?? { data: [], error: null }; };
  return q;
} } }));
vi.mock("@/lib/programmeModule/offlineQueue", () => ({ listQueued: () => mocks.queued }));
vi.mock("@/lib/programmeModule/offlineReadCache", () => ({
  cacheGetForUser: async (user: string, key: string) => mocks.cache.get(`${user}:${key}`) ?? null,
  cacheSetForUser: async (user: string, key: string, data: unknown) => { mocks.cache.set(`${user}:${key}`, data); },
  cachedRead: async (key: string, fetcher: any, _: number, user: string) => {
    const result = await fetcher();
    if (result.error) return { data: mocks.cache.get(`${user}:${key}`) ?? null, fromCache: true };
    mocks.cache.set(`${user}:${key}`, result.data); return { data: result.data, fromCache: false };
  },
}));
import { datasetKey, mergeRows, overlayPending, savedEyeRows, syncEyeRows } from "../incrementalData";
const table = "eye_daily_reports";
const row = (id: string, count = 1) => ({ id, project_id: "p", report_date: "2026-11-02", updated_at: "2026-11-02T07:00:00Z", count });
beforeEach(() => { mocks.cache.clear(); mocks.queries.length = 0; mocks.replies.length = 0; mocks.queued = []; });
describe("Eye dashboard retained data", () => {
  it("does not hydrate the obsolete 57-screening snapshot after cleanup", async () => {
    mocks.cache.set("alice:eye-patients:p", Array.from({ length: 57 }, (_, i) => row(`old-${i}`)));
    expect(await savedEyeRows("alice", "p", "eye_daily_patients")).toBeNull();
    mocks.replies.push({ data: [], error: null });
    expect((await syncEyeRows("alice", "p", "eye_daily_patients", true)).rows).toEqual([]);
    expect(await savedEyeRows("alice", "p", "eye_daily_patients")).toEqual([]);
  });
  it("reconciles 57 deleted screenings to zero without dropping a new standalone submission", async () => {
    const key = datasetKey("eye_daily_patients", "p");
    mocks.cache.set(`alice:${key}`, Array.from({ length: 57 }, (_, i) => row(`old-${i}`)));
    mocks.cache.set(`alice:${key}:sync-v1`, { cursor: "2026-11-02T07:00:00Z", reconciledAt: 0 });
    mocks.replies.push({ data: [], error: null }, { data: [], error: null });
    expect((await syncEyeRows("alice", "p", "eye_daily_patients", true)).rows).toEqual([]);
    mocks.replies.push({ data: [{ ...row("new"), report_id: null }], error: null });
    expect((await syncEyeRows<any>("alice", "p", "eye_daily_patients")).rows.map(r => r.id)).toEqual(["new"]);
  });
  it("excludes linked WG-SS screenings during offline report deletion, preserving standalone and other reports", () => {
    const patients = [{ ...row("linked"), report_id: "deleted" }, { ...row("standalone"), report_id: null }, { ...row("other"), report_id: "kept" }];
    const items: any[] = [{ kind: "op", user_id: "alice", payload: { table, action: "delete", id: "deleted" } }];
    expect(overlayPending(patients, items, "alice", "p", "eye_daily_patients").map(p => p.id)).toEqual(["other", "standalone"]);
    expect(overlayPending(patients, items, "bob", "p", "eye_daily_patients")).toHaveLength(3);
  });
  it("hydrates the requesting account without a network request", async () => {
    mocks.cache.set(`alice:${datasetKey(table, "p")}`, [row("one", 324)]);
    expect(await savedEyeRows("alice", "p", table)).toEqual([row("one", 324)]);
    expect(await savedEyeRows("bob", "p", table)).toBeNull();
    expect(mocks.queries).toHaveLength(0);
  });
  it("merges changed rows without losing historical values or duplicating IDs", () => {
    expect(mergeRows([row("a", 324), row("b")], [row("b", 7), row("c", 2)]).map(r => r.count)).toEqual([324, 7, 2]);
  });
  it("warm refresh requests an overlapping delta and retains prior reports", async () => {
    const key = datasetKey(table, "p");
    mocks.cache.set(`alice:${key}`, [row("a", 324)]);
    mocks.cache.set(`alice:${key}:sync-v1`, { cursor: "2026-11-02T07:00:00Z", reconciledAt: Date.now() });
    mocks.replies.push({ data: [row("b", 12)], error: null });
    const result = await syncEyeRows<any>("alice", "p", table);
    expect(result.rows.map(r => r.count)).toEqual([324, 12]);
    expect(mocks.queries[0].gte).toEqual(["updated_at", "2026-11-02T06:59:00.000Z"]);
    expect(mocks.queries).toHaveLength(1);
  });
  it("reconciles missed deletions with IDs only", async () => {
    const key = datasetKey(table, "p");
    mocks.cache.set(`alice:${key}`, [row("a"), row("deleted")]);
    mocks.cache.set(`alice:${key}:sync-v1`, { cursor: "2026-11-02T07:00:00Z", reconciledAt: 0 });
    mocks.replies.push({ data: [], error: null }, { data: [{ id: "a" }], error: null });
    expect((await syncEyeRows<any>("alice", "p", table)).rows.map(r => r.id)).toEqual(["a"]);
    expect(mocks.queries[1].select).toEqual(["id"]);
  });
  it("keeps saved totals and checkpoint when a refresh fails", async () => {
    const key = datasetKey(table, "p"), meta = { cursor: "2026-11-02T07:00:00Z", reconciledAt: Date.now() };
    mocks.cache.set(`alice:${key}`, [row("a", 324)]); mocks.cache.set(`alice:${key}:sync-v1`, meta);
    mocks.replies.push({ data: null, error: new Error("offline") });
    const result = await syncEyeRows<any>("alice", "p", table);
    expect(result.rows[0].count).toBe(324); expect(result.fromCache).toBe(true);
    expect(mocks.cache.get(`alice:${key}:sync-v1`)).toEqual(meta);
  });
  it("coalesces simultaneous refresh requests", async () => {
    await Promise.all([syncEyeRows("alice", "p", table), syncEyeRows("alice", "p", table)]);
    expect(mocks.queries).toHaveLength(1);
  });
  it("keeps pending changes over a failed-network cache fallback", async () => {
    const key = datasetKey(table, "p");
    mocks.cache.set(`alice:${key}`, [row("a", 324)]);
    mocks.queued = [{ kind: "op", user_id: "alice", payload: { table, action: "update", id: "a", values: { count: 400 } } }];
    mocks.replies.push({ data: null, error: new Error("offline") });
    const result = await syncEyeRows<any>("alice", "p", table);
    expect(result.rows[0].count).toBe(400); expect(result.fromCache).toBe(true);
  });
  it("keyset-pages timestamp ties without skipping a full first page", async () => {
    mocks.replies.push({ data: Array.from({ length: 1000 }, (_, i) => row(`id-${i}`)), error: null }, { data: [row("tail")], error: null });
    expect((await syncEyeRows("alice", "p", table)).rows).toHaveLength(1001);
    expect(mocks.queries[1].or).toEqual(["updated_at.gt.2026-11-02T07:00:00Z,and(updated_at.eq.2026-11-02T07:00:00Z,id.gt.id-999)"]);
  });
  it("preserves this user's pending batch edits and deletes, excluding other users", () => {
    const items: any[] = [{ kind: "op", user_id: "alice", payload: { action: "batch", operations: [
      { table, action: "update", id: "a", values: { count: 99 } },
      { table, action: "delete", id: "b" },
      { table, action: "upsert", values: row("local", 3) },
    ] } }, { kind: "op", user_id: "bob", payload: { table, action: "upsert", values: row("private") } }];
    expect(overlayPending([row("a"), row("b")], items, "alice", "p", table).map(r => [r.id, r.count])).toEqual([["a", 99], ["local", 3]]);
  });
});