import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) } } }));
vi.mock("@/lib/deviceCrypto", () => ({ sealRecord: async (row: unknown) => row, unsealAll: async (rows: unknown[]) => rows, unsealRecord: async (row: unknown) => row }));
vi.mock("./projectFormCatalogue", () => ({ fetchProjectFormCatalogue: vi.fn() }));
vi.mock("@/lib/syncAuditLog", () => ({ appendSyncAudit: vi.fn() }));
import { deleteDownloadedForms, listLocalAnswerRows } from "./offlineFormCache";
import { deleteSelectedSavedForms, listDeletableSavedForms } from "./localFormDeletion";
import { listSavedEntries, saveSavedEntry, type SavedFormEntry } from "./savedForms";
import { enqueue, listQueued } from "./programmeModule/offlineQueue";
import { listDeletionPendingInserts } from "./offlineSubmissions";

async function seed(database: string, version: number, stores: string[], store: string, rows: Record<string, any>[]) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(database, version);
    req.onupgradeneeded = () => stores.forEach(name => req.result.createObjectStore(name, { keyPath: "id" }));
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); rows.forEach(row => tx.objectStore(store).put(row)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
const monitor = (store: string, rows: Record<string, any>[]) => seed("acg_monitor_offline", 4, ["offline_forms", "pending_submissions", "autosave_drafts", "edit_conflicts"], store, rows);
const special = (rows: Record<string, any>[]) => seed("acg_offline_submissions", 1, ["pending_inserts"], "pending_inserts", rows);
const entry = (id: string, status: SavedFormEntry["status"], userId = "u1"): SavedFormEntry => ({ id, userId, formId: "f1", formName: `Saved ${id}`, formDescription: "", projectId: "p1", questions: [], groups: [], geofence: null, settings: {}, responses: { village: "Test village" }, gps: null, status, createdAt: "2026-11-28T09:00:00Z", updatedAt: "2026-11-28T09:00:00Z" });

describe("KoboCollect-style selected device deletion", () => {
  beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear(); });

  it("deleting selected blank forms preserves other downloads, every saved instance and other accounts", async () => {
    const blank = (id: string, userId = "u1") => ({ id: `user:${userId}:form:${id}`, form_id: id, owner_user_id: userId, project_id: "p1" });
    await monitor("offline_forms", [blank("f1"), blank("f2"), blank("f1", "u2")]);
    await monitor("pending_submissions", [{ id: "pending", user_id: "u1", form_id: "f1", data: { village: "Unsent" } }]);
    await monitor("autosave_drafts", [{ id: "draft", user_id: "u1", form_id: "f1", data: { village: "Draft" } }]);
    await saveSavedEntry(entry("sent", "sent"));
    expect(await deleteDownloadedForms("u1", ["f1"])).toBe(1);
    expect(await deleteDownloadedForms("u1", ["f1"])).toBe(0);
    expect(await deleteDownloadedForms("u1", ["f2"])).toBe(1);
    expect(await deleteDownloadedForms("u2", ["f1"])).toBe(1);
    expect((await listSavedEntries("u1"))[0].responses).toEqual({ village: "Test village" });
    expect((await listLocalAnswerRows("u1")).pending[0].data).toEqual({ village: "Unsent" });
    expect((await listLocalAnswerRows("u1")).drafts[0].data).toEqual({ village: "Draft" });
  });

  it("Saved Forms includes drafts, Ready to send and Sent without deleting on list or empty selection", async () => {
    for (const status of ["draft", "finalized", "sent"] as const) await saveSavedEntry(entry(status, status));
    expect((await listDeletableSavedForms("u1")).map(row => row.status).sort()).toEqual(["draft", "finalized", "sent"]);
    expect(await deleteSelectedSavedForms("u1", [])).toEqual({ deleted: 0, failed: 0 });
    expect(await listSavedEntries("u1")).toHaveLength(3);
  });

  it("only selected saved instances are removed; other lifecycle states and another account stay intact", async () => {
    await saveSavedEntry(entry("draft", "draft")); await saveSavedEntry(entry("ready", "finalized")); await saveSavedEntry(entry("sent", "sent")); await saveSavedEntry(entry("other-user", "finalized", "u2"));
    expect(await deleteSelectedSavedForms("u1", ["saved:ready", "saved:other-user"])).toEqual({ deleted: 1, failed: 0 });
    expect((await listSavedEntries("u1")).map(row => row.id).sort()).toEqual(["draft", "sent"]);
    expect((await listSavedEntries("u2"))[0].responses.village).toBe("Test village");
  });

  it("deleting a selected special instance cancels its outbound copy and mirror, not unselected special records", async () => {
    await saveSavedEntry({ ...entry("mirror", "sent"), submissionId: "record1" });
    await special([{ id: "queue1", table: "seeclear_monitoring", user_id: "u1", mirrorEntryId: "mirror", row: { id: "record1" }, created_at: "2026-11-28", attempts: 0 }, { id: "queue2", table: "seeclear_monitoring", user_id: "u1", row: { id: "record2" }, created_at: "2026-11-28", attempts: 0 }, { id: "queue3", table: "bmz_monitoring", user_id: "u2", row: { id: "record3" }, created_at: "2026-11-28", attempts: 0 }]);
    const rows = await listDeletableSavedForms("u1");
    expect(rows).toHaveLength(2); expect(rows.find(row => row.id === "saved:mirror")?.status).toBe("finalized");
    expect(await deleteSelectedSavedForms("u1", ["saved:mirror"])).toEqual({ deleted: 1, failed: 0 });
    expect(await listSavedEntries("u1")).toHaveLength(0);
    expect((await listDeletionPendingInserts("u1")).map(row => row.id)).toEqual(["queue2"]);
    expect((await listDeletionPendingInserts("u2")).map(row => row.id)).toEqual(["queue3"]);
  });

  it("selected Eye/Microplanning envelopes are removed without touching unrelated record operations", async () => {
    const selected = enqueue("op", { table: "eye_daily_reports", userId: "u1", values: { id: "eye1" } });
    enqueue("op", { table: "microplan_entries", userId: "u1", values: { id: "m1" } });
    enqueue("op", { table: "eye_daily_reports", userId: "u2", values: { id: "eye2" } });
    enqueue("service", { id: "care" });
    expect(await deleteSelectedSavedForms("u1", [`operation:${selected.submission_uuid}`])).toEqual({ deleted: 1, failed: 0 });
    expect(listQueued()).toHaveLength(3); expect(listQueued().some(row => row.kind === "service")).toBe(true); expect(listQueued().some(row => row.user_id === "u2")).toBe(true);
  });

  it("selected legacy pending submissions and autosaved drafts are deleted only for the active account", async () => {
    await monitor("pending_submissions", [{ id: "p1", user_id: "u1", form_id: "f1", created_at: "2026-11-28" }, { id: "p2", user_id: "u2", form_id: "f1", created_at: "2026-11-28" }]);
    await monitor("autosave_drafts", [{ id: "d1", user_id: "u1", form_id: "f1", updated_at: "2026-11-28" }, { id: "d2", user_id: "u1", form_id: "f2", updated_at: "2026-11-28" }]);
    expect(await deleteSelectedSavedForms("u1", ["pending:p1", "draft:d1"])).toEqual({ deleted: 2, failed: 0 });
    expect((await listLocalAnswerRows("u1")).pending).toEqual([]); expect((await listLocalAnswerRows("u1")).drafts.map(row => row.id)).toEqual(["d2"]);
    expect((await listLocalAnswerRows("u2")).pending.map(row => row.id)).toEqual(["p2"]);
  });

  it("rejects stale account deletion without modifying definitions or saved answers", async () => {
    await monitor("offline_forms", [{ id: "user:u1:form:f1", form_id: "f1", owner_user_id: "u1" }]); await saveSavedEntry(entry("ready", "finalized"));
    await expect(deleteDownloadedForms("u1", ["f1"], () => false)).rejects.toThrow("account changed");
    await expect(deleteSelectedSavedForms("u1", ["saved:ready"], () => false)).rejects.toThrow("account changed");
    expect(await listSavedEntries("u1")).toHaveLength(1); expect(await deleteDownloadedForms("u1", ["f1"])).toBe(1);
  });

  it("retains an instance that is actively being sent", async () => {
    await saveSavedEntry({ ...entry("busy", "finalized"), syncState: "syncing", syncStartedAt: new Date().toISOString() });
    expect(await deleteSelectedSavedForms("u1", ["saved:busy"])).toEqual({ deleted: 0, failed: 1 });
    expect(await listSavedEntries("u1")).toHaveLength(1);
  });
});