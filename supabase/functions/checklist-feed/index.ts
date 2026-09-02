// Checklist Dashboard shared feed.
//
// Lets any user who has been granted the `integrated-supervisory` page open the
// Checklist Dashboard with live KoboToolbox data, scoped server-side to the
// State(s) their grant allows. Administrators publish the Kobo connection once
// (`publish`); the API token itself never leaves this function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isGrantActive, norm, readState, scopeRows } from "./scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Caller {
  userId: string;
  isAdmin: boolean;
  granted: boolean;
  scopeStates: string[];
}

async function resolveCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: claims, error } = await authed.auth.getClaims(token);
  const userId = claims?.claims?.sub as string | undefined;
  if (error || !userId) return null;

  const [{ data: profile }, { data: roles }, { data: grant }] = await Promise.all([
    admin.from("profiles").select("is_owner, is_co_owner").eq("user_id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin
      .from("user_page_access")
      .select("scope_states, starts_at, expires_at")
      .eq("user_id", userId)
      .eq("page_id", "integrated-supervisory")
      .maybeSingle(),
  ]);

  const isAdmin = !!profile?.is_owner || !!profile?.is_co_owner ||
    (roles ?? []).some((r: { role: string }) => r.role === "super_admin" || r.role === "systems_admin");

  const active = isGrantActive(grant);

  return {
    userId,
    isAdmin,
    granted: active,
    scopeStates: active ? ((grant?.scope_states as string[] | null) ?? []) : [],
  };
}



/** Append an immutable audit line. Never throws — auditing must not break the action. */
async function audit(row: Record<string, unknown>) {
  try {
    await admin.from("checklist_feed_audit").insert(row);
  } catch (e) {
    console.warn("checklist_feed_audit insert failed", e);
  }
}

async function actorEmail(userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("email").eq("user_id", userId).maybeSingle();
  return (data?.email as string | null) ?? null;
}




