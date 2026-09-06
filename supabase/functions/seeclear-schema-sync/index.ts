// See Clear (Plateau Comprehensive & Inclusive Eye Health) — Kobo schema sync.
//
// Pulls the live question schema (survey + choice lists) of the linked
// KoboToolbox form and stores it in public.seeclear_kobo_schema together with a
// "drift" report (added / removed / changed questions) so the checklist and the
// dashboard stay in lock-step with whatever is deployed in Kobo.
//
// Actions
//   sync   — fetch from Kobo and upsert the snapshot (admins, or internal calls
//            made with the service-role key by the kobo-webhook router)
//   status — return the stored snapshot
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const trimSlash = (u: string) => u.replace(/\/+$/, "");

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function koboGet(server: string, path: string, token: string) {
  let url: URL;
  try { url = new URL(`${trimSlash(server)}${path}`); } catch { throw new Error("Invalid server_url"); }
  if (url.protocol !== "https:" || isPrivateHost(url.hostname)) throw new Error("server_url not allowed");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Kobo ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally { clearTimeout(t); }
}

interface SchemaField {
  name: string;
  type: string;
  label: string;
  group: string | null;
  required: boolean;
  list_name: string | null;
  hint: string | null;
  relevant: string | null;
}

const labelOf = (row: Record<string, unknown>): string => {
  const l = row?.label;
  if (Array.isArray(l)) return String(l[0] ?? "");
  if (typeof l === "string") return l;
  return "";
};

const SKIP = new Set(["begin_group", "end_group", "begin_repeat", "end_repeat", "start", "end", "today", "deviceid", "username", "audit"]);

function parseAsset(asset: any): { fields: SchemaField[]; choices: Record<string, { value: string; label: string }[]> } {
  const survey: Record<string, unknown>[] = asset?.content?.survey ?? [];
  const rawChoices: Record<string, unknown>[] = asset?.content?.choices ?? [];

  const choices: Record<string, { value: string; label: string }[]> = {};
  for (const c of rawChoices) {
    const list = String(c?.list_name ?? "");
    if (!list) continue;
    (choices[list] ||= []).push({ value: String(c?.name ?? ""), label: labelOf(c) || String(c?.name ?? "") });
  }

  const fields: SchemaField[] = [];
  const stack: string[] = [];
  for (const row of survey) {
    const type = String(row?.type ?? "");
    const name = String(row?.name ?? row?.$autoname ?? "");
    if (type === "begin_group" || type === "begin_repeat") { stack.push(labelOf(row) || name); continue; }
    if (type === "end_group" || type === "end_repeat") { stack.pop(); continue; }
    if (!name || SKIP.has(type)) continue;
    fields.push({
      name,
      type,
      label: labelOf(row) || name,
      group: stack.length ? stack[stack.length - 1] : null,
      required: Boolean(row?.required),
      list_name: (row as any)?.select_from_list_name ? String((row as any).select_from_list_name) : null,
      hint: typeof row?.hint === "string" ? row.hint : Array.isArray(row?.hint) ? String((row.hint as unknown[])[0] ?? "") : null,
      relevant: typeof row?.relevant === "string" ? row.relevant : null,
    });
  }
  return { fields, choices };
}

