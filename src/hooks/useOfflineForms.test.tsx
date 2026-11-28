import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (row: unknown) => row, unsealAll: async (rows: unknown[]) => rows, unsealRecord: async (row: unknown) => row }));
vi.mock("@/lib/offlineFormCache", () => ({ OFFLINE_FORMS_UPDATED_EVENT: "offline-forms-updated", downloadSelectedUserForms: mocks.download }));
import { useOfflineForms } from "./useOfflineForms";
import { ownedOfflineForm, writeSpecialFormGrants } from "@/lib/offlineFormAccess";
import { writeFormsMemberProjects } from "@/lib/formsProjectMembership";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
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
  it("a regular list refresh cannot prune a newly selected special form", async () => {
    localStorage.clear();
    writeFormsMemberProjects("u1", [{ id: "p1", name: "Project" }]);
    const form = { id: "special:p1:seeclear_form", project_id: "p1", name: "See Clear", settings: { specialCollector: "seeclear_form" } };
    writeSpecialFormGrants("u1", [form.id]);
    const hook = renderHook(useOfflineForms);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("acg_monitor_offline", 4);
      req.onsuccess = () => { const tx = req.result.transaction("offline_forms", "readwrite"); tx.objectStore("offline_forms").put(ownedOfflineForm(form, "u1")); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
    await act(async () => { expect(await hook.result.current.pruneStaleForms([])).toBe(0); await hook.result.current.refreshOfflineForms(); });
    expect(hook.result.current.offlineForms.map(row => row.id)).toEqual([form.id]);
  });
});