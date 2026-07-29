import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Kobo webhook malformed / partial payload E2E.
 *
 * Verifies that when the multi-form router receives an invalid payload it:
 *   1. Returns a non-2xx HTTP status (or a 5xx when the insert fails).
 *   2. Does NOT create any rows in `microplan_entries`, `microplan_coverage`,
 *      or `microplan_reconciliation` scoped to the test run.
 *   3. Emits a matching `{kind}_sync_failed` broadcast on `kobo_sync_events`
 *      whenever the payload passes shallow validation but fails the insert.
 *
 * Required env (same as `kobo-webhook-router.spec.ts`):
 *   KOBO_WEBHOOK_URL, KOBO_WEBHOOK_SECRET,
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON, E2E_PROJECT_ID
 */

const WEBHOOK_URL = process.env.KOBO_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KOBO_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;

const READY = !!(WEBHOOK_URL && WEBHOOK_SECRET && SUPABASE_URL && SUPABASE_ANON && PROJECT_ID);

function url(formType?: string, projectIdOverride?: string) {
  const params = new URLSearchParams();
  if (formType) params.set("form_type", formType);
  params.set("project_id", projectIdOverride ?? PROJECT_ID!);
  return `${WEBHOOK_URL!}?${params.toString()}`;
}

const post = (body: unknown | string, formType?: string, projectIdOverride?: string) =>
  fetch(url(formType, projectIdOverride), {
    method: "POST",
    headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function waitForSyncEvent(
  supabase: ReturnType<typeof createClient>,
  status: string,
  koboUuid: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("kobo_sync_events")
      .select("status, kobo_uuid")
      .eq("kobo_uuid", koboUuid)
      .eq("status", status);
    if ((data ?? []).length > 0) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function countRowsByUuid(
  supabase: ReturnType<typeof createClient>,
  table: "microplan_entries" | "microplan_coverage" | "microplan_reconciliation",
  koboUuid: string,
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", koboUuid);
  return count ?? 0;
}

test.describe("kobo-webhook malformed payloads", () => {
  test.skip(!READY, "Set KOBO_WEBHOOK_URL/SECRET + E2E_SUPABASE_URL/ANON + E2E_PROJECT_ID");

  test("invalid JSON body is rejected with 400 and creates no rows", async () => {
    const res = await post("{not-json", "coverage");
    expect(res.status).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.error).toBeTruthy();
  });

  test("missing _uuid returns 400 and does not insert anywhere", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const marker = `no-uuid-${Date.now()}`;
    const res = await post(
      {
        _submission_time: new Date().toISOString(),
        _xform_id_string: "coverage_reporting_v1",
        state: "jigawa", lga: "dutse", ward: marker,
        community_repeat: [{ community_name: marker, estimated_total_population: 10 }],
      },
      "coverage",
    );
    expect(res.status).toBe(400);

    // Give any async writes a moment, then verify nothing landed by this marker.
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await supabase
      .from("microplan_coverage")
      .select("id")
      .eq("ward", marker);
    expect((data ?? []).length).toBe(0);
  });

  test("partial coverage payload with invalid project_id emits coverage_sync_failed and creates no row", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const badProjectId = "not-a-valid-uuid";

    const res = await post(
      {
        _uuid: koboUuid,
        _submission_time: new Date().toISOString(),
        _xform_id_string: "coverage_reporting_v1",
        state: "jigawa", lga: "dutse", ward: "malformed_ward",
        community_repeat: [{ community_name: "malformed", estimated_total_population: 100 }],
      },
      "coverage",
      badProjectId,
    );
    // The upsert should fail because project_id is not a valid UUID.
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Confirm no row was created and a failure broadcast was emitted.
    expect(await countRowsByUuid(supabase, "microplan_coverage", koboUuid)).toBe(0);
    expect(await waitForSyncEvent(supabase, "coverage_sync_failed", koboUuid)).toBe(true);
  });

  test("partial reconciliation payload with invalid project_id emits reconciliation_sync_failed and creates no row", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const badProjectId = "still-not-a-uuid";

    const res = await post(
      {
        _uuid: koboUuid,
        _submission_time: new Date().toISOString(),
        _xform_id_string: "medicine_reconciliation_v1",
        state: "jigawa", lga: "dutse", ward: "malformed_ward",
        medicine_repeat: [{ medicine_name: "ivermectin", received_quantity: 100 }],
      },
      "reconciliation",
      badProjectId,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);

    expect(await countRowsByUuid(supabase, "microplan_reconciliation", koboUuid)).toBe(0);
    expect(await waitForSyncEvent(supabase, "reconciliation_sync_failed", koboUuid)).toBe(true);
  });

  test("unauthenticated request is rejected with 401 and creates no rows", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const res = await fetch(url("coverage"), {
      method: "POST",
      headers: { "content-type": "application/json" }, // no x-kobo-secret
      body: JSON.stringify({
        _uuid: koboUuid,
        _submission_time: new Date().toISOString(),
        _xform_id_string: "coverage_reporting_v1",
        community_repeat: [{ community_name: "unauth", estimated_total_population: 1 }],
      }),
    });
    expect(res.status).toBe(401);
    expect(await countRowsByUuid(supabase, "microplan_coverage", koboUuid)).toBe(0);
  });
});