function diff(prev: SchemaField[], next: SchemaField[]) {
  const pm = new Map(prev.map((f) => [f.name, f]));
  const nm = new Map(next.map((f) => [f.name, f]));
  const added = next.filter((f) => !pm.has(f.name)).map((f) => ({ name: f.name, label: f.label, type: f.type }));
  const removed = prev.filter((f) => !nm.has(f.name)).map((f) => ({ name: f.name, label: f.label, type: f.type }));
  const changed: { name: string; from: string; to: string }[] = [];
  for (const f of next) {
    const p = pm.get(f.name);
    if (!p) continue;
    if (p.type !== f.type) changed.push({ name: f.name, from: `type: ${p.type}`, to: `type: ${f.type}` });
    else if (p.label !== f.label) changed.push({ name: f.name, from: p.label, to: f.label });
  }
  return { added, removed, changed, at: new Date().toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body?.action ?? "status");
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internal = bearer === SERVICE_KEY;

    let callerId: string | null = null;
    let isAdmin = false;
    if (!internal) {
      const anon = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: u } = await anon.auth.getUser();
      if (!u?.user) return j({ error: "Unauthorized" }, 401);
      callerId = u.user.id;
      const { data: adminOk } = await admin.rpc("is_admin", { _user_id: callerId });
      const { data: ownerOk } = await admin.rpc("is_owner_level", { _user_id: callerId });
      isAdmin = Boolean(adminOk) || Boolean(ownerOk);
    }

    /* ------------------------------------------------------------ status --- */
    if (action === "status") {
      const { data } = await admin
        .from("seeclear_kobo_schema")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      return j({ ok: true, schema: data?.[0] ?? null });
    }

    /* ---------------------------------------------------------- discover --- */
    // Lists the deployed forms visible to the saved Kobo account so an admin can
    // pick the See Clear form without hunting for its UID.
    if (action === "discover") {
      if (!internal && !isAdmin) return j({ error: "Forbidden" }, 403);
      const { data: cfgs } = await admin
        .from("kobo_form_configs")
        .select("kobo_server_url, api_token")
        .order("updated_at", { ascending: false })
        .limit(1);
      const cfg = cfgs?.[0];
      const dToken = String(body?.api_token ?? "").trim() || String(cfg?.api_token ?? "");
      const dServer = String(body?.server_url ?? "").trim() ||
        String(cfg?.kobo_server_url ?? "https://kf.kobotoolbox.org");
      if (!dToken) return j({ error: "no_kobo_config", detail: "No KoboToolbox API token saved." }, 400);
      try {
        const list = await koboGet(dServer, `/api/v2/assets/?format=json&limit=500`, dToken);
        const assets = (list?.results ?? [])
          .filter((a: any) => a?.asset_type === "survey")
          .map((a: any) => ({
            uid: a.uid,
            name: a.name,
            submissions: Number(a?.deployment__submission_count ?? 0),
            deployed: Boolean(a?.has_deployment),
          }));
        return j({ ok: true, server_url: dServer, assets });
      } catch (e) {
        return j({ error: "kobo_fetch_failed", detail: (e as Error).message }, 502);
      }
    }

    /* -------------------------------------------------------- save_config --- */
    // Persists a chosen See Clear form into kobo_form_configs, reusing the saved
    // account token when no explicit token is supplied.
    if (action === "save_config") {
      if (!internal && !isAdmin) return j({ error: "Forbidden" }, 403);
      const uid = String(body?.form_uid ?? "").trim();
      if (!uid) return j({ error: "form_uid required" }, 400);
      const { data: cfgs } = await admin
        .from("kobo_form_configs")
        .select("kobo_server_url, api_token")
        .order("updated_at", { ascending: false })
        .limit(1);
      const tok = String(body?.api_token ?? "").trim() || String(cfgs?.[0]?.api_token ?? "");
      const srv = String(body?.server_url ?? "").trim() ||
        String(cfgs?.[0]?.kobo_server_url ?? "https://kf.kobotoolbox.org");
      if (!tok) return j({ error: "no_kobo_config", detail: "No KoboToolbox API token available." }, 400);
      const { error: cErr } = await admin.from("kobo_form_configs").upsert({
        form_uid: uid,
        kobo_server_url: srv,
        api_token: tok,
        form_title: String(body?.form_title ?? "See Clear Facility Monitoring Checklist"),
        updated_at: new Date().toISOString(),
      }, { onConflict: "form_uid" });
      if (cErr) return j({ error: cErr.message }, 500);
      return j({ ok: true, form_uid: uid });
    }

    /* -------------------------------------------------------------- sync --- */
    if (action !== "sync") return j({ error: `Unknown action: ${action}` }, 400);
    if (!internal && !isAdmin) return j({ error: "Forbidden" }, 403);

    // Resolve the Kobo credentials: explicit params → saved kobo_form_configs →
    // any saved Kobo account token (same workspace) → stored snapshot's form.
    let formUid = String(body?.form_uid ?? "").trim();
    let serverUrl = String(body?.server_url ?? "").trim();
    let token = String(body?.api_token ?? "").trim();

    if (!token) {
      let q = admin
        .from("kobo_form_configs")
        .select("form_uid, kobo_server_url, api_token, form_title")
        .order("updated_at", { ascending: false });
      if (formUid) q = q.eq("form_uid", formUid);
      const { data: cfgs } = await q.limit(1);
      let cfg = cfgs?.[0];
      if (!cfg) {
        // Fall back to any saved Kobo account token (same Kobo account hosts the
        // See Clear form even when it has no dedicated config row yet).
        const { data: anyCfg } = await admin
          .from("kobo_form_configs")
          .select("form_uid, kobo_server_url, api_token, form_title")
          .order("updated_at", { ascending: false })
          .limit(1);
        cfg = anyCfg?.[0];
        if (cfg) cfg = { ...cfg, form_uid: formUid || cfg.form_uid };
      }
      if (cfg) {
        formUid = formUid || String(cfg.form_uid);
        serverUrl = serverUrl || String(cfg.kobo_server_url ?? "https://kf.kobotoolbox.org");
        token = String(cfg.api_token);
      }
    }
    if (!formUid || !token) {
      return j({
        error: "no_kobo_config",
        detail: "No KoboToolbox credentials found. Save the See Clear form connection first (form UID + API token).",
      }, 400);
    }

    serverUrl = serverUrl || "https://kf.kobotoolbox.org";

    const { data: existingRows } = await admin
      .from("seeclear_kobo_schema").select("*").eq("form_uid", formUid).limit(1);
    const existing = existingRows?.[0] ?? null;

    let asset: any;
    try {
      asset = await koboGet(serverUrl, `/api/v2/assets/${encodeURIComponent(formUid)}/?format=json`, token);
    } catch (e) {
      const msg = (e as Error).message;
      if (existing) {
        await admin.from("seeclear_kobo_schema").update({ last_error: msg }).eq("form_uid", formUid);
      }
      return j({ error: "kobo_fetch_failed", detail: msg }, 502);
    }

    const { fields, choices } = parseAsset(asset);
    const drift = diff((existing?.fields as SchemaField[]) ?? [], fields);

    const row = {
      form_uid: formUid,
      server_url: serverUrl,
      form_title: asset?.name ?? asset?.settings?.title ?? null,
      version_id: asset?.version_id ? String(asset.version_id) : null,
      fields,
      choices,
      drift,
      submission_count: Number(asset?.deployment__submission_count ?? 0),
      last_synced_at: new Date().toISOString(),
      last_error: null,
      synced_by: callerId,
    };

    const { error: upErr } = await admin
      .from("seeclear_kobo_schema")
      .upsert(row, { onConflict: "form_uid" });
    if (upErr) return j({ error: upErr.message }, 500);

    const changes = drift.added.length + drift.removed.length + drift.changed.length;
    if (changes > 0) {
      await admin.from("kobo_sync_events").insert({
        status: "seeclear_schema_sync",
        kobo_uuid: row.version_id,
        message: `Schema updated: ${drift.added.length} added, ${drift.removed.length} removed, ${drift.changed.length} changed`,
      });
    }

    return j({ ok: true, schema: row, changes });
  } catch (e) {
    return j({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
