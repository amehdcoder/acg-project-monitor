import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(async () => undefined) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) } } }));
vi.mock("./offlineWrite", () => ({ runOp: mocks.run }));
import { enqueue, flushQueue, listQueued } from "./offlineQueue";
describe("specialized collection operation sending", () => {
  beforeEach(() => { localStorage.clear(); mocks.run.mockClear(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
  it("background operation flushes leave Eye and Microplanning collection entries untouched", async () => {
    for (const table of ["eye_daily_reports", "eye_daily_patients", "microplan_entries"]) enqueue("op", { table, userId: "u1", action: "insert", values: { id: table } });
    expect(await flushQueue()).toEqual({ sent: 0, failed: 0 }); expect(mocks.run).not.toHaveBeenCalled(); expect(listQueued()).toHaveLength(3);
  });
  it("the selected collection envelope sends without sending another envelope", async () => {
    const selected = enqueue("op", { table: "eye_daily_reports", userId: "u1", action: "batch", operations: [] });
    enqueue("op", { table: "microplan_entries", userId: "u1", action: "insert", values: { id: "m1" } });
    expect(await flushQueue([selected.submission_uuid])).toEqual({ sent: 1, failed: 0 }); expect(mocks.run).toHaveBeenCalledTimes(1); expect(listQueued()[0].payload.table).toBe("microplan_entries");
  });
});