// Integration tests for the one-click XLSForm upload flow.
//
// The Kobo REST API v2 is mocked via an injected fetcher (see upload.ts).
// We cover:
//   1. CREATE — no form_uid → POST /api/v2/imports/ without destination, poll
//      until complete, fetch the freshly-created asset, deploy it.
//   2. OVERWRITE — form_uid given → destination + assetUid included, poll
//      surfaces `updated` uid, existing deployment PATCHed.
//   3. Poll loop — waits across multiple ticks until status === "complete".
//   4. Toast surface — a Kobo error propagates as { error, detail } so the
//      panel's toast() helper renders a clear failure message.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  performKoboXlsformUpload,
  KoboApiError,
  type KoboFetchFn,
} from "./upload.ts";

interface Call {
  path: string;
  method: string;
  body?: any;
}

const makeFetcher = (handler: (call: Call) => any): { fetcher: KoboFetchFn; calls: Call[] } => {
  const calls: Call[] = [];
  const fetcher: KoboFetchFn = async (_server, path, _token, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const call = { path, method, body };
    calls.push(call);
    return handler(call);
  };
  return { fetcher, calls };
};

const baseParams = {
  server_url: "https://kf.kobotoolbox.org",
  api_token: "TEST_TOKEN",
  xlsx_base64: "UEsDBBQAAAA=", // fake bytes, only length matters
};

// ─── 1. CREATE ─────────────────────────────────────────────────────────────
Deno.test("performKoboXlsformUpload — CREATE flow posts imports without destination and deploys new asset", async () => {
  let pollHits = 0;
  const { fetcher, calls } = makeFetcher((c) => {
    if (c.path === "/api/v2/imports/" && c.method === "POST") {
      return { url: "https://kf.kobotoolbox.org/api/v2/imports/imp_1/", status: "processing" };
    }
    if (c.path === "/api/v2/imports/imp_1/") {
      pollHits += 1;
      // First poll still processing, second poll complete with created uid.
      return pollHits === 1
        ? { status: "processing" }
        : { status: "complete", messages: { created: [{ uid: "aNEW123" }] } };
    }
    if (c.path === "/api/v2/assets/aNEW123/?format=json") {
      return { name: "Microplanning", uid: "aNEW123", version_id: "v1", has_deployment: false };
    }
    if (c.path === "/api/v2/assets/aNEW123/deployment/") {
      return { deployed: true };
    }
    throw new Error(`unexpected call ${c.method} ${c.path}`);
  });

  const result = await performKoboXlsformUpload(baseParams, {
    fetcher,
    sleep: () => Promise.resolve(), // skip real waits
  });

  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  assertEquals(result.status, "complete");
  assertEquals(result.form_uid, "aNEW123");
  assertEquals(result.form_title, "Microplanning");

  const importCall = calls[0];
  assertEquals(importCall.path, "/api/v2/imports/");
  assertEquals(importCall.body.destination, undefined, "CREATE must not send destination");
  assertEquals(importCall.body.assetUid, undefined, "CREATE must not send assetUid");
  assertStringIncludes(String(importCall.body.base64Encoded ?? ""), "base64:");

  // Deploy call uses POST for brand new (un-deployed) assets.
  const deploy = calls.find((c) => c.path === "/api/v2/assets/aNEW123/deployment/");
  assertEquals(deploy?.method, "POST");
});

