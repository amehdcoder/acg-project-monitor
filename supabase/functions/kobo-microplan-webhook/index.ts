// Public Kobo webhook — ingests microplanning submissions into
// public.microplan_entries with idempotency (per _uuid).
//
// Auth (any one accepted, matching Kobo's REST Services options):
//   • Custom header:  x-kobo-secret: <KOBO_WEBHOOK_SECRET>
//   • Bearer token:   Authorization: Bearer <KOBO_WEBHOOK_SECRET>
//   • Basic Auth:     Authorization: Basic base64(user:<KOBO_WEBHOOK_SECRET>)
//                     (username is ignored; password must equal the secret)
//
// Field mapping: if a public.kobo_form_configs row exists for the incoming
// form UID, its `field_mappings` object is used to translate Kobo question
// names into microplan_entries column values. Otherwise a default best-effort
// mapping is applied (backwards-compatible with the shipped XLSForm template).

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

function decodeBasic(header: string): string | null {
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = atob(m[1].trim());
    const idx = decoded.indexOf(":");
    return idx >= 0 ? decoded.slice(idx + 1) : decoded;
  } catch {
    return null;
  }
}

function checkAuth(req: Request, secrets: string[]): boolean {
  const valid = new Set(secrets.filter(Boolean));
  if (valid.size === 0) return false;
  const custom = req.headers.get("x-kobo-secret");
  if (custom && valid.has(custom)) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) return false;
  if (/^Bearer\s+/i.test(auth)) {
    return valid.has(auth.replace(/^Bearer\s+/i, "").trim());
  }
  if (/^Basic\s+/i.test(auth)) {
    const pwd = decodeBasic(auth);
    return pwd != null && valid.has(pwd);
  }
  return valid.has(auth);
}

function getFlat(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  const lowered = key.toLowerCase();
  // Support Kobo grouped notation "group/name" and any nesting depth,
  // as well as camelCase/underscore/case-insensitive matches.
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (kl === lowered || kl.endsWith(`/${lowered}`)) return v;
  }
  // Recurse into nested objects (rare — Kobo usually flattens).
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = getFlat(v as Record<string, unknown>, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = getFlat(obj, k);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  const v = pickFirst(obj, keys);
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function slugPart(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/^[a-z]+__/, "");
  const parts = cleaned.split(/__|_/).filter(Boolean);
  return parts.at(-1) ?? null;
}

function titleCase(value: string): string {
  return value
    .replace(/__+/g, "_")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function stripKnownPrefix(value: string, contexts: Array<string | null>): string {
  let out = value.trim().toLowerCase().replace(/^[a-z]+__/, "");
  const contextParts = contexts.map(slugPart).filter(Boolean) as string[];
  if (contextParts.length > 0) {
    const prefix = `${contextParts.join("_")}_`;
    if (out.startsWith(prefix)) out = out.slice(prefix.length);
  }
  return out.replace(/^(c|s)__?/i, "");
}

function normalizeChoiceValue(
  main: string | null,
  custom: string | null,
  contexts: Array<string | null> = [],
): string | null {
  const raw = main?.trim() ?? "";
  const customRaw = custom?.trim() ?? "";
  const lower = raw.toLowerCase();
  if (lower === "other" || lower === "__other__") {
    return customRaw ? titleCase(customRaw) : null;
  }
  if (!raw) return customRaw ? titleCase(customRaw) : null;
  return titleCase(stripKnownPrefix(raw, contexts));
}

function extractGeo(payload: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const geo = payload["_geolocation"];
  if (Array.isArray(geo) && geo.length >= 2) {
    const [lat, lng] = geo;
    if (typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }
  const gpsStr = pickFirst(payload, [
    "community_gps", "settlement_gps", "flhf_gps", "gps", "_geopoint", "geopoint", "location",
  ]);
  if (gpsStr) {
    const parts = gpsStr.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (parts.length >= 2) return { lat: parts[0], lng: parts[1] };
  }
  const lat = pickNumber(payload, ["gps_latitude", "latitude", "lat", "community_latitude"]);
  const lng = pickNumber(payload, ["gps_longitude", "longitude", "lng", "lon", "community_longitude"]);
  if (lat != null && lng != null) return { lat, lng };
  return { lat: null, lng: null };
}


// Numeric columns that should coerce string values
const NUMERIC_COLS = new Set([
  "estimated_total_population","estimated_children_5_14","estimated_adults_15_plus",
  "estimated_children_0_4","number_of_households","community_distance_to_flhf_km",
  "settlement_distance_to_flhf_km","community_latitude","community_longitude",
  "settlement_latitude","settlement_longitude","flhf_latitude","flhf_longitude",
  "year_of_microplanning","total_treated","medicine_used","households_treated",
  "total_households_reported","total_households_treated",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const logEvent = async (row: Record<string, unknown>) => {
    // Legacy detailed log (payload + mapping version). Keep this shape aligned
    // with the table so event logging never fails before backfill can replay it.
    const { project_id: _projectId, ...legacyRow } = row;
    try { await supabase.from("kobo_webhook_events").insert(legacyRow); }
    catch (e) { console.error("kobo_webhook_events insert failed:", (e as Error).message); }
    // Compact real-time sync event stream consumed by the Microplanning UI.
    try {
      await supabase.from("kobo_sync_events").insert({
        project_id: (row as { project_id?: string | null }).project_id ?? null,
        kobo_uuid: (row as { kobo_uuid?: string | null }).kobo_uuid ?? null,
        entry_id: (row as { matched_entry_id?: string | null }).matched_entry_id ?? null,
        status: (row as { status?: string }).status ?? "unknown",
        message: (row as { error?: string | null }).error ?? null,
      });
    } catch (e) { console.error("kobo_sync_events insert failed:", (e as Error).message); }
  };

  // Accept any currently-active DB secret; fall back to env for legacy setups.
  const secrets: string[] = [];
  try {
    const { data } = await supabase
      .from("kobo_webhook_secrets").select("secret").eq("active", true);
    (data ?? []).forEach((r: any) => { if (r?.secret) secrets.push(String(r.secret)); });
  } catch (_) { /* ignore, fall back to env */ }
  const envSecret = Deno.env.get("KOBO_WEBHOOK_SECRET");
  if (envSecret) secrets.push(envSecret);
  if (secrets.length === 0 || !checkAuth(req, secrets)) {
    await logEvent({ status: "failed", error: "unauthorized", payload: {} });
    const hint = secrets.length === 0
      ? "No active webhook secret is configured. Open Kobo Sync → Reset Webhook Secret and paste the new value into KoboToolbox REST Services."
      : "The Authorization header did not match any active webhook secret. In KoboToolbox → REST Services, ensure the Custom HTTP header 'x-kobo-secret' (or Basic Auth password) matches the value shown in Kobo Sync → Copy Secret. If it was rotated, re-paste the new value.";
    return new Response(JSON.stringify({ error: "Unauthorized", code: "webhook_auth_failed", hint }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch {
    await logEvent({ status: "failed", error: "invalid_json", payload: {} });
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Collect every possible identifier so we can bind the row to the right
  // Amehnities project regardless of how the KoboToolbox REST Service was
  // registered (URL query param, id_string, formhub uuid, or asset uid).
  const url = new URL(req.url);
  const qpFormUid = url.searchParams.get("form_uid");
  const qpProjectId = url.searchParams.get("project_id");
  const candidateUids = Array.from(new Set([
    qpFormUid ?? "",
    (payload["_xform_id_string"] as string | undefined) ?? "",
    (payload["formhub/uuid"] as string | undefined) ?? "",
    (payload["__version__"] as string | undefined) ?? "",
  ].filter(Boolean)));

  let mapping: Record<string, string> = {};
  let cfgProjectId: string | null = null;
  let mappingVersion: number | null = null;
  let formUid: string | null = qpFormUid ?? (payload["_xform_id_string"] as string | undefined) ?? null;

  if (candidateUids.length > 0) {
    const { data: cfgs } = await supabase
      .from("kobo_form_configs")
      .select("field_mappings, project_id, active_version_number, form_uid")
      .in("form_uid", candidateUids)
      .limit(1);
    const cfg = (cfgs ?? [])[0];
    if (cfg?.field_mappings && typeof cfg.field_mappings === "object") {
      mapping = cfg.field_mappings as Record<string, string>;
    }
    cfgProjectId = (cfg?.project_id as string | null) ?? null;
    mappingVersion = (cfg?.active_version_number as number | null) ?? null;
    formUid = (cfg?.form_uid as string | null) ?? formUid;
  }


  const mapped = (col: string, defaults: string[]): string | null => {
    const src = mapping[col];
    if (src) {
      const v = getFlat(payload, src);
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return pickFirst(payload, defaults);
  };

  const mappedNum = (col: string, defaults: string[]): number | null => {
    const v = mapped(col, defaults);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const stateRaw = mapped("state", ["state", "admin_hierarchy/state", "state_name", "location/state"]);
  const stateCustom = mapped("state_custom", ["state_custom", "state_other", "admin_hierarchy/state_manual"]);
  const lgaRaw = mapped("lga", ["lga", "lga_name", "admin_hierarchy/lga", "location/lga"]);
  const lgaCustom = mapped("lga_custom", ["lga_custom", "lga_other", "admin_hierarchy/lga_manual"]);
  const wardRaw = mapped("ward", ["ward", "ward_name", "admin_hierarchy/ward", "location/ward"]);
  const wardCustom = mapped("ward_custom", ["ward_custom", "ward_other", "admin_hierarchy/ward_manual"]);
  const flhfName = mapped("flhf_name", ["flhf_name", "flhf_grp/flhf", "flhf_grp/flhf_name"]);
  const flhfCustom = mapped("flhf_custom", ["flhf_custom", "flhf_other", "flhf_manual", "flhf_grp/flhf_manual"]);
  const communityName = mapped("community_name", ["community", "community_name", "community_grp/community", "community_grp/community_name"]);
  const communityCustom = mapped("community_custom", ["community_custom", "community_other", "community_manual", "community_grp/community_manual"]);
  const settlementName = mapped("settlement_name", ["settlement", "settlement_name", "settlement_grp/settlement", "settlement_grp/settlement_name"]);
  const settlementCustom = mapped("settlement_custom", ["settlement_custom", "settlement_other", "settlement_manual", "settlement_grp/settlement_manual"]);

  const stateFinal = normalizeChoiceValue(stateRaw, stateCustom);
  const lgaFinal = normalizeChoiceValue(lgaRaw, lgaCustom, [stateRaw]);
  const wardFinal = normalizeChoiceValue(wardRaw, wardCustom, [stateRaw, lgaRaw]);
  const flhfFinal = normalizeChoiceValue(flhfName, flhfCustom, [stateRaw, lgaRaw, wardRaw]);
  const communityFinal = normalizeChoiceValue(communityName, communityCustom, [stateRaw, lgaRaw, wardRaw]);
  const settlementFinal = normalizeChoiceValue(settlementName, settlementCustom, [stateRaw, lgaRaw, wardRaw, communityName]);

  const isCustom = Boolean(
    (["other", "__other__"].includes(flhfName?.toLowerCase() ?? "") && flhfCustom) ||
    (["other", "__other__"].includes(communityName?.toLowerCase() ?? "") && communityCustom) ||
    (["other", "__other__"].includes(settlementName?.toLowerCase() ?? "") && settlementCustom),
  );

  const { lat, lng } = extractGeo(payload);
  const projectIdResolved =
    mapped("project_id", ["project_id", "amehnities_project_id"]) ??
    cfgProjectId ??
    qpProjectId;

  const record: Record<string, unknown> = {
    idempotency_key: koboUuid,
    project_id: projectIdResolved,
    state: stateFinal,
    lga: lgaFinal,
    ward: wardFinal,
    flhf_name: flhfFinal,
    flhf_incharge_name: mapped("flhf_incharge_name", ["flhf_incharge_name", "flhf_incharge"]),
    flhf_incharge_phone: mapped("flhf_incharge_phone", ["flhf_incharge_phone", "flhf_phone"]),
    community_name: communityFinal,
    community_leader_name: mapped("community_leader_name", ["community_leader_name", "community_leader"]),
    community_leader_phone: mapped("community_leader_phone", ["community_leader_phone", "community_phone"]),
    settlement_name: settlementFinal,
    estimated_total_population: mappedNum("estimated_total_population", [
      "estimated_total_population", "estimated_total_pop", "population",
      "total_population", "total_pop", "demographics/total_pop", "demographics/total_population",
    ]),
    estimated_children_0_4: mappedNum("estimated_children_0_4", [
      "children_0_4", "estimated_children_0_4", "under5", "demographics/children_0_4",
    ]),
    estimated_children_5_14: mappedNum("estimated_children_5_14", [
      "children_5_14", "estimated_children_5_14", "demographics/children_5_14",
    ]),
    estimated_adults_15_plus: mappedNum("estimated_adults_15_plus", [
      "adults_15_plus", "estimated_adults_15_plus", "adults", "demographics/adults_15_plus",
    ]),
    number_of_households: mappedNum("number_of_households", [
      "number_of_households", "households", "total_households", "hh_count",
      "demographics/households", "demographics/number_of_households",
    ]),
    community_latitude: lat,
    community_longitude: lng,
    settlement_latitude: mappedNum("settlement_latitude", ["settlement_lat", "settlement_latitude"]) ?? lat,
    settlement_longitude: mappedNum("settlement_longitude", ["settlement_lng", "settlement_longitude"]) ?? lng,
    flhf_latitude: mappedNum("flhf_latitude", ["flhf_lat", "flhf_latitude"]),
    flhf_longitude: mappedNum("flhf_longitude", ["flhf_lng", "flhf_longitude"]),
    is_custom_location: isCustom,
    notes: `Ingested from KoboToolbox (_uuid=${koboUuid}, form=${formUid ?? "unknown"}, submitted_by=${submittedBy ?? "unknown"})`,
  };

  for (const k of Object.keys(record)) {
    if (record[k] == null) delete record[k];
    else if (NUMERIC_COLS.has(k)) {
      const n = Number(record[k]);
      if (!Number.isFinite(n)) delete record[k];
      else record[k] = n;
    }
  }


  let data: { id: string } | null = null;
  let upsertError: { message: string; code?: string } | null = null;
  try {
    const res = await supabase
      .from("microplan_entries")
      .upsert(record, { onConflict: "idempotency_key,project_id", ignoreDuplicates: false })
      .select("id")
      .maybeSingle();
    data = res.data as { id: string } | null;
    upsertError = res.error ? { message: res.error.message, code: (res.error as any).code } : null;
  } catch (e) {
    upsertError = { message: (e as Error).message };
  }

  if (upsertError) {
    const schemaMismatch = /on conflict|constraint|column .* does not exist/i.test(upsertError.message);
    const hint = schemaMismatch
      ? "Database schema mismatch on microplan_entries — ensure the unique index (idempotency_key, project_id) exists and the target columns are present."
      : "Upsert failed. Check the payload against the microplan_entries schema and retry from the Kobo Sync audit log.";
    await logEvent({
      status: "failed", error: `${upsertError.message} :: ${hint}`, kobo_uuid: koboUuid,
      submitted_by_kobo: submittedBy, submitted_at: submittedAt, payload,
      mapping_version_number: mappingVersion,
      project_id: (record.project_id as string | null | undefined) ?? null,
    });
    return new Response(
      JSON.stringify({ error: upsertError.message, code: "upsert_failed", hint }),
      { status: schemaMismatch ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await logEvent({
    status: "success", kobo_uuid: koboUuid,
    submitted_by_kobo: submittedBy, submitted_at: submittedAt,
    matched_entry_id: data?.id ?? null, payload,
    mapping_version_number: mappingVersion,
    project_id: (record.project_id as string | null | undefined) ?? null,
  });


  return new Response(
    JSON.stringify({ ok: true, entry_id: data?.id ?? null, idempotency_key: koboUuid }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
