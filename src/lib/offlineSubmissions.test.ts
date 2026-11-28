import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ writes: vi.fn(async () => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) }, from: () => ({ insert: mocks.writes, upsert: mocks.writes }) } }));
vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (row: unknown) => row, unsealRecord: async (row: unknown) => row }));
vi.mock("@/lib/savedForms", () => ({ getSavedEntry: async () => null, setSavedEntryStatus: vi.fn() }));
vi.mock("@/lib/referenceSyncLedger", () => ({ cascadeReferenceEntities: async () => ({}), resolveReferences: (row: unknown) => row }));
import { queueOrInsert, listReadyPendingInserts, flushSubmissionQueue, initOfflineSubmissions } from "./offlineSubmissions";
const id1 = "00000000-0000-4000-8000-000000000001", id2 = "00000000-0000-4000-8000-000000000002";
describe("special form Ready to send", () => {
  beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); mocks.writes.mockClear(); Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); });
  it("queued special forms are not sent on reconnect, boot or an unselected drain", async () => {
    await queueOrInsert("seeclear_monitoring", { id: id1, created_by: "u1", status: "sent" }, true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    initOfflineSubmissions(); window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange"));
    expect((await flushSubmissionQueue({ force: true })).inserted).toBe(0);
    expect(mocks.writes).not.toHaveBeenCalled(); expect(await listReadyPendingInserts("u1")).toHaveLength(1);
  });
  it("only selected records belonging to the signed-in user are sent", async () => {
    await queueOrInsert("seeclear_monitoring", { id: id1, created_by: "u1", status: "sent" }, true);
    await queueOrInsert("seeclear_monitoring", { id: id2, created_by: "u1", status: "sent" }, true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const result = await flushSubmissionQueue({ selectedIds: [`seeclear_monitoring::${id1}`], userId: "u1", force: true });
    expect(result.inserted).toBe(1); expect(mocks.writes).toHaveBeenCalledTimes(1);
    expect((await listReadyPendingInserts("u1")).map(row => row.row.id)).toEqual([id2]);
  });
  it("failed selected sends remain in Ready to send", async () => {
    await queueOrInsert("seeclear_monitoring", { id: id1, created_by: "u1", status: "sent" }, true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.writes.mockResolvedValueOnce({ error: { message: "network unavailable" } } as never);
    expect((await flushSubmissionQueue({ selectedIds: [`seeclear_monitoring::${id1}`], userId: "u1", force: true })).inserted).toBe(0);
    expect((await listReadyPendingInserts("u1"))[0].last_error).toBe("network unavailable");
  });
});