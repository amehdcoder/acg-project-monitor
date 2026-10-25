import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), auth: { getSession: async () => ({ data: { session: null } }) } } }));
import { offlineMutate } from "./offlineWrite";
import { enqueue, listQueued } from "./offlineQueue";
import { supabase } from "@/integrations/supabase/client";

describe("offline saving", () => {
  beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "onLine", { value: false, configurable: true }); });
  it("queues a home visit insert offline with a fixed id", async () => {
    const r = await offlineMutate({ table: "beneficiary_home_visits", action: "insert", values: { status: "dispatched" } });
    expect(r.queued).toBe(true);
    const q = listQueued();
    expect(q).toHaveLength(1);
    expect((q[0].payload as { values: { id: string } }).values.id).toBe(r.id);
  });
  it("folds edits to a not-yet-synced beneficiary into its pending registration", async () => {
    const b = enqueue("beneficiary", { full_name: "A" });
    await offlineMutate({ table: "beneficiaries", action: "update", values: { status: "active" }, id: b.submission_uuid });
    const q = listQueued();
    expect(q).toHaveLength(1);
    expect(q[0].payload).toMatchObject({ full_name: "A", status: "active", id: b.submission_uuid });
  });
  it("queues a Graduation gate without replacing unrelated profile data", async () => {
    const r = await offlineMutate({ table: "beneficiaries", action: "graduation", id: "beneficiary-1", values: { status: "verified", decision_source: "manual" } });
    expect(r.queued).toBe(true);
    expect(listQueued()[0].payload).toMatchObject({ action: "graduation", id: "beneficiary-1", values: { status: "verified" } });
  });
  it("rejects updates affecting zero rows instead of reporting success", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    vi.mocked(supabase.from).mockReturnValue({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) } as never);
    await expect(offlineMutate({ table: "beneficiaries", action: "update", id: "missing", values: { status: "active" } })).rejects.toThrow("could not be updated");
    expect(listQueued()).toHaveLength(0);
  });
});
