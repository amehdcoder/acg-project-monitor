import { describe, expect, it, vi } from "vitest";
const { tables } = vi.hoisted(() => ({ tables: {
  beneficiaries: [], beneficiary_services: [], beneficiary_referrals: [
    { id: "a", status: "completed" }, { id: "b", status: "completed" },
    { id: "c", status: "completed" }, { id: "d", status: "initiated" },
  ], beneficiary_home_visits: [], livelihood_assessments: [], project_feedback: [],
} as Record<string, unknown[]> }));
vi.mock("./offlineReadCache", () => ({ cachedRead: async (_key: string, fetcher: () => Promise<unknown>) => fetcher() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let start = 0; let end = 999;
  const query = { select: () => query, eq: () => query, order: () => query, range: (a: number, b: number) => { start = a; end = b; return query; }, then: (resolve: (value: unknown) => void) => resolve({ data: tables[table].slice(start, end + 1), error: null }) };
  return query;
} } }));
import { aggregateIndicators } from "./programmeReport";
describe("record-derived referral rate", () => {
  it("returns a percentage, not a proportion, from real referral statuses", async () => {
    const totals = await aggregateIndicators("project");
    expect(totals.completed_referrals).toBe(3);
    expect(totals.referral_completion).toBe(75);
  });
});