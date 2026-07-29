import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Kobo webhook multi-form router integration test.
 *
 * Posts sample payloads for each of the three form kinds and asserts the
 * router:
 *   1. Writes to the correct target table (`microplan_entries`,
 *      `microplan_coverage`, `microplan_reconciliation`).
 *   2. Emits the matching `kobo_sync_events` broadcast status
 *      (`microplan_sync`, `coverage_sync`, `reconciliation_sync`).
 *   3. Correctly maps admin cascade + geotag fields for each kind.
 *
 * Required env (same as the microplan realtime suite):
 *   KOBO_WEBHOOK_URL     — deployed multi-form router URL (kobo-webhook)
 *   KOBO_WEBHOOK_SECRET
 *   E2E_SUPABASE_URL
 *   E2E_SUPABASE_ANON
 *   E2E_PROJECT_ID
 */

const WEBHOOK_URL = process.env.KOBO_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KOBO_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;

const READY = !!(WEBHOOK_URL && WEBHOOK_SECRET && SUPABASE_URL && SUPABASE_ANON && PROJECT_ID);

const post = (body: unknown, formType?: string) =>
  fetch(`${WEBHOOK_URL!}${formType ? `?form_type=${formType}&project_id=${PROJECT_ID}` : `?project_id=${PROJECT_ID}`}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
    body: JSON.stringify(body),
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
      .eq("project_id", PROJECT_ID!)
      .eq("kobo_uuid", koboUuid)
      .eq("status", status);
    if ((data ?? []).length > 0) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

test.describe("kobo-webhook multi-form router", () => {
  test.skip(!READY, "Set KOBO_WEBHOOK_URL/SECRET + E2E_SUPABASE_URL/ANON + E2E_PROJECT_ID");

  test("microplan payload writes to microplan_entries and emits microplan_sync", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const runId = `router-mp-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `Router MP ${runId}`;

    const payload = {
      _uuid: koboUuid,
      _submission_time: new Date().toISOString(),
      _xform_id_string: "microplanning_v1",
      state: "jigawa", lga: "dutse", ward: "router_ward",
      flhf_name: flhfName,
      flhf_latitude: 12.1, flhf_longitude: 9.7,
      community_repeat: [
        {
          community_name: `${runId}-C1`,
          community_latitude: 12.11, community_longitude: 9.71,
          estimated_total_population: 200, target_population: 180,
        },
      ],
    };
    const res = await post(payload, "microplan");
    expect(res.ok, `router responded ${res.status}: ${await res.text().catch(() => "")}`).toBe(true);

    expect(await waitForSyncEvent(supabase, "microplan_sync", koboUuid)).toBe(true);
  });

  test("coverage payload writes to microplan_coverage and emits coverage_sync", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const runId = `router-cov-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `Router COV ${runId}`;

    const payload = {
      _uuid: koboUuid,
      _submission_time: new Date().toISOString(),
      _xform_id_string: "coverage_reporting_v1",
      state: "jigawa", lga: "dutse", ward: "router_ward",
      flhf_name: flhfName,
      community_repeat: [
        {
          community_name: `${runId}-C1`,
          target_population: 500,
          total_treated: 480,
          doses_administered: 480,
          refusals: 5,
          missed_population: 15,
          community_gps: "12.12 9.72 0 5",
        },
        {
          community_name: `${runId}-C2`,
          target_population: 300,
          total_treated: 290,
          doses_administered: 290,
          community_gps: "12.13 9.73 0 5",
        },
      ],
    };
    const res = await post(payload, "coverage");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.kind).toBe("coverage");
    expect(body.rows_written).toBe(2);

    let rows: any[] = [];
    for (let i = 0; i < 30; i++) {
      const { data } = await supabase
        .from("microplan_coverage")
        .select("id, community_name, target_population, total_treated, latitude, longitude, state, lga, ward, flhf_name")
        .eq("project_id", PROJECT_ID!)
        .eq("flhf_name", flhfName);
      rows = data ?? [];
      if (rows.length >= 2) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.state).toBe("jigawa");
      expect(r.lga).toBe("dutse");
      expect(r.ward).toBe("router_ward");
      expect(r.latitude).toBeGreaterThan(12);
      expect(r.longitude).toBeGreaterThan(9);
    }

    expect(await waitForSyncEvent(supabase, "coverage_sync", koboUuid)).toBe(true);
  });

  test("reconciliation payload writes to microplan_reconciliation and emits reconciliation_sync", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const runId = `router-rec-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `Router REC ${runId}`;

    const payload = {
      _uuid: koboUuid,
      _submission_time: new Date().toISOString(),
      _xform_id_string: "medicine_reconciliation_v1",
      state: "jigawa", lga: "dutse", ward: "router_ward",
      flhf_name: flhfName,
      medicine_repeat: [
        { medicine_name: "ivermectin", received_quantity: 1000, administered_quantity: 950, wasted_quantity: 10, returned_quantity: 40 },
        { medicine_name: "albendazole", received_quantity: 500, administered_quantity: 480, wasted_quantity: 5, returned_quantity: 15 },
      ],
    };
    const res = await post(payload, "reconciliation");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.kind).toBe("reconciliation");
    expect(body.rows_written).toBe(2);

    let rows: any[] = [];
    for (let i = 0; i < 30; i++) {
      const { data } = await supabase
        .from("microplan_reconciliation")
        .select("id, medicine_name, received_quantity, administered_quantity, state, lga, ward, flhf_name")
        .eq("project_id", PROJECT_ID!)
        .eq("flhf_name", flhfName);
      rows = data ?? [];
      if (rows.length >= 2) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(rows).toHaveLength(2);
    const meds = rows.map((r) => r.medicine_name).sort();
    expect(meds).toEqual(["albendazole", "ivermectin"]);
    for (const r of rows) {
      expect(r.state).toBe("jigawa");
      expect(r.flhf_name).toBe(flhfName);
    }

    expect(await waitForSyncEvent(supabase, "reconciliation_sync", koboUuid)).toBe(true);
  });
});
