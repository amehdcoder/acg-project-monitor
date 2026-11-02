import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cache: new Map<string, any>(), mutate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "alice" } } } }) } } }));
vi.mock("@/lib/programmeModule/offlineReadCache", () => ({ cachedRead: vi.fn(), cachePatchRows: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn(), cacheGetForUser: async (u: string, k: string) => m.cache.get(`${u}:${k}`) ?? null, cacheSetForUser: async (u: string, k: string, v: unknown) => { m.cache.set(`${u}:${k}`, v); } }));
vi.mock("@/lib/programmeModule/offlineWrite", () => ({ offlineMutate: m.mutate }));
vi.mock("@/lib/savedForms", () => ({ saveSavedEntry: vi.fn(), listAllSavedEntries: vi.fn() }));
vi.mock("@/lib/deviceSync", () => ({ syncDeviceRecords: vi.fn() }));
import { deleteReport } from "../store";
beforeEach(() => { m.cache.clear(); m.mutate.mockReset(); });
it("deletes a report and linked screenings from the requesting user's saved dashboard only", async () => {
  m.cache.set("alice:eye-reports:p", [{ id: "deleted" }, { id: "kept" }]);
  m.cache.set("alice:eye-patients:p", [{ id: "linked", report_id: "deleted" }, { id: "standalone", report_id: null }, { id: "other", report_id: "kept" }]);
  m.cache.set("bob:eye-patients:p", [{ id: "private", report_id: "deleted" }]);
  await deleteReport("p", "deleted");
  expect(m.mutate).toHaveBeenCalledWith({ table: "eye_daily_reports", action: "delete", id: "deleted", userId: "alice" });
  expect(m.cache.get("alice:eye-patients:p").map((p: any) => p.id)).toEqual(["standalone", "other"]);
  expect(m.cache.get("alice:eye-reports:p")).toEqual([{ id: "kept" }]);
  expect(m.cache.get("bob:eye-patients:p")).toHaveLength(1);
});
it("does not remove saved evidence when the authorized deletion fails", async () => {
  m.cache.set("alice:eye-patients:p", [{ id: "linked", report_id: "deleted" }]);
  m.mutate.mockRejectedValueOnce(new Error("Permission denied"));
  await expect(deleteReport("p", "deleted")).rejects.toThrow("Permission denied");
  expect(m.cache.get("alice:eye-patients:p")).toHaveLength(1);
});