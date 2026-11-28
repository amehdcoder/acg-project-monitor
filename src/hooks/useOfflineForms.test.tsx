import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (row: unknown) => row, unsealAll: async (rows: unknown[]) => rows, unsealRecord: async (row: unknown) => row }));
vi.mock("@/lib/offlineFormCache", () => ({ OFFLINE_FORMS_UPDATED_EVENT: "offline-forms-updated", downloadSelectedUserForms: mocks.download }));
import { useOfflineForms } from "./useOfflineForms";
describe("manual-only form downloads", () => {
  beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); mocks.download.mockReset(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
  it("mount, focus, reconnect and access refresh do not download definitions", async () => {
    const hook = renderHook(useOfflineForms);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      for (const event of ["focus", "offline", "online", "forms-project-access", "offline-forms-updated"]) window.dispatchEvent(new Event(event));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mocks.download).not.toHaveBeenCalled(); expect(hook.result.current.offlineForms).toEqual([]);
  });
  it("an explicit multi-form selection passes only the selected IDs", async () => {
    mocks.download.mockResolvedValue({ added: 2, updated: 0, unchanged: 0 });
    const hook = renderHook(useOfflineForms);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => { await hook.result.current.downloadForms([{ id: "f1", name: "Survey", project_id: "p1" }, { id: "f3", name: "Follow-up", project_id: "p2" }]); });
    expect(mocks.download).toHaveBeenCalledWith("u1", ["f1", "f3"], expect.any(Function));
  });
});