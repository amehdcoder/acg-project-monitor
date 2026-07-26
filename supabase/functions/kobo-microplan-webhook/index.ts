// Public Kobo webhook — ingests microplanning submissions into
// public.microplan_entries with idempotency (per _uuid).
//
// Auth: header `x-kobo-secret` OR `Authorization: Bearer <KOBO_WEBHOOK_SECRET>`.
// Every request (even rejected ones) is logged into kobo_webhook_events.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-kobo-secret, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function pickFirst(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    // Support Kobo dotted / grouped names as well as flat names
    const direct = obj[k];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    for (const [dk, dv] of Object.entries(obj)) {
      if (dk.endsWith(`/${k}`) && typeof dv === "string" && (dv as string).trim()) {
        return (dv as string).trim();
      }
    }
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  const v = pickFirst(obj, keys);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractGeo(payload: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const geo = payload["_geolocation"];
  if (Array.isArray(geo) && geo.length >= 2) {
    const [lat, lng] = geo;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  }
  // Fallback: `community_gps` = "lat lng alt acc"
  const gpsStr = pickFirst(payload, ["community_gps", "settlement_gps", "gps", "_geopoint"]);
  if (gpsStr) {
    const parts = gpsStr.split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
      return { lat: parts[0], lng: parts[1] };
    }
  }
  return { lat: null, lng: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const logEvent = async (row: Record<string, unknown>) => {
    try {
      await supabase.from("kobo_webhook_events").insert(row);
    } catch (e) {
      console.error("kobo_webhook_events insert failed:", (e as Error).message);
    }
  };

  const secret = Deno.env.get("KOBO_WEBHOOK_SECRET");
  const provided =
    req.headers.get("x-kobo-secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!secret || provided !== secret) {
    await logEvent({ status: "failed", error: "unauthorized", payload: {} });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    await logEvent({ status: "failed", error: "invalid_json", payload: {} });
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const koboUuid =
    (payload["_uuid"] as string | undefined) ??
    (payload["formhub/uuid"] as string | undefined) ??
    (payload["meta/instanceID"] as string | undefined) ??
    null;
  const submittedAt = (payload["_submission_time"] as string | undefined) ?? null;
  const submittedBy = (payload["_submitted_by"] as string | undefined) ?? null;

  if (!koboUuid) {
    await logEvent({ status: "failed", error: "missing_uuid", payload });
    return new Response(JSON.stringify({ error: "Missing _uuid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const flhfName = pickFirst(payload, ["flhf_name"]);
  const flhfCustom = pickFirst(payload, ["flhf_custom", "flhf_other"]);
  const communityName = pickFirst(payload, ["community", "community_name"]);
  const communityCustom = pickFirst(payload, ["community_custom", "community_other"]);
  const settlementName = pickFirst(payload, ["settlement", "settlement_name"]);
  const settlementCustom = pickFirst(payload, ["settlement_custom", "settlement_other"]);

  const flhfFinal =
    flhfName && flhfName.toLowerCase() !== "other" ? flhfName : (flhfCustom ?? flhfName ?? null);
  const communityFinal =
    communityName && communityName.toLowerCase() !== "other"
      ? communityName
      : (communityCustom ?? communityName ?? null);
  const settlementFinal =
    settlementName && settlementName.toLowerCase() !== "other"
      ? settlementName
      : (settlementCustom ?? settlementName ?? null);

  const isCustom = Boolean(
    (flhfName?.toLowerCase() === "other" && flhfCustom) ||
      (communityName?.toLowerCase() === "other" && communityCustom) ||
      (settlementName?.toLowerCase() === "other" && settlementCustom),
  );

  const { lat, lng } = extractGeo(payload);
  const projectId = pickFirst(payload, ["project_id", "amehnities_project_id"]);

  const record: Record<string, unknown> = {
    idempotency_key: koboUuid,
    state: pickFirst(payload, ["state"]),
    lga: pickFirst(payload, ["lga"]),
    ward: pickFirst(payload, ["ward"]),
    flhf_name: flhfFinal,
    community_name: communityFinal,
    settlement_name: settlementFinal,
    community_latitude: lat,
    community_longitude: lng,
    settlement_latitude: pickNumber(payload, ["settlement_lat"]) ?? lat,
    settlement_longitude: pickNumber(payload, ["settlement_lng"]) ?? lng,
    is_custom_location: isCustom,
    project_id: projectId,
    notes: `Ingested from KoboToolbox (_uuid=${koboUuid}, submitted_by=${submittedBy ?? "unknown"})`,
  };

  // Remove null keys so we don't overwrite existing values on conflict
  for (const k of Object.keys(record)) if (record[k] == null) delete record[k];

  const { data, error } = await supabase
    .from("microplan_entries")
    .upsert(record, { onConflict: "idempotency_key", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();

  if (error) {
    await logEvent({
      status: "failed",
      error: error.message,
      kobo_uuid: koboUuid,
      submitted_by_kobo: submittedBy,
      submitted_at: submittedAt,
      payload,
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await logEvent({
    status: "success",
    kobo_uuid: koboUuid,
    submitted_by_kobo: submittedBy,
    submitted_at: submittedAt,
    matched_entry_id: data?.id ?? null,
    payload,
  });

  return new Response(
    JSON.stringify({ ok: true, entry_id: data?.id ?? null, idempotency_key: koboUuid }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
