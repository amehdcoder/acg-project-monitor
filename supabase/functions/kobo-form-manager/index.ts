// Kobo Form Manager — admin-only edge function
// Actions:
//  - inspect: fetch fields from an existing Kobo form
//  - deploy: upload the microplanning XLSForm to an empty Kobo asset
//  - save_config: upsert a public.kobo_form_configs row
//  - list_configs: list configs the caller can see
//  - delete_config: remove a config
//
// Auth: caller must be Super Admin, Systems Admin, or Project owner (RLS enforced).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

async function koboFetch(server: string, path: string, token: string, init: RequestInit = {}) {
  const url = `${stripTrailingSlash(server)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`Kobo ${res.status}: ${typeof data === "string" ? data : (data?.detail ?? JSON.stringify(data))}`);
  }
  return data;
}

// Microplanning XLSForm template (same schema as client-side download)
function buildMicroplanXlsxBytes(): Uint8Array {
  const survey = [
    ["type", "name", "label", "required", "appearance", "choice_filter"],
    ["start", "start", "", "", "", ""],
    ["end", "end", "", "", "", ""],
    ["today", "today", "", "", "", ""],
    ["deviceid", "deviceid", "", "", "", ""],
    ["text", "project_id", "Amehnities Project ID", "yes", "", ""],
    ["text", "state", "State", "yes", "", ""],
    ["text", "lga", "LGA", "yes", "", ""],
    ["text", "ward", "Ward", "yes", "", ""],
    ["text", "flhf_name", "FLHF Name", "yes", "", ""],
    ["text", "flhf_incharge_name", "FLHF In-charge Name", "", "", ""],
    ["text", "flhf_incharge_phone", "FLHF In-charge Phone", "", "", ""],
    ["text", "community_name", "Community", "yes", "", ""],
    ["text", "community_leader_name", "Community Leader", "", "", ""],
    ["text", "community_leader_phone", "Community Leader Phone", "", "", ""],
    ["text", "settlement_name", "Settlement", "", "", ""],
    ["integer", "estimated_total_population", "Estimated Total Population", "", "", ""],
    ["integer", "number_of_households", "Number of Households", "", "", ""],
    ["geopoint", "community_gps", "Community GPS", "yes", "", ""],
  ];
  const choices = [["list_name", "name", "label"]];
  const settings = [
    ["form_title", "form_id", "version"],
    ["Amehnities Microplanning", "amehnities_microplanning", new Date().toISOString().slice(0, 10).replace(/-/g, "")],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(survey), "survey");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(choices), "choices");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settings), "settings");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}

function extractSurveyFields(asset: any): Array<{ name: string; type: string; label: string }> {
  const survey: any[] = asset?.content?.survey ?? [];
  const skip = new Set([
    "start","end","today","deviceid","username","phonenumber","simserial","subscriberid",
    "begin_group","end_group","begin_repeat","end_repeat","note","calculate",
  ]);
  return survey
    .filter((q) => q?.name && !skip.has(q.type))
    .map((q) => ({
      name: String(q.name),
      type: String(q.type ?? "text"),
      label: Array.isArray(q.label) ? String(q.label[0] ?? q.name) : String(q.label ?? q.name),
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return j({ error: "Missing Authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return j({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { action, ...params } = await req.json();

    if (action === "inspect") {
      const { server_url, form_uid, api_token } = params;
      if (!server_url || !form_uid || !api_token) return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      const asset = await koboFetch(server_url, `/api/v2/assets/${form_uid}/?format=json`, api_token);
      const fields = extractSurveyFields(asset);
      return j({
        ok: true,
        form_title: asset?.name ?? asset?.settings?.title ?? null,
        deployment_active: Boolean(asset?.has_deployment),
        submission_count: asset?.deployment__submission_count ?? 0,
        is_empty: fields.length === 0,
        fields,
      });
    }

    if (action === "deploy") {
      const { server_url, form_uid, api_token } = params;
      if (!server_url || !form_uid || !api_token) return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      const xlsx = buildMicroplanXlsxBytes();
      const b64 = btoa(String.fromCharCode(...xlsx));
      // Try imports API first (preferred for XLS deployment)
      const importRes = await koboFetch(server_url, `/api/v2/imports/`, api_token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: `${stripTrailingSlash(server_url)}/api/v2/assets/${form_uid}/`,
          base64Encoded: `base64:${b64}`,
          name: "amehnities_microplanning.xlsx",
          assetUid: form_uid,
        }),
      });
      // Try to deploy the asset so it can receive submissions
      try {
        await koboFetch(server_url, `/api/v2/assets/${form_uid}/deployment/`, api_token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
      } catch (_e) { /* may already be deployed */ }
      return j({ ok: true, import: importRes });
    }

    if (action === "save_config") {
      const { id, project_id, server_url, form_uid, form_title, api_token, field_mappings, form_status } = params;
      if (!form_uid || !api_token) return j({ error: "Missing form_uid/api_token" }, 400);
      const row: Record<string, unknown> = {
        project_id: project_id ?? null,
        kobo_server_url: server_url ?? "https://kf.kobotoolbox.org",
        form_uid,
        form_title: form_title ?? null,
        api_token,
        field_mappings: field_mappings ?? {},
        form_status: form_status ?? "existing",
        last_inspected_at: new Date().toISOString(),
        created_by: userRes.user.id,
      };
      if (id) {
        const { data, error } = await admin.from("kobo_form_configs").update(row).eq("id", id).select().maybeSingle();
        if (error) throw error;
        return j({ ok: true, config: data });
      }
      const { data, error } = await admin
        .from("kobo_form_configs")
        .upsert(row, { onConflict: "form_uid" })
        .select()
        .maybeSingle();
      if (error) throw error;
      return j({ ok: true, config: data });
    }

    if (action === "list_configs") {
      const { data, error } = await userClient
        .from("kobo_form_configs")
        .select("id, project_id, kobo_server_url, form_uid, form_title, field_mappings, form_status, last_inspected_at, last_deployed_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return j({ ok: true, configs: data ?? [] });
    }

    if (action === "delete_config") {
      const { id } = params;
      if (!id) return j({ error: "Missing id" }, 400);
      const { error } = await userClient.from("kobo_form_configs").delete().eq("id", id);
      if (error) throw error;
      return j({ ok: true });
    }

    return j({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("kobo-form-manager error:", (e as Error).message);
    return j({ error: (e as Error).message }, 500);
  }
});
