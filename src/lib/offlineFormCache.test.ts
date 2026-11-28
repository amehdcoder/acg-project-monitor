import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ownedOfflineForm } from "./offlineFormAccess";
import { normalizeOfflineForm } from "./offlineFormPlan";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./projectFormCatalogue", () => ({ fetchProjectFormCatalogue: mocks.fetch }));
vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (row: unknown) => row, unsealAll: async (rows: unknown[]) => rows }));
import { downloadSelectedUserForms } from "./offlineFormCache";

const form = (id: string, label = "Community") => ({ id, name: id, project_id: "p1", questions: [{ id: "q1", label, type: "text" }], settings: {}, status: "active" });
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("acg_monitor_offline", 4);
    req.onupgradeneeded = () => { for (const name of ["offline_forms", "pending_submissions", "autosave_drafts"]) req.result.createObjectStore(name, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function seed(store: string, rows: Record<string, any>[]) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite"); rows.forEach(row => tx.objectStore(store).put(row));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
async function read(store = "offline_forms") {
  const db = await database();
  const rows = await new Promise<any[]>((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  db.close(); return rows;
}
const cached = (id: string, user = "u1") => ownedOfflineForm({ ...normalizeOfflineForm(form(id)), downloaded_at: "2026-11-01" }, user);

describe("explicit offline form downloads", () => {
  beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); mocks.fetch.mockReset(); mocks.fetch.mockResolvedValue([form("f1"), form("f2")]); });
  it("an empty selection downloads nothing and does not contact the server", async () => {
    expect(await downloadSelectedUserForms("u1", [])).toEqual({ added: 0, updated: 0, unchanged: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(await read()).toEqual([]);
  });
  it("downloads only the chosen form, not every accessible form", async () => {
    expect(await downloadSelectedUserForms("u1", ["f2"])).toEqual({ added: 1, updated: 0, unchanged: 0 });
    expect((await read()).map(row => row.form_id)).toEqual(["f2"]);
  });
  it("updates only the selected definition and preserves drafts, pending entries and other users", async () => {
    await seed("offline_forms", [cached("f1"), cached("f2"), cached("f1", "u2")]);
    const draft = { id: "d1", form_id: "f1", responses: { q1: "Saved answer" } };
    const pending = { id: "s1", form_id: "f1", data: { q1: "Ready answer" } };
    await seed("autosave_drafts", [draft]); await seed("pending_submissions", [pending]);
    mocks.fetch.mockResolvedValue([form("f1", "Village"), form("f2", "Changed but not selected")]);
    expect(await downloadSelectedUserForms("u1", ["f1"])).toEqual({ added: 0, updated: 1, unchanged: 0 });
    const rows = await read(); expect(rows.find(row => row.owner_user_id === "u1" && row.form_id === "f1").questions[0].label).toBe("Village");
    expect(rows.find(row => row.owner_user_id === "u1" && row.form_id === "f2")).toEqual(cached("f2"));
    expect(rows.find(row => row.owner_user_id === "u2")).toEqual(cached("f1", "u2"));
    expect(await read("autosave_drafts")).toEqual([draft]); expect(await read("pending_submissions")).toEqual([pending]);
  });
  it("keeps the encrypted copy and download date when the definition is unchanged", async () => {
    await seed("offline_forms", [cached("f1")]);
    expect(await downloadSelectedUserForms("u1", ["f1"])).toEqual({ added: 0, updated: 0, unchanged: 1 });
    expect(await read()).toEqual([cached("f1")]);
  });
  it("does not download updates offline", async () => {
    await seed("offline_forms", [cached("f1")]); Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await expect(downloadSelectedUserForms("u1", ["f1"])).rejects.toThrow("Connect");
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(await read()).toEqual([cached("f1")]);
  });
  it("rejects a revoked selection without writing or deleting saved forms", async () => {
    await seed("offline_forms", [cached("f1")]); mocks.fetch.mockResolvedValue([form("f2")]);
    await expect(downloadSelectedUserForms("u1", ["f1", "f2"])).rejects.toThrow("access has changed");
    expect(await read()).toEqual([cached("f1")]);
  });
  it("rejects stale account completions before writing", async () => {
    let active = true; mocks.fetch.mockImplementation(async () => { active = false; return [form("f1")]; });
    await expect(downloadSelectedUserForms("u1", ["f1"], () => active)).rejects.toThrow("account changed");
    expect(await read()).toEqual([]);
  });
});