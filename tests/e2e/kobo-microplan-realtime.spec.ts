import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * End-to-end verification of the KoboCollect → Amehnities realtime pipeline.
 *
 * Posts a synthetic XLSForm submission carrying THREE `community_repeat`
 * entries to the deployed `kobo-microplan-webhook` Edge Function, then
 * verifies (a) exactly three rows land in `public.microplan_entries` with
 * unique `${_uuid}_${index}` idempotency keys inheriting the same FLHF
 * parent, and (b) a `postgres_changes` broadcast fires so the microplan
 * map + KPI counters refresh live.
 *
 * Requires the following env vars — the spec skips itself when any are
 * missing so the suite stays green in local sandboxes without secrets:
 *   KOBO_WEBHOOK_URL     — full URL to the deployed edge function
 *   KOBO_WEBHOOK_SECRET  — matches the function's shared secret
 *   E2E_SUPABASE_URL     — project URL (for realtime + REST verification)
 *   E2E_SUPABASE_ANON    — publishable/anon key
 *   E2E_PROJECT_ID       — a microplanning project UUID visible to the anon
 *                          role via existing RLS (webhook rows land with
 *                          `created_by IS NULL`, which project members can
 *                          read).
 */

const WEBHOOK_URL = process.env.KOBO_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KOBO_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;

const ALL_SET = !!(WEBHOOK_URL && WEBHOOK_SECRET && SUPABASE_URL && SUPABASE_ANON && PROJECT_ID);

test.describe("kobo microplan realtime", () => {
  test.skip(!ALL_SET, "Set KOBO_WEBHOOK_URL/SECRET + E2E_SUPABASE_URL/ANON + E2E_PROJECT_ID");

  test("multi community_repeat submission ingests + broadcasts realtime", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      realtime: { params: { eventsPerSecond: 10 } },
    });

    const runId = `e2e-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `E2E FLHF ${runId}`;

    // Subscribe FIRST so we catch the postgres_changes broadcast that fires
    // when the webhook upserts the new rows.
    const seenEvents: unknown[] = [];
    const channel = supabase
      .channel(`e2e-microplan-${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "microplan_entries", filter: `project_id=eq.${PROJECT_ID}` },
        (payload) => seenEvents.push(payload),
      );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("realtime subscribe timeout")), 15_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    // Deterministic 3-community payload mirroring KoboCollect's flat + repeat
    // JSON: parent fields once, `community_repeat` array with per-iteration
    // community/settlement/context/population/GPS values.
    const communities = [
      { name: `${runId}-C1`, lat: 12.001, lng: 9.601, pop: 120, target: 100 },
      { name: `${runId}-C2`, lat: 12.002, lng: 9.602, pop: 240, target: 220 },
      { name: `${runId}-C3`, lat: 12.003, lng: 9.603, pop: 360, target: 300 },
    ];
    const payload = {
      _uuid: koboUuid,
      _id: Date.now(),
      _submission_time: new Date().toISOString(),
      project_id: PROJECT_ID,
      state: "jigawa",
      lga: "dutse",
      ward: "e2e_ward",
      flhf_name: flhfName,
      flhf_latitude: 12.0,
      flhf_longitude: 9.6,
      community_repeat: communities.map((c) => ({
        community_name: c.name,
        settlement_name: `${c.name}-S1`,
        community_latitude: c.lat,
        community_longitude: c.lng,
        "context_grp/accessibility": "accessible",
        "context_grp/terrain_type": "flat",
        "context_grp/security_clearance": "cleared",
        estimated_total_population: c.pop,
        target_population: c.target,
      })),
    };

    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
      body: JSON.stringify(payload),
    });
    expect(res.ok, `webhook responded ${res.status}: ${await res.text().catch(() => "")}`).toBe(true);

    // Poll REST (respecting RLS) until all three rows appear — allows for the
    // edge function's async upsert loop and realtime propagation.
    let rows: any[] = [];
    for (let i = 0; i < 30; i++) {
      const { data, error } = await supabase
        .from("microplan_entries")
        .select("id, idempotency_key, flhf_name, community_name, target_population, latitude, longitude")
        .eq("project_id", PROJECT_ID!)
        .eq("flhf_name", flhfName);
      if (error) throw error;
      rows = data ?? [];
      if (rows.length >= 3) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(rows).toHaveLength(3);
    // Idempotency keys must be per-index and unique.
    const keys = rows.map((r) => r.idempotency_key).sort();
    expect(new Set(keys).size).toBe(3);
    for (const k of keys) expect(k).toMatch(new RegExp(`${koboUuid.replace(/[^a-z0-9]/gi, ".")}_\\d+$`, "i"));
    // Parent FLHF inherited on every child row.
    for (const r of rows) expect(r.flhf_name).toBe(flhfName);
    // Community names & GPS preserved.
    const names = rows.map((r) => r.community_name).sort();
    expect(names).toEqual(communities.map((c) => c.name).sort());

    // Give realtime a beat, then confirm at least one broadcast landed — this
    // is exactly what wakes the map + KPI counters live.
    await new Promise((r) => setTimeout(r, 1_500));
    expect(seenEvents.length, "no realtime broadcast for microplan_entries").toBeGreaterThan(0);

    // Re-post same payload — idempotency keys must prevent duplicates.
    const dup = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
      body: JSON.stringify(payload),
    });
    expect(dup.ok).toBe(true);
    const { data: after } = await supabase
      .from("microplan_entries")
      .select("id")
      .eq("project_id", PROJECT_ID!)
      .eq("flhf_name", flhfName);
    expect((after ?? []).length).toBe(3);

    await supabase.removeChannel(channel);
  });
});
