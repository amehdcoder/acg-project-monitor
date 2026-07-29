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

// --- SSRF protection ------------------------------------------------------
function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

async function assertSafeKoboUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new KoboApiError("bad_response", 0, "Invalid server_url"); }
  if (parsed.protocol !== "https:") {
    throw new KoboApiError("bad_response", 0, "server_url must use https");
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new KoboApiError("bad_response", 0, "server_url points to a disallowed internal/private address");
  }
  try {
    const a = await Deno.resolveDns(parsed.hostname, "A").catch(() => [] as string[]);
    const aaaa = await Deno.resolveDns(parsed.hostname, "AAAA").catch(() => [] as string[]);
    for (const ip of [...a, ...aaaa]) {
      if (isPrivateHostname(ip)) {
        throw new KoboApiError("bad_response", 0, "server_url resolves to a disallowed internal/private address");
      }
    }
  } catch (e) {
    if (e instanceof KoboApiError) throw e;
  }
  return parsed;
}


export type KoboErrCode =
  | "auth_failed" | "forbidden" | "not_found" | "rate_limited"
  | "timeout" | "network" | "server_error" | "bad_response";

class KoboApiError extends Error {
  code: KoboErrCode; status: number; detail: unknown;
  constructor(code: KoboErrCode, status: number, message: string, detail?: unknown) {
    super(message); this.name = "KoboApiError"; this.code = code; this.status = status; this.detail = detail;
  }
}

const codeForStatus = (s: number): KoboErrCode =>
  s === 401 ? "auth_failed" :
  s === 403 ? "forbidden" :
  s === 404 ? "not_found" :
  s === 429 ? "rate_limited" :
  s >= 500 ? "server_error" : "bad_response";

