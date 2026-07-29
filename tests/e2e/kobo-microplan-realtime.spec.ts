import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";


/**
 * End-to-end verification of the KoboCollect → Amehnities realtime pipeline.
 *
 * Suite covers:
 *   1. Happy-path 3-community submission → 3 rows ingested + realtime broadcast
 *      + KPI counter visibly updates in the /__test/microplan-kpi harness.
 *   2. Idempotent re-submission does not duplicate rows.
 *   3. Out-of-range `target_population` items are rejected by the webhook
 *      guard and NOT ingested (other valid items in the same payload still
 *      land).
 *   4. Malformed `community_repeat` payload returns HTTP 400 with no writes.
 *   5. Generated XLSForm cover page contains ONLY the full-page `home` image
 *      and no other user-visible controls (asserted by parsing the .xlsx).
 *
 * Required env for the realtime + webhook suites:
 *   KOBO_WEBHOOK_URL     — deployed edge function URL
 *   KOBO_WEBHOOK_SECRET  — matches the function's shared secret
 *   E2E_SUPABASE_URL     — project URL
 *   E2E_SUPABASE_ANON    — anon/publishable key
 *   E2E_PROJECT_ID       — microplanning project UUID
 * Optional (enables UI KPI assertion):
 *   E2E_ACCESS_TOKEN     — Supabase JWT for a user with read access to the project
 *   E2E_REFRESH_TOKEN    — matching refresh token (falls back to access token)
 */

const WEBHOOK_URL = process.env.KOBO_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.KOBO_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;
const ACCESS_TOKEN = process.env.E2E_ACCESS_TOKEN ?? "";
const REFRESH_TOKEN = process.env.E2E_REFRESH_TOKEN ?? "";

const WEBHOOK_READY = !!(WEBHOOK_URL && WEBHOOK_SECRET && SUPABASE_URL && SUPABASE_ANON && PROJECT_ID);

const post = (body: unknown) =>
  fetch(WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kobo-secret": WEBHOOK_SECRET! },
    body: JSON.stringify(body),
  });