// ─── 2. OVERWRITE ──────────────────────────────────────────────────────────
Deno.test("performKoboXlsformUpload — OVERWRITE flow targets destination/assetUid and PATCHes existing deployment", async () => {
  const persisted: any[] = [];
  const { fetcher, calls } = makeFetcher((c) => {
    if (c.path === "/api/v2/imports/" && c.method === "POST") {
      return { url: "https://kf.kobotoolbox.org/api/v2/imports/imp_2/", status: "processing" };
    }
    if (c.path === "/api/v2/imports/imp_2/") {
      return { status: "complete", messages: { updated: [{ uid: "existingUID" }] } };
    }
    if (c.path === "/api/v2/assets/existingUID/?format=json") {
      return {
        name: "Existing Form",
        uid: "existingUID",
        version_id: "v9",
        has_deployment: true,
        deployment__submission_count: 42,
      };
    }
    if (c.path === "/api/v2/assets/existingUID/deployment/") {
      return { updated: true };
    }
    throw new Error(`unexpected call ${c.method} ${c.path}`);
  });

  const result = await performKoboXlsformUpload(
    { ...baseParams, form_uid: "existingUID", version_id: "row-uuid" },
    {
      fetcher,
      sleep: () => Promise.resolve(),
      persistVersion: async (p) => { persisted.push(p); },
    },
  );

  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  assertEquals(result.form_uid, "existingUID");
  assertEquals(result.submission_count, 42);

  const importCall = calls[0];
  assertEquals(
    importCall.body.destination,
    "https://kf.kobotoolbox.org/api/v2/assets/existingUID/",
  );
  assertEquals(importCall.body.assetUid, "existingUID");

  const deploy = calls.find((c) => c.path === "/api/v2/assets/existingUID/deployment/");
  assertEquals(deploy?.method, "PATCH", "existing deployment must be PATCHed, not POSTed");

  assertEquals(persisted.length, 1);
  assertEquals(persisted[0].version_id, "row-uuid");
  assertEquals(persisted[0].kobo_asset_uid, "existingUID");
});

// ─── 3. Poll timeout / status transitions ──────────────────────────────────
Deno.test("performKoboXlsformUpload — polling loop waits until status becomes terminal", async () => {
  const statuses = ["processing", "processing", "processing", "complete"];
  let i = 0;
  let pollCount = 0;
  const { fetcher } = makeFetcher((c) => {
    if (c.path === "/api/v2/imports/" && c.method === "POST") {
      return { url: "https://kf.kobotoolbox.org/api/v2/imports/imp_3/", status: statuses[i++] };
    }
    if (c.path === "/api/v2/imports/imp_3/") {
      pollCount += 1;
      return { status: statuses[i++] ?? "complete", messages: { created: [{ uid: "polled" }] } };
    }
    if (c.path.startsWith("/api/v2/assets/polled/")) return { name: "Polled", uid: "polled" };
    return {};
  });

  const result = await performKoboXlsformUpload(baseParams, {
    fetcher,
    sleep: () => Promise.resolve(),
    pollTimeoutMs: 60_000,
    pollIntervalMs: 1,
  });

  if (!result.ok) throw new Error("expected ok");
  assertEquals(result.status, "complete");
  if (pollCount < 2) throw new Error(`expected ≥2 poll hits, got ${pollCount}`);
});

// ─── 4. Error surface → user-facing toast payload ──────────────────────────
Deno.test("performKoboXlsformUpload — Kobo import failure surfaces { error, detail } for toast()", async () => {
  const fetcher: KoboFetchFn = async (_s, path) => {
    if (path === "/api/v2/imports/") {
      throw new KoboApiError("auth_failed", 401, "Kobo 401: Invalid token");
    }
    return {};
  };

  const result = await performKoboXlsformUpload(baseParams, { fetcher, sleep: () => Promise.resolve() });

  if (result.ok) throw new Error("expected failure result");
  assertEquals(result.error, "Kobo import failed");
  assertStringIncludes(result.detail, "Invalid token");
  assertEquals(result.status, 401);
  assertEquals(result.code, "auth_failed");
});

Deno.test("performKoboXlsformUpload — missing required params short-circuits with 400", async () => {
  const fetcher: KoboFetchFn = async () => { throw new Error("should not be called"); };
  const result = await performKoboXlsformUpload(
    { server_url: "", api_token: "", xlsx_base64: "" },
    { fetcher },
  );
  if (result.ok) throw new Error("expected failure");
  assertEquals(result.status, 400);
});
