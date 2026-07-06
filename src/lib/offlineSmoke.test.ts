// Automated offline smoke test.
//
// Simulates the KoboCollect-style offline field workflow end to end WITHOUT a
// network: a draft is saved offline, finalized into "Ready to send", stays put
// while offline, then syncs to "Sent" exactly once when connectivity returns.
// Mirrors the manual checklist in docs/offline-test-checklist.md.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── In-memory "server" (idempotent upsert keyed by id) ──────────────────────
const serverRows = new Map<string, any>();
let online = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      upsert: async (row: any) => {
        if (!online) return { error: { message: "offline" } };
        serverRows.set(row.id, row); // keyed on id → exactly once
        return { error: null };
      },
    }),
  },
}));

// ── In-memory saved-forms store standing in for IndexedDB ───────────────────
const store = new Map<string, any>();
vi.mock("@/lib/savedForms", () => ({
  listAllSavedEntries: async (status?: string) =>
    [...store.values()].filter((e) => !status || e.status === status),
  setSavedEntryStatus: async (id: string, status: string, patch: any = {}) => {
    const e = store.get(id);
    if (e) store.set(id, { ...e, ...patch, status });
  },
}));

vi.mock("@/lib/specialFormBridge", () => ({
  isSpecialBridgeEntry: () => false,
  syncSpecialSavedForm: async () => null,
}));

import { syncFinalizedSavedForms } from "@/lib/savedFormAutoSync";

const setOnline = (v: boolean) => {
  online = v;
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
};

const mkEntry = (over: any = {}) => ({
  id: "rec-1",
  userId: "u1",
  formId: "f1",
  formName: "HH Survey",
  responses: { q1: "yes" },
  submissionData: { q1: "yes" },
  status: "draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe("offline smoke — draft → ready → sent lifecycle", () => {
  beforeEach(() => {
    serverRows.clear();
    store.clear();
    setOnline(false);
  });

  it("keeps a draft local and unsynced while offline", async () => {
    store.set("rec-1", mkEntry({ status: "draft" }));
    const res = await syncFinalizedSavedForms();
    expect(res.synced).toBe(0);
    expect(serverRows.size).toBe(0);
    expect(store.get("rec-1").status).toBe("draft");
  });

  it("does not sync finalized items while offline", async () => {
    store.set("rec-1", mkEntry({ status: "finalized", finalizedAt: new Date().toISOString() }));
    const res = await syncFinalizedSavedForms();
    expect(res.synced).toBe(0);
    expect(serverRows.size).toBe(0);
    expect(store.get("rec-1").status).toBe("finalized");
  });

  it("syncs finalized → sent exactly once when connectivity returns", async () => {
    store.set("rec-1", mkEntry({ status: "finalized", finalizedAt: new Date().toISOString() }));
    setOnline(true);
    const res = await syncFinalizedSavedForms();
    expect(res.synced).toBe(1);
    expect(res.failed).toBe(0);
    expect(store.get("rec-1").status).toBe("sent");
    expect(serverRows.size).toBe(1);

    // Re-run (e.g. overlapping online + interval triggers) must not duplicate.
    const again = await syncFinalizedSavedForms();
    expect(again.synced).toBe(0);
    expect(serverRows.size).toBe(1);
  });

  it("recovers after a flaky reconnection without duplicating", async () => {
    store.set("rec-1", mkEntry({ status: "finalized", finalizedAt: new Date().toISOString() }));
    // First reconnect attempt still effectively offline → fails cleanly.
    online = false;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const flaky = await syncFinalizedSavedForms();
    expect(serverRows.size).toBe(0);
    expect(flaky.synced).toBe(0);
    // Stable connection → syncs once.
    setOnline(true);
    const ok = await syncFinalizedSavedForms();
    expect(ok.synced).toBe(1);
    expect(serverRows.size).toBe(1);
  });
});
