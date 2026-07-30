import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * End-to-end verification of the microplanRepeatItem validation + mapping
 * pipeline through the deployed `kobo-microplan-webhook` edge function.
 *
 * 1. Posts a community_repeat payload with full disaggregations and asserts the
 *    stored `microplan_entries` rows carry the exact pwd_total / cdd_names /
 *    trachoma_7_14y values from the source payload.
 * 2. Posts a strict-mode payload missing those fields and asserts the item is
 *    rejected (no row written) with a clear `invalid_disaggregations` reason.
 *
 * Required env:
 *   KOBO_MICROPLAN_WEBHOOK_URL, KOBO_WEBHOOK_SECRET,
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON, E2E_PROJECT_ID
 */

const WEBHOOK_URL = process.env.KOBO_MICROPLAN_WEBHOOK_URL ?? process.env.KOBO_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KOBO_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;

const READY = !!(WEBHOOK_URL && WEBHOOK_SECRET && SUPABASE_URL && SUPABASE_ANON && PROJECT_ID);

const post = (body: unknown, params: Record<string, string> = {}) => {
  const qs = new URLSearchParams({ project_id: PROJECT_ID!, ...params });
  return fetch(`${WEBHOOK_URL!}?${qs.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
    body: JSON.stringify(body),
  });
};

async function fetchRows(supabase: ReturnType<typeof createClient>, uuid: string, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("microplan_entries")
      .select("idempotency_key, community_name, pwd_total, cdd_names, trachoma_7_14y, geotagged")
      .like("idempotency_key", `${uuid}%`)
      .order("idempotency_key");
    if ((data ?? []).length > 0) return data as Array<Record<string, unknown>>;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [] as Array<Record<string, unknown>>;
}

test.describe("kobo-microplan-webhook disaggregation mapping (E2E)", () => {
  test.skip(!READY, "Kobo webhook / Supabase E2E env vars not configured");

  test("stores the exact disaggregation values from the source payload", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const uuid = `e2e-disagg-${Date.now()}`;
    const payload = {
      _uuid: uuid,
      project_id: PROJECT_ID,
      state: "Jigawa", lga: "Dutse", ward: "Limawa",
      flhf_name: "Limawa PHC",
      community_repeat: [
        {
          community_name: "Nayinawa",
          community_gps: "11.71 9.31 402 5",
          pwd_total: 9, cdd_names: "Aisha, Musa", trachoma_7_14y: 12,
        },
        {
          community_name: "Kachi",
          manual_latitude: "11.90", manual_longitude: "9.10",
          "pwd_grp/pwd_total": "5", "cdd_grp/cdd_names": "Hauwa", "trachoma_grp/trachoma_7_14y": "22",
        },
      ],
    };

    const res = await post(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows_written).toBe(2);

    const rows = await fetchRows(supabase, uuid);
    expect(rows).toHaveLength(2);

    const first = rows.find((r) => r.community_name === "Nayinawa")!;
    expect(first.pwd_total).toBe(9);
    expect(first.cdd_names).toBe("Aisha, Musa");
    expect(first.trachoma_7_14y).toBe(12);
    expect(first.geotagged).toBe(true);

    const second = rows.find((r) => r.community_name === "Kachi")!;
    expect(second.pwd_total).toBe(5);
    expect(second.cdd_names).toBe("Hauwa");
    expect(second.trachoma_7_14y).toBe(22);
    expect(second.geotagged).toBe(true);
  });

  test("rejects repeat items missing required disaggregations in strict mode", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const uuid = `e2e-disagg-missing-${Date.now()}`;
    const res = await post(
      {
        _uuid: uuid,
        project_id: PROJECT_ID,
        state: "Jigawa", lga: "Dutse", ward: "Limawa",
        community_repeat: [{ community_name: "NoDisagg", pwd_total: 4 }],
      },
      { strict_disaggregations: "1" },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows_written).toBe(0);
    const reasons = (body.rejected_items ?? []).map((r: { reason: string }) => r.reason);
    expect(reasons).toContain("invalid_disaggregations");
    const issues = JSON.stringify(body.rejected_items);
    expect(issues).toContain("cdd_names");
    expect(issues).toContain("trachoma_7_14y");

    const rows = await fetchRows(supabase, uuid, 4000);
    expect(rows).toHaveLength(0);
  });

  test("rejects malformed disaggregation types without strict mode", async () => {
    const uuid = `e2e-disagg-bad-${Date.now()}`;
    const res = await post({
      _uuid: uuid,
      project_id: PROJECT_ID,
      state: "Jigawa", lga: "Dutse", ward: "Limawa",
      community_repeat: [{ community_name: "BadTypes", pwd_total: "not-a-number", trachoma_7_14y: -3 }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows_written).toBe(0);
    expect(JSON.stringify(body.rejected_items)).toContain("invalid_disaggregations");
  });
});
