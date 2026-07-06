import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory server table keyed by row id. An upsert on the same id must never
// create a second row — this is what guarantees "exactly once".
const serverRows = new Map<string, any>();
let insertCalls = 0;
let failNextN = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    },
    from: () => ({
      upsert: async (row: any) => {
        insertCalls++;
        if (failNextN > 0) {
          failNextN--;
          return { error: { message: "network flaked" } };
        }
        // Idempotent server behaviour: keyed on id.
        serverRows.set(row.id, row);
        return { error: null };
      },
    }),
  },
}));

// Simple in-memory saved-forms store.
const store = new Map<string, any>();
vi.mock("@/lib/savedForms", () => ({
  listAllSavedEntries: async (status?: string) =>
    [...store.values()].filter((e) => !status || e.status === status),
  setSavedEntryStatus: async (id: string, status: string, patch: any = {}) => {
    const existing = store.get(id);
    if (existing) store.set(id, { ...existing, ...patch, status });
  },
}));

vi.mock("@/lib/specialFormBridge", () => ({
  isSpecialBridgeEntry: () => false,
  syncSpecialSavedForm: async () => null,
}));

import { syncFinalizedSavedForms, submissionIdForEntry } from "@/lib/savedFormAutoSync";

const makeEntry = (id: string) => ({
  id,
  userId: "u1",
  formId: "f1",
  formName: "Form",
  formDescription: "",
  projectId: "p1",
  questions: [],
  groups: [],
  geofence: null,
  settings: {},
  responses: { a: 1 },
  gps: null,
  status: "finalized",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("savedFormAutoSync exactly-once", () => {
  beforeEach(() => {
    serverRows.clear();
    store.clear();
    insertCalls = 0;
    failNextN = 0;
  });

  it("moves a finalized entry to sent exactly once with no duplicate rows", async () => {
    store.set("e1", makeEntry("e1"));
    const res = await syncFinalizedSavedForms();
    expect(res.synced).toBe(1);
    expect(serverRows.size).toBe(1);
    expect(store.get("e1").status).toBe("sent");
  });

  it("never duplicates when the same batch runs multiple times", async () => {
    store.set("e1", makeEntry("e1"));
    await syncFinalizedSavedForms();
    await syncFinalizedSavedForms();
    await syncFinalizedSavedForms();
    // Entry is already "sent" so it is no longer re-fetched; server has one row.
    expect(serverRows.size).toBe(1);
  });

  it("recovers from a flaky network without creating duplicates", async () => {
    store.set("e1", makeEntry("e1"));
    // First attempt fails mid-flight, entry stays finalized and retries.
    failNextN = 1;
    const first = await syncFinalizedSavedForms();
    expect(first.failed).toBe(1);
    expect(store.get("e1").status).toBe("finalized");

    const second = await syncFinalizedSavedForms();
    expect(second.synced).toBe(1);
    // Despite multiple write attempts, the deterministic id keeps it to one row.
    expect(serverRows.size).toBe(1);
    expect(store.get("e1").status).toBe("sent");
  });

  it("uses a stable deterministic submission id per entry", () => {
    const e = makeEntry("abc") as any;
    expect(submissionIdForEntry(e)).toBe("abc");
    e.submissionId = "fixed-id";
    expect(submissionIdForEntry(e)).toBe("fixed-id");
  });
});