test.describe("kobo microplan realtime", () => {
  test.skip(!WEBHOOK_READY, "Set KOBO_WEBHOOK_URL/SECRET + E2E_SUPABASE_URL/ANON + E2E_PROJECT_ID");

  test("multi community_repeat submission ingests, broadcasts realtime and updates KPI UI", async ({ page }) => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      realtime: { params: { eventsPerSecond: 10 } },
    });

    const runId = `e2e-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `E2E FLHF ${runId}`;

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
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      });
    });

    // Mount the KPI harness FIRST so we can observe the count going from 0 → 3
    // as the webhook ingests rows and Supabase broadcasts postgres_changes.
    if (ACCESS_TOKEN) {
      const kpiUrl = `/__test/microplan-kpi?project=${encodeURIComponent(PROJECT_ID!)}&flhf=${encodeURIComponent(flhfName)}&token=${encodeURIComponent(ACCESS_TOKEN)}&refresh=${encodeURIComponent(REFRESH_TOKEN || ACCESS_TOKEN)}`;
      await page.goto(kpiUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("kpi-status")).toHaveText("live", { timeout: 20_000 });
      await expect(page.getByTestId("kpi-count")).toHaveText("0");
    }

    const communities = [
      { name: `${runId}-C1`, lat: 12.001, lng: 9.601, pop: 120 },
      { name: `${runId}-C2`, lat: 12.002, lng: 9.602, pop: 240 },
      { name: `${runId}-C3`, lat: 12.003, lng: 9.603, pop: 360 },
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
      })),
    };


    const res = await post(payload);
    expect(res.ok, `webhook responded ${res.status}: ${await res.text().catch(() => "")}`).toBe(true);

    let rows: any[] = [];
    for (let i = 0; i < 30; i++) {
      const { data, error } = await supabase
        .from("microplan_entries")
        .select("id, idempotency_key, flhf_name, community_name, estimated_total_population, latitude, longitude")
        .eq("project_id", PROJECT_ID!)
        .eq("flhf_name", flhfName);
      if (error) throw error;
      rows = data ?? [];
      if (rows.length >= 3) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(rows).toHaveLength(3);
    const keys = rows.map((r) => r.idempotency_key).sort();
    expect(new Set(keys).size).toBe(3);
    for (const k of keys) expect(k).toMatch(new RegExp(`${koboUuid.replace(/[^a-z0-9]/gi, ".")}_\\d+$`, "i"));
    for (const r of rows) expect(r.flhf_name).toBe(flhfName);
    const names = rows.map((r) => r.community_name).sort();
    expect(names).toEqual(communities.map((c) => c.name).sort());

    await new Promise((r) => setTimeout(r, 1_500));
    expect(seenEvents.length, "no realtime broadcast for microplan_entries").toBeGreaterThan(0);

    // UI assertion — KPI counter must visibly reach 3 (never falling back to
    // demo data) purely off the realtime broadcast the map + counters share.
    if (ACCESS_TOKEN) {
      await expect(page.getByTestId("kpi-status")).toHaveText("live");
      await expect(page.getByTestId("kpi-count")).toHaveText("3", { timeout: 15_000 });
    }

    // Idempotent replay — no duplicates.
    const dup = await post(payload);
    expect(dup.ok).toBe(true);
    const { data: after } = await supabase
      .from("microplan_entries")
      .select("id")
      .eq("project_id", PROJECT_ID!)
      .eq("flhf_name", flhfName);
    expect((after ?? []).length).toBe(3);

    await supabase.removeChannel(channel);
  });

  test("out-of-range estimated_total_population items are rejected by the webhook guard", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const runId = `e2e-guard-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `E2E Guard FLHF ${runId}`;

    // C1 is valid; C2 has a negative population; C3 has an absurdly large one.
    // Only C1 must land — the other two must appear in `rejected_items`.
    const payload = {
      _uuid: koboUuid,
      _submission_time: new Date().toISOString(),
      project_id: PROJECT_ID,
      state: "jigawa", lga: "dutse", ward: "e2e_ward",
      flhf_name: flhfName,
      community_repeat: [
        { community_name: `${runId}-ok`, estimated_total_population: 300 },
        { community_name: `${runId}-neg`, estimated_total_population: -50 },
        { community_name: `${runId}-huge`, estimated_total_population: 99_999_999_999 },
      ],
    };

    const res = await post(payload);
    expect(res.ok, `webhook responded ${res.status}`).toBe(true);
    const body = await res.json();
    expect(body.rows_written).toBe(1);
    expect(body.repeat_items).toBe(3);
    expect(Array.isArray(body.rejected_items)).toBe(true);
    expect(body.rejected_items).toHaveLength(2);
    const reasons = body.rejected_items.map((r: any) => r.reason).sort();
    expect(reasons.every((r: string) => r.includes("out_of_range"))).toBe(true);

    // Poll and confirm the DB really only has the single valid row.
    let rows: any[] = [];
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase
        .from("microplan_entries")
        .select("id, community_name")
        .eq("project_id", PROJECT_ID!)
        .eq("flhf_name", flhfName);
      rows = data ?? [];
      if (rows.length >= 1) break;
      await new Promise((r) => setTimeout(r, 500));

    }
    expect(rows).toHaveLength(1);
    expect(rows[0].community_name).toBe(`${runId}-ok`);
  });

  test("malformed community_repeat returns 400 and writes no rows", async () => {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON!);
    const runId = `e2e-bad-${Date.now()}`;
    const koboUuid = `uuid:${crypto.randomUUID()}`;
    const flhfName = `E2E Bad FLHF ${runId}`;

    // A scalar (string) where an array of objects is required — this is the
    // shape KoboCollect produces when a REST Service is misconfigured with
    // the wrong repeat path. The webhook must refuse it outright.
    const payload = {
      _uuid: koboUuid,
      _submission_time: new Date().toISOString(),
      project_id: PROJECT_ID,
      state: "jigawa", lga: "dutse", ward: "e2e_ward",
      flhf_name: flhfName,
      community_repeat: "not-an-array",
    };

    const res = await post(payload);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("malformed_community_repeat");

    // Give the pipeline a moment, then confirm zero rows were written.
    await new Promise((r) => setTimeout(r, 1_500));
    const { data } = await supabase
      .from("microplan_entries")
      .select("id")
      .eq("project_id", PROJECT_ID!)
      .eq("flhf_name", flhfName);
    expect((data ?? []).length).toBe(0);
  });
});