async function koboFetch(server: string, path: string, token: string, init: RequestInit = {}, timeoutMs = 20_000) {
  await assertSafeKoboUrl(server);
  const url = `${stripTrailingSlash(server)}${path}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Token ${token}`, Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch (e) {
    clearTimeout(t);
    const aborted = (e as Error)?.name === "AbortError";
    throw new KoboApiError(aborted ? "timeout" : "network", 0,
      aborted ? `Kobo request timed out after ${Math.round(timeoutMs/1000)}s` : `Network error contacting Kobo: ${(e as Error).message}`);
  } finally { clearTimeout(t); }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detailMsg = typeof data === "string" ? data : (data?.detail ?? JSON.stringify(data));
    throw new KoboApiError(codeForStatus(res.status), res.status, `Kobo ${res.status}: ${detailMsg}`, data);
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

    // Reusable auth + asset probe. Returns structured diagnostics without throwing.
    async function probe(server_url: string, form_uid: string, api_token: string) {
      const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];
      // Step 1 — auth (whoami)
      try {
        const me = await koboFetch(server_url, `/me/?format=json`, api_token);
        steps.push({ step: "auth", ok: true, detail: `Authenticated as ${me?.username ?? "?"}` });
      } catch (e) {
        steps.push({ step: "auth", ok: false, detail: (e as Error).message });
        return { ok: false, steps, asset: null, fields: [] as any[] };
      }
      // Step 2 — asset fetch
      let asset: any = null;
      try {
        asset = await koboFetch(server_url, `/api/v2/assets/${form_uid}/?format=json`, api_token);
        steps.push({ step: "asset", ok: true, detail: asset?.name ?? form_uid });
      } catch (e) {
        steps.push({ step: "asset", ok: false, detail: (e as Error).message });
        return { ok: false, steps, asset: null, fields: [] as any[] };
      }
      // Step 3 — deployment status (informational, non-blocking)
      steps.push({
        step: "deployment",
        ok: Boolean(asset?.has_deployment),
        detail: asset?.has_deployment
          ? `Active · ${asset?.deployment__submission_count ?? 0} submissions`
          : "Not deployed yet (Kobo will not accept submissions until deployed)",
      });
      const fields = extractSurveyFields(asset);
      steps.push({ step: "schema", ok: true, detail: `${fields.length} question(s) discovered` });
      return { ok: true, steps, asset, fields };
    }

    // Shared admin gate for secret ops
    async function ensureAdmin(): Promise<Response | null> {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", userRes.user.id);
      const allowed = (roles ?? []).some((r: any) =>
        ["super_admin", "systems_admin", "owner"].includes(String(r.role)),
      );
      if (!allowed) return j({ error: "Forbidden" }, 403);
      return null;
    }

    // Read the current active secret from DB; fallback to env for legacy setups.
    async function readActiveSecret(): Promise<string> {
      const { data } = await admin
        .from("kobo_webhook_secrets")
        .select("secret")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.secret as string | undefined) ?? Deno.env.get("KOBO_WEBHOOK_SECRET") ?? "";
    }

    if (action === "get_webhook_secret") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const secret = await readActiveSecret();
      if (!secret) return j({ error: "KOBO_WEBHOOK_SECRET is not configured" }, 404);
      return j({ ok: true, secret });
    }

    if (action === "reset_webhook_secret") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      // Generate a URL-safe 48-char secret
      const bytes = new Uint8Array(36);
      crypto.getRandomValues(bytes);
      const b64 = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const newSecret = `kws_${b64}`;
      // Deactivate previous active rows (old secrets stop working immediately)
      await admin
        .from("kobo_webhook_secrets")
        .update({ active: false, deactivated_at: new Date().toISOString() })
        .eq("active", true);
      const { error: insErr } = await admin.from("kobo_webhook_secrets").insert({
        secret: newSecret,
        active: true,
        rotated_by: userRes.user.id,
        rotated_by_email: userRes.user.email ?? null,
      });
      if (insErr) return j({ error: insErr.message }, 500);
      return j({ ok: true, secret: newSecret, rotated_at: new Date().toISOString() });
    }

    if (action === "test_connection" || action === "inspect") {
      const { server_url, form_uid, api_token } = params;
      if (!server_url || !form_uid || !api_token) return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      const res = await probe(server_url, form_uid, api_token);
      return j({
        ok: res.ok,
        steps: res.steps,
        form_title: res.asset?.name ?? res.asset?.settings?.title ?? null,
        deployment_active: Boolean(res.asset?.has_deployment),
        submission_count: res.asset?.deployment__submission_count ?? 0,
        is_empty: res.fields.length === 0,
        fields: res.fields,
      });
    }

    if (action === "deploy") {
      const { server_url, form_uid, api_token, force } = params;
      if (!server_url || !form_uid || !api_token) return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      // Safety gate: re-inspect BEFORE writing, refuse if the form already has questions unless force=true
      const res = await probe(server_url, form_uid, api_token);
      if (!res.ok) return j({ error: "Pre-deploy check failed", steps: res.steps }, 400);
      if (!force && res.fields.length > 0) {
        return j({
          error: "refused_form_not_empty",
          detail: `The Kobo form already has ${res.fields.length} question(s). Deploy would overwrite them.`,
          fields: res.fields,
          submission_count: res.asset?.deployment__submission_count ?? 0,
        }, 409);
      }
      if (!force && (res.asset?.deployment__submission_count ?? 0) > 0) {
        return j({
          error: "refused_has_submissions",
          detail: `The Kobo form already has ${res.asset?.deployment__submission_count} submissions. Refusing to overwrite.`,
        }, 409);
      }
      const xlsx = buildMicroplanXlsxBytes();
      const b64 = btoa(String.fromCharCode(...xlsx));
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
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { id, project_id, server_url, form_uid, form_title, api_token, field_mappings, form_status } = params;
      if (!form_uid || !api_token) return j({ error: "Missing form_uid/api_token" }, 400);
      if (server_url) {
        try { await assertSafeKoboUrl(server_url); }
        catch (e) { return j({ error: (e as Error).message }, 400); }
      }

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

    // ---------- Versioned mapping history ----------

    if (action === "save_mapping_version") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { config_id, field_mappings, change_summary } = params;

      if (!config_id || !field_mappings) return j({ error: "Missing config_id/field_mappings" }, 400);

      // Load current config for form_uid + project_id
      const { data: cfg, error: cfgErr } = await admin
        .from("kobo_form_configs")
        .select("id, form_uid, project_id")
        .eq("id", config_id)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!cfg) return j({ error: "Config not found" }, 404);

      // Compute next version number
      const { data: last } = await admin
        .from("kobo_mapping_history")
        .select("version_number")
        .eq("config_id", config_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((last?.version_number as number | undefined) ?? 0) + 1;

      const { data: hist, error: histErr } = await admin
        .from("kobo_mapping_history")
        .insert({
          config_id,
          project_id: cfg.project_id,
          form_uid: cfg.form_uid,
          version_number: nextVersion,
          field_mappings,
          change_summary: change_summary || "Manual mapping update",
          created_by: userRes.user.id,
        })
        .select()
        .maybeSingle();
      if (histErr) throw histErr;

      const { error: upErr } = await admin
        .from("kobo_form_configs")
        .update({ field_mappings, active_version_number: nextVersion })
        .eq("id", config_id);
      if (upErr) throw upErr;

      return j({ ok: true, version: hist });
    }

    if (action === "list_mapping_versions") {
      const { config_id } = params;
      if (!config_id) return j({ error: "Missing config_id" }, 400);
      const { data: rows, error } = await admin
        .from("kobo_mapping_history")
        .select("id, config_id, project_id, form_uid, version_number, field_mappings, change_summary, created_by, created_at")
        .eq("config_id", config_id)
        .order("version_number", { ascending: false });
      if (error) throw error;

      const ids = Array.from(new Set((rows ?? []).map((r) => r.created_by as string).filter(Boolean)));
      let profileMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null }> = {};
      if (ids.length > 0) {
        const { data: profs } = await admin
          .from("profiles")
          .select("user_id, first_name, last_name, email, avatar_url")
          .in("user_id", ids);
        for (const p of profs ?? []) {
          profileMap[p.user_id as string] = {
            first_name: (p.first_name as string | null) ?? null,
            last_name: (p.last_name as string | null) ?? null,
            email: (p.email as string | null) ?? null,
            avatar_url: (p.avatar_url as string | null) ?? null,
          };
        }
      }

      const { data: cfg } = await admin
        .from("kobo_form_configs")
        .select("active_version_number")
        .eq("id", config_id)
        .maybeSingle();

      return j({
        ok: true,
        active_version_number: (cfg?.active_version_number as number | undefined) ?? null,
        versions: (rows ?? []).map((r) => ({
          ...r,
          author: profileMap[r.created_by as string] ?? null,
        })),
      });
    }

    if (action === "rollback_mapping_version") {
      const { config_id, target_version_number } = params;
      if (!config_id || !target_version_number) {
        return j({ error: "Missing config_id/target_version_number" }, 400);
      }
      const { data: target, error: tgtErr } = await admin
        .from("kobo_mapping_history")
        .select("field_mappings, version_number")
        .eq("config_id", config_id)
        .eq("version_number", target_version_number)
        .maybeSingle();
      if (tgtErr) throw tgtErr;
      if (!target) return j({ error: "Target version not found" }, 404);

      const { data: cfg } = await admin
        .from("kobo_form_configs")
        .select("form_uid, project_id")
        .eq("id", config_id)
        .maybeSingle();
      if (!cfg) return j({ error: "Config not found" }, 404);

      const { data: last } = await admin
        .from("kobo_mapping_history")
        .select("version_number")
        .eq("config_id", config_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((last?.version_number as number | undefined) ?? 0) + 1;

      const { data: hist, error: histErr } = await admin
        .from("kobo_mapping_history")
        .insert({
          config_id,
          project_id: cfg.project_id,
          form_uid: cfg.form_uid,
          version_number: nextVersion,
          field_mappings: target.field_mappings,
          change_summary: `Rollback to v${target_version_number}`,
          created_by: userRes.user.id,
        })
        .select()
        .maybeSingle();
      if (histErr) throw histErr;

      const { error: upErr } = await admin
        .from("kobo_form_configs")
        .update({ field_mappings: target.field_mappings, active_version_number: nextVersion })
        .eq("id", config_id);
      if (upErr) throw upErr;

      return j({ ok: true, restored_from: target_version_number, new_version: hist });
    }

    // ---------- Versioned XLSForm history + Kobo upload ----------

    if (action === "list_xlsform_versions") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { data, error } = await admin
        .from("microplan_xlsform_versions")
        .select("id, version_number, changelog, notes, size_bytes, sha256, survey_row_count, choices_row_count, validation_report, kobo_asset_uid, kobo_version_id, kobo_server_url, kobo_deployed_at, is_active, created_by, created_by_email, created_at")
        .order("version_number", { ascending: false });
      if (error) throw error;
      return j({ ok: true, versions: data ?? [] });
    }

    if (action === "get_xlsform_version") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { id } = params;
      if (!id) return j({ error: "Missing id" }, 400);
      const { data, error } = await admin
        .from("microplan_xlsform_versions")
        .select("id, version_number, xlsx_base64, size_bytes, sha256")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return j({ error: "Not found" }, 404);
      return j({ ok: true, version: data });
    }

    if (action === "save_xlsform_version") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { xlsx_base64, changelog, notes, validation_report, sha256, size_bytes, survey_row_count, choices_row_count, set_active } = params;
      if (!xlsx_base64 || typeof xlsx_base64 !== "string") return j({ error: "Missing xlsx_base64" }, 400);
      if (xlsx_base64.length > 40 * 1024 * 1024) return j({ error: "XLSForm exceeds 40 MB base64 limit" }, 413);

      const { data: last } = await admin
        .from("microplan_xlsform_versions")
        .select("version_number")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((last?.version_number as number | undefined) ?? 0) + 1;

      if (set_active) {
        await admin.from("microplan_xlsform_versions").update({ is_active: false }).eq("is_active", true);
      }

      const { data, error } = await admin.from("microplan_xlsform_versions").insert({
        version_number: nextVersion,
        changelog: changelog || "New XLSForm export",
        notes: notes || null,
        xlsx_base64,
        size_bytes: size_bytes ?? Math.floor((xlsx_base64.length * 3) / 4),
        sha256: sha256 ?? null,
        survey_row_count: survey_row_count ?? 0,
        choices_row_count: choices_row_count ?? 0,
        validation_report: validation_report ?? {},
        is_active: Boolean(set_active),
        created_by: userRes.user.id,
        created_by_email: userRes.user.email ?? null,
      }).select("id, version_number, is_active, created_at").maybeSingle();
      if (error) throw error;
      return j({ ok: true, version: data });
    }

    if (action === "rollback_xlsform_version") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { id } = params;
      if (!id) return j({ error: "Missing id" }, 400);
      await admin.from("microplan_xlsform_versions").update({ is_active: false }).eq("is_active", true);
      const { data, error } = await admin
        .from("microplan_xlsform_versions")
        .update({ is_active: true })
        .eq("id", id)
        .select("id, version_number")
        .maybeSingle();
      if (error) throw error;
      if (!data) return j({ error: "Version not found" }, 404);
      return j({ ok: true, active_version: data });
    }

    if (action === "upload_xlsform_to_kobo") {
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { server_url, api_token, xlsx_base64, form_uid, asset_name, version_id } = params;

      const { performKoboXlsformUpload, makeKoboFetcher } = await import("./upload.ts");
      const result = await performKoboXlsformUpload(
        { server_url, api_token, xlsx_base64, form_uid, asset_name, version_id },
        {
          fetcher: makeKoboFetcher(),
          persistVersion: async (patch) => {
            await admin.from("microplan_xlsform_versions").update({
              kobo_asset_uid: patch.kobo_asset_uid,
              kobo_version_id: patch.kobo_version_id,
              kobo_server_url: patch.kobo_server_url,
              kobo_deployed_at: patch.kobo_deployed_at,
              kobo_upload_response: patch.kobo_upload_response,
            }).eq("id", patch.version_id);
          },
        },
      );
      if (!result.ok && "error" in result) {
        return j({ error: result.error, detail: result.detail, code: result.code }, result.status ?? 502);
      }
      return j(result);
    }


    if (action === "fetch_submissions") {
      const { server_url, form_uid, api_token, page_size, page } = params;
      if (!server_url || !form_uid || !api_token) return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      const limit = Math.min(Math.max(Number(page_size) || 100, 1), 500);
      const start = Math.max(Number(page) || 0, 0) * limit;
      try {
        const data = await koboFetch(
          server_url,
          `/api/v2/assets/${form_uid}/data/?format=json&limit=${limit}&start=${start}`,
          api_token,
        );
        let asset: any = null;
        try { asset = await koboFetch(server_url, `/api/v2/assets/${form_uid}/?format=json`, api_token); } catch {}
        return j({
          ok: true,
          count: data?.count ?? (Array.isArray(data?.results) ? data.results.length : 0),
          results: Array.isArray(data?.results) ? data.results : [],
          form_title: asset?.name ?? null,
          fields: asset ? extractSurveyFields(asset) : [],
          survey: Array.isArray(asset?.content?.survey) ? asset.content.survey : [],
          choices: Array.isArray(asset?.content?.choices) ? asset.content.choices : [],
          fetched_at: new Date().toISOString(),
        });
      } catch (e) {
        if (e instanceof KoboApiError) {
          return j({ error: "Kobo fetch failed", code: e.code, status: e.status, detail: e.message }, e.code === "auth_failed" ? 401 : e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : e.code === "rate_limited" ? 429 : e.code === "timeout" ? 504 : 502);
        }
        return j({ error: "Kobo fetch failed", code: "server_error", detail: (e as Error).message }, 502);
      }
    }

    if (action === "retry_submission") {
      try {
        const { kobo_uuid } = params;
        if (!kobo_uuid) return j({ success: false, error: "Missing kobo_uuid" }, 200);

        const { data: evt, error: evtErr } = await admin
          .from("kobo_webhook_events")
          .select("payload")
          .eq("kobo_uuid", kobo_uuid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (evtErr) return j({ success: false, error: evtErr.message, code: "lookup_failed" }, 200);
        if (!evt?.payload) return j({ success: false, error: "No stored payload found for that submission", code: "not_found" }, 200);

        const { data: secretRow } = await admin
          .from("kobo_webhook_secrets").select("secret").eq("active", true).limit(1).maybeSingle();
        const secret = (secretRow?.secret as string | undefined) ?? Deno.env.get("KOBO_WEBHOOK_SECRET");
        if (!secret) return j({ success: false, error: "No active webhook secret configured", code: "no_secret" }, 200);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/kobo-microplan-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-kobo-secret": secret },
          body: JSON.stringify(evt.payload),
        });
        const text = await res.text();
        let parsed: any = text; try { parsed = JSON.parse(text); } catch {}

        if (res.ok) {
          try {
            await admin.from("kobo_sync_events").insert({
              kobo_uuid,
              entry_id: parsed?.entry_id ?? null,
              status: "success",
              message: "Synced successfully via manual re-sync",
            });
          } catch (_) { /* non-fatal */ }
          return j({ success: true, ok: true, status: res.status, result: parsed }, 200);
        }
        return j({
          success: false,
          ok: false,
          status: res.status,
          error: parsed?.error ?? parsed?.hint ?? `Re-sync failed (HTTP ${res.status})`,
          result: parsed,
        }, 200);
      } catch (err) {
        return j({ success: false, error: (err as Error).message }, 200);
      }
    }

    if (action === "backfill_submissions") {
      // Reprocess historical Kobo payloads through the current webhook mapper.
      // Modes:
      //   source = "events" (default) — replay every stored payload from
      //     public.kobo_webhook_events for the given form/project.
      //   source = "kobo"  — pull fresh submissions from KoboToolbox
      //     (requires server_url/form_uid/api_token) and replay them.
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const {
        source = "events",
        project_id,
        form_uid,
        config_id,
        limit = 200,
        since,
      } = params;
      let { server_url, api_token } = params;

      const secret = await readActiveSecret();
      if (!secret) return j({ error: "No active webhook secret configured" }, 400);

      const capped = Math.min(Math.max(Number(limit) || 200, 1), 1000);
      let payloads: Array<Record<string, unknown>> = [];
      let resolvedProjectId = typeof project_id === "string" && project_id ? project_id : null;
      let resolvedFormUid = typeof form_uid === "string" && form_uid ? form_uid : null;

      const replay = async (payload: Record<string, unknown>) => {
        const qs = resolvedProjectId ? `?project_id=${encodeURIComponent(resolvedProjectId)}` : "";
        const r = await fetch(`${SUPABASE_URL}/functions/v1/kobo-microplan-webhook${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-kobo-secret": secret },
          body: JSON.stringify(payload),
        });
        const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch {}
        return { ok: r.ok, status: r.status, body: b };
      };

      if (source === "kobo" || config_id || (!server_url && (resolvedProjectId || resolvedFormUid))) {
        let cfgQuery = admin
          .from("kobo_form_configs")
          .select("id, project_id, kobo_server_url, form_uid, api_token")
          .order("updated_at", { ascending: false })
          .limit(1);
        if (config_id) cfgQuery = cfgQuery.eq("id", config_id);
        else if (resolvedFormUid) cfgQuery = cfgQuery.eq("form_uid", resolvedFormUid);
        else if (resolvedProjectId) cfgQuery = cfgQuery.eq("project_id", resolvedProjectId);

        const { data: cfgs, error: cfgErr } = await cfgQuery;
        if (cfgErr) return j({ error: cfgErr.message }, 500);
        const cfg = (cfgs ?? [])[0] as any;
        if (cfg) {
          resolvedProjectId = resolvedProjectId ?? (cfg.project_id as string | null) ?? null;
          resolvedFormUid = resolvedFormUid ?? (cfg.form_uid as string | null) ?? null;
          server_url = server_url ?? cfg.kobo_server_url;
          api_token = api_token ?? cfg.api_token;
        }
      }

      if (source === "kobo") {
        if (!server_url || !resolvedFormUid || !api_token) {
          return j({ error: "Kobo configuration not found. Save Sync Settings first, or provide server_url/form_uid/api_token." }, 400);
        }
        try {
          const data = await koboFetch(
            server_url,
            `/api/v2/assets/${resolvedFormUid}/data/?format=json&limit=${capped}&sort=%7B%22_submission_time%22%3A1%7D`,
            api_token,
          );
          payloads = Array.isArray(data?.results) ? data.results : [];
        } catch (e) {
          return j({ error: "Kobo fetch failed", detail: (e as Error).message }, 502);
        }
      } else {
        let q = admin.from("kobo_webhook_events").select("payload, created_at").order("created_at", { ascending: true }).limit(capped);
        if (since) q = q.gte("created_at", since);
        const { data, error } = await q;
        if (error) return j({ error: error.message }, 500);
        payloads = (data ?? [])
          .map((r: any) => r.payload)
          .filter((p: any) => p && typeof p === "object");
        if (resolvedFormUid) {
          payloads = payloads.filter((p) => (p as any)?._xform_id_string === resolvedFormUid);
        }
      }

      let ok = 0, failed = 0;
      const errors: Array<{ uuid: string | null; status: number; error: unknown }> = [];
      for (const p of payloads) {
        if (resolvedProjectId && !(p as any).project_id && !(p as any).amehnities_project_id) {
          (p as any).amehnities_project_id = resolvedProjectId;
        }
        const r = await replay(p);
        if (r.ok) ok++;
        else { failed++; errors.push({ uuid: (p as any)?._uuid ?? null, status: r.status, error: r.body?.error ?? r.body }); }
      }
      return j({ ok: true, processed: payloads.length, succeeded: ok, failed, errors: errors.slice(0, 25) });
    }

    if (action === "register_webhook") {
      // Auto-register the Amehnities webhook as a Kobo REST Service so new
      // submissions stream in without manual REST Service setup.
      const forbid = await ensureAdmin();
      if (forbid) return forbid;
      const { server_url, form_uid, api_token, project_id } = params;
      if (!server_url || !form_uid || !api_token) {
        return j({ error: "Missing server_url/form_uid/api_token" }, 400);
      }
      const secret = await readActiveSecret();
      if (!secret) return j({ error: "No active webhook secret configured" }, 400);
      const endpoint = `${SUPABASE_URL}/functions/v1/kobo-microplan-webhook${project_id ? `?project_id=${encodeURIComponent(project_id)}` : ""}`;
      const body = {
        name: "Amehnities Microplanning Sync",
        endpoint,
        active: true,
        subset_fields: [],
        email_notification: false,
        export_type: "json",
        settings: { custom_headers: { "x-kobo-secret": secret } },
      };
      try {
        // List existing hooks so we update instead of duplicate.
        const existing = await koboFetch(server_url, `/api/v2/assets/${form_uid}/hooks/?format=json`, api_token);
        const match = (existing?.results ?? []).find((h: any) => (h?.endpoint ?? "").includes("kobo-microplan-webhook"));
        let hook: any;
        if (match?.uid) {
          hook = await koboFetch(server_url, `/api/v2/assets/${form_uid}/hooks/${match.uid}/`, api_token, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
        } else {
          hook = await koboFetch(server_url, `/api/v2/assets/${form_uid}/hooks/`, api_token, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
        }
        return j({ ok: true, hook: { uid: hook?.uid, endpoint: hook?.endpoint, active: hook?.active } });
      } catch (e) {
        return j({ error: "Failed to register Kobo REST Service", detail: (e as Error).message }, 502);
      }
    }

    return j({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    console.error("kobo-form-manager error:", (e as Error).message);
    if (e instanceof KoboApiError) {
      return j({ error: e.message, code: e.code, status: e.status }, e.code === "auth_failed" ? 401 : e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : e.code === "rate_limited" ? 429 : e.code === "timeout" ? 504 : 500);
    }
    return j({ error: (e as Error).message, code: "server_error" }, 500);
  }
});