async function koboFetch(
  serverUrl: string,
  path: string,
  apiToken: string,
  init?: { method?: string; body?: unknown },
) {
  const base = serverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Token ${apiToken}`,
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`KoboToolbox ${res.status}: ${detail.slice(0, 400)}`);
  }
  return await res.json();
}

/* The form definition changes rarely but costs a full Kobo round-trip, so it is
   memoised per warm isolate. This is the single biggest cost on a delta sync. */
interface AssetSchema { survey: unknown[]; choices: unknown[]; title: string | null }
const assetCache = new Map<string, { at: number; asset: AssetSchema }>();
const ASSET_TTL_MS = 10 * 60_000;

async function loadAsset(feed: { form_uid: string; server_url: string; api_token: string; name?: string }): Promise<AssetSchema> {
  const hit = assetCache.get(feed.form_uid);
  if (hit && Date.now() - hit.at < ASSET_TTL_MS) return hit.asset;
  try {
    const a = await koboFetch(feed.server_url, `/api/v2/assets/${feed.form_uid}/?format=json`, feed.api_token);
    const asset: AssetSchema = {
      survey: a?.content?.survey ?? [],
      choices: a?.content?.choices ?? [],
      title: a?.name ?? feed.name ?? null,
    };
    assetCache.set(feed.form_uid, { at: Date.now(), asset });
    return asset;
  } catch (_e) {
    return hit?.asset ?? { survey: [], choices: [], title: feed.name ?? null };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await resolveCaller(req);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    /* ------------------------------------------------------------ list --- */
    if (action === "list") {
      if (!caller.isAdmin && !caller.granted) return json({ error: "Forbidden" }, 403);
      const { data, error } = await admin
        .from("checklist_dashboard_feeds")
        .select("id, name, form_uid, server_url, is_active, updated_at")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 400);
      return json({
        feeds: data ?? [],
        scopeStates: caller.isAdmin ? [] : caller.scopeStates,
        isAdmin: caller.isAdmin,
      });
    }

    /* --------------------------------------------------------- publish --- */
    if (action === "publish") {
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
      const name = String(body?.name ?? "").trim() || "Integrated Supervisory Checklist";
      const formUid = String(body?.form_uid ?? "").trim();
      const serverUrl = String(body?.server_url ?? "").trim() || "https://kf.kobotoolbox.org";
      const apiToken = String(body?.api_token ?? "").trim();
      if (!formUid || !apiToken) return json({ error: "form_uid and api_token are required" }, 400);

      const { data, error } = await admin
        .from("checklist_dashboard_feeds")
        .upsert(
          { name, form_uid: formUid, server_url: serverUrl, api_token: apiToken, is_active: true, created_by: caller.userId },
          { onConflict: "form_uid" },
        )
        .select("id, name, form_uid, server_url, is_active")
        .single();
      if (error) return json({ error: error.message }, 400);

      await audit({
        actor_id: caller.userId,
        actor_email: await actorEmail(caller.userId),
        action: "publish",
        feed_id: data.id,
        feed_name: data.name,
        form_uid: data.form_uid,
        details: { server_url: serverUrl },
      });
      return json({ feed: data });
    }

    /* ---------------------------------------------------------- delete --- */
    if (action === "unpublish") {
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "id is required" }, 400);
      const { data: existing } = await admin
        .from("checklist_dashboard_feeds").select("id, name, form_uid").eq("id", id).maybeSingle();
      const { error } = await admin.from("checklist_dashboard_feeds").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);

      await audit({
        actor_id: caller.userId,
        actor_email: await actorEmail(caller.userId),
        action: "unpublish",
        feed_id: id,
        feed_name: existing?.name ?? null,
        form_uid: existing?.form_uid ?? null,
      });
      return json({ ok: true });
    }

    /* ------------------------------------------------- register_webhook --- */
    if (action === "register_webhook") {
      // Point the form's KoboToolbox REST Service at kobo-webhook so every new
      // submission emits a realtime `checklist_sync` event instantly.
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);

      let fq = admin
        .from("checklist_dashboard_feeds")
        .select("id, name, form_uid, server_url, api_token")
        .eq("is_active", true);
      const feedId = String(body?.feed_id ?? "");
      if (feedId) fq = fq.eq("id", feedId);
      const { data: feeds, error: fErr } = await fq;
      if (fErr) return json({ error: fErr.message }, 400);
      if (!feeds?.length) return json({ error: "No active checklist feed found" }, 404);

      const { data: secretRow } = await admin
        .from("kobo_webhook_secrets").select("secret").eq("active", true).limit(1).maybeSingle();
      const endpoint = `${SUPABASE_URL}/functions/v1/kobo-webhook?form_type=checklist`;
      const hookBody: Record<string, unknown> = {
        name: "Amehnities Checklist Realtime Sync",
        endpoint,
        active: true,
        subset_fields: [],
        email_notification: false,
        export_type: "json",
        ...(secretRow?.secret ? { settings: { custom_headers: { "x-kobo-secret": secretRow.secret } } } : {}),
      };

      const results: unknown[] = [];
      for (const feed of feeds) {
        try {
          const existing = await koboFetch(feed.server_url, `/api/v2/assets/${feed.form_uid}/hooks/?format=json`, feed.api_token);
          const match = (existing?.results ?? []).find((h: any) => String(h?.endpoint ?? "").includes("kobo-webhook"));
          const hook = match?.uid
            ? await koboFetch(feed.server_url, `/api/v2/assets/${feed.form_uid}/hooks/${match.uid}/`, feed.api_token, { method: "PATCH", body: hookBody })
            : await koboFetch(feed.server_url, `/api/v2/assets/${feed.form_uid}/hooks/`, feed.api_token, { method: "POST", body: hookBody });
          results.push({ feed_id: feed.id, form_uid: feed.form_uid, ok: true, hook: { uid: hook?.uid, endpoint: hook?.endpoint, active: hook?.active } });
          await audit({
            actor_id: caller.userId,
            actor_email: await actorEmail(caller.userId),
            action: "register_webhook",
            feed_id: feed.id,
            feed_name: feed.name,
            form_uid: feed.form_uid,
            details: { endpoint, hook_uid: hook?.uid ?? null, updated_existing: !!match?.uid },
          });
        } catch (e) {
          results.push({ feed_id: feed.id, form_uid: feed.form_uid, ok: false, error: (e as Error).message });
        }
      }
      return json({ ok: results.every((r: any) => r.ok), endpoint, results });
    }

    /* ------------------------------------------------------- set_scope --- */
    if (action === "set_scope") {
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
      const targetUserId = String(body?.user_id ?? "");
      const pageId = String(body?.page_id ?? "integrated-supervisory");
      if (!targetUserId) return json({ error: "user_id is required" }, 400);
      const states = Array.isArray(body?.scope_states)
        ? (body.scope_states as unknown[]).map((s) => String(s).trim()).filter(Boolean)
        : [];

      const { data: grant } = await admin
        .from("user_page_access")
        .select("id, scope_states")
        .eq("user_id", targetUserId)
        .eq("page_id", pageId)
        .maybeSingle();
      if (!grant) return json({ error: "This user does not have a grant for that page yet." }, 404);

      const { data: updated, error } = await admin
        .from("user_page_access")
        .update({ scope_states: states })
        .eq("id", grant.id)
        .select("id, user_id, page_id, scope_states, expires_at")
        .single();
      if (error) return json({ error: error.message }, 400);

      await audit({
        actor_id: caller.userId,
        actor_email: await actorEmail(caller.userId),
        action: "scope_change",
        target_user_id: targetUserId,
        target_email: await actorEmail(targetUserId),
        page_id: pageId,
        previous_scope_states: (grant.scope_states as string[] | null) ?? [],
        new_scope_states: states,
      });
      return json({ grant: updated });
    }

    /* ----------------------------------------------------------- audit --- */
    if (action === "audit") {
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
      const { data, error } = await admin
        .from("checklist_feed_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(500, Number(body?.limit ?? 200)));
      if (error) return json({ error: error.message }, 400);
      return json({ entries: data ?? [] });
    }

    /* ---------------------------------------------- fetch_attachment --- */
    // Grantees have no Kobo API token, so photos/signatures are streamed
    // through this function (the token never leaves the server).
    if (action === "fetch_attachment") {
      if (!caller.isAdmin && !caller.granted) return json({ error: "Forbidden" }, 403);
      const attachmentUrl = String(body?.attachment_url ?? "");
      if (!attachmentUrl) return json({ error: "attachment_url is required" }, 400);

      let q = admin
        .from("checklist_dashboard_feeds")
        .select("id, name, form_uid, server_url, api_token")
        .eq("is_active", true);
      const fid = String(body?.feed_id ?? "");
      if (fid) q = q.eq("id", fid);
      const { data: feeds } = await q.order("created_at", { ascending: true }).limit(1);
      const feed = feeds?.[0];
      if (!feed) return json({ error: "No Checklist data feed has been published yet." }, 404);

      // Only ever proxy to the published Kobo deployment's own hosts.
      let target: URL;
      try { target = new URL(attachmentUrl); } catch { return json({ error: "Invalid attachment_url" }, 400); }
      const feedHost = new URL(feed.server_url).hostname;
      const rootOf = (h: string) => h.split(".").slice(-2).join(".");
      if (target.protocol !== "https:" || rootOf(target.hostname) !== rootOf(feedHost)) {
        return json({ error: "Attachment host not allowed" }, 400);
      }

      // Non-admins may only read media attached to a submission inside their
      // granted State(s).
      if (!caller.isAdmin) {
        const submissionId = String(body?.submission_id ?? "");
        if (!submissionId) return json({ error: "submission_id is required" }, 400);
        const rec = await koboFetch(
          feed.server_url,
          `/api/v2/assets/${feed.form_uid}/data/${encodeURIComponent(submissionId)}/?format=json`,
          feed.api_token,
        );
        const allowedRows = scopeRows([rec], caller.scopeStates, false);
        if (!allowedRows.length) return json({ error: "Forbidden" }, 403);
        const owns = (rec?._attachments ?? []).some((a: Record<string, unknown>) =>
          [a?.download_url, a?.download_medium_url, a?.download_small_url, a?.download_large_url]
            .filter(Boolean)
            .some((u) => String(u) === attachmentUrl)
        );
        if (!owns) return json({ error: "Forbidden" }, 403);
      }

      const res = await fetch(attachmentUrl, { headers: { Authorization: `Token ${feed.api_token}` } });
      if (!res.ok) return json({ error: `Attachment fetch failed (${res.status})` }, 400);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      const mime = res.headers.get("content-type") ?? "application/octet-stream";
      return json({ data_url: `data:${mime};base64,${btoa(bin)}` });
    }

    /* ----------------------------------------------------------- fetch --- */
    if (action === "fetch") {
      if (!caller.isAdmin && !caller.granted) return json({ error: "Forbidden" }, 403);

      let q = admin
        .from("checklist_dashboard_feeds")
        .select("id, name, form_uid, server_url, api_token")
        .eq("is_active", true);
      const feedId = String(body?.feed_id ?? "");
      if (feedId) q = q.eq("id", feedId);
      const { data: feeds, error } = await q.order("created_at", { ascending: true }).limit(1);
      if (error) return json({ error: error.message }, 400);
      const feed = feeds?.[0];
      if (!feed) return json({ error: "No Checklist data feed has been published yet." }, 404);

      // Delta mode: the client already holds everything up to `since`, so we
      // only ask Kobo for submissions newer than that — a sub-second round trip
      // instead of re-downloading the whole form on every realtime tick.
      const since = typeof body?.since === "string" && body.since ? String(body.since) : null;
      const skipSchema = body?.skip_schema === true;

      const asset = skipSchema
        ? { survey: [], choices: [], title: feed.name ?? null }
        : await loadAsset(feed);

      const PAGE = 1000;
      const HARD_CAP = 50_000;
      const dataPath = (start: number) => {
        const parts = [`format=json`, `limit=${PAGE}`, `start=${start}`, `sort=${encodeURIComponent('{"_submission_time":-1}')}`];
        if (since) {
          parts.push(
            `query=${encodeURIComponent(JSON.stringify({ _submission_time: { $gt: since } }))}`,
          );
        }
        return `/api/v2/assets/${feed.form_uid}/data/?${parts.join("&")}`;
      };

      const results: Record<string, unknown>[] = [];
      const firstPage = await koboFetch(feed.server_url, dataPath(0), feed.api_token);
      const firstChunk = Array.isArray(firstPage?.results) ? firstPage.results : [];
      results.push(...firstChunk);
      const totalAvailable = Number(firstPage?.count) || firstChunk.length;

      if (firstChunk.length === PAGE && totalAvailable > PAGE) {
        // Fetch remaining pages concurrently (bounded) instead of serially.
        const starts: number[] = [];
        for (let s = PAGE; s < Math.min(totalAvailable, HARD_CAP); s += PAGE) starts.push(s);
        const CONCURRENCY = 4;
        for (let i = 0; i < starts.length; i += CONCURRENCY) {
          const batch = await Promise.all(
            starts.slice(i, i + CONCURRENCY).map((s) => koboFetch(feed.server_url, dataPath(s), feed.api_token)),
          );
          for (const p of batch) {
            const chunk = Array.isArray(p?.results) ? p.results : [];
            results.push(...chunk);
          }
        }
      }

      // Server-side State scoping — a granted user can never receive rows
      // outside the State(s) their grant allows.
      const allowed = caller.isAdmin ? [] : caller.scopeStates.map(norm).filter(Boolean);
      const scoped = scopeRows(results, caller.scopeStates, caller.isAdmin);

      let latest: string | null = since;
      for (const r of results) {
        const t = String((r as Record<string, unknown>)?._submission_time ?? "");
        if (t && (!latest || t > latest)) latest = t;
      }

      return json({
        feed: { id: feed.id, name: feed.name, form_uid: feed.form_uid, server_url: feed.server_url },
        form_title: asset.title,
        survey: asset.survey,
        choices: asset.choices,
        mode: since ? "delta" : "full",
        since,
        latest_submission_time: latest,
        count: scoped.length,
        total: results.length,
        scope_states: allowed.length ? caller.scopeStates : [],
        results: scoped,
      });

    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    console.error("checklist-feed error", e);
    return json({ error: (e as Error)?.message ?? "Unexpected error" }, 500);
  }
});