test.describe("xlsform cover page", () => {
  test("cover page contains only the full-page home image and no other controls", async ({ page }) => {
    await page.goto("/__test/xlsform-cover", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("xlsform-status")).toHaveText("ready", { timeout: 30_000 });

    // Pull the parsed survey sheet from the harness and inspect it here.
    const { rows, sheetNames } = await page.evaluate(() => ({
      rows: (window as any).__xlsformSurveyRows__ as string[][],
      sheetNames: (window as any).__xlsformSheetNames__ as string[],
    }));

    expect(sheetNames).toEqual(expect.arrayContaining(["survey", "choices", "settings"]));
    expect(rows.length).toBeGreaterThan(2);

    const header = rows[0];
    const idx = (name: string) => header.indexOf(name);
    const typeIdx = idx("type");
    const nameIdx = idx("name");
    const labelIdx = idx("label");
    const imageIdx = idx("image");
    const appearanceIdx = idx("appearance");
    expect(typeIdx).toBeGreaterThanOrEqual(0);

    const HIDDEN_META = new Set([
      "start", "end", "today", "deviceid", "username", "phonenumber",
      "phone_number", "simserial", "subscriberid", "audit",
    ]);

    // First row a Kobo respondent actually SEES on screen must be the cover
    // note, sourced from `home`, rendered with `no-label` (i.e. image only).
    let firstVisible: string[] | null = null;
    for (let i = 1; i < rows.length; i++) {
      const t = String(rows[i][typeIdx] ?? "").trim().split(/\s+/)[0];
      if (!t) continue;
      if (HIDDEN_META.has(t)) continue;
      firstVisible = rows[i];
      break;
    }
    expect(firstVisible, "no visible survey rows produced").not.toBeNull();
    expect(String(firstVisible![typeIdx])).toBe("note");
    expect(String(firstVisible![nameIdx])).toBe("welcome_cover_note");
    expect(String(firstVisible![imageIdx])).toBe("home");
    expect(String(firstVisible![appearanceIdx])).toBe("no-label");
    // Label is intentionally a single non-breaking space — no readable text.
    expect(String(firstVisible![labelIdx]).replace(/\s|&#160;|&nbsp;|\u00a0/g, "")).toBe("");

    // The cover note is not inside a group, so KoboCollect renders it as its
    // OWN page. Guarantee there is exactly one row with image=home and it
    // sits before any begin_group / begin_repeat.
    const homeRows = rows.slice(1).filter((r) => String(r[imageIdx] ?? "") === "home");
    expect(homeRows).toHaveLength(1);

    const firstGroupIdx = rows.findIndex((r, i) => {
      if (i === 0) return false;
      const t = String(r[typeIdx] ?? "").trim().split(/\s+/)[0];
      return t === "begin_group" || t === "begin_repeat";
    });
    const coverRowIdx = rows.findIndex((r) => String(r[nameIdx] ?? "") === "welcome_cover_note");
    expect(coverRowIdx).toBeGreaterThan(0);
    if (firstGroupIdx > 0) expect(coverRowIdx).toBeLessThan(firstGroupIdx);
  });
});
