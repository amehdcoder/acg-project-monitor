import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { guardRequest } from "../_shared/authGuard.ts";
import { googleQuestions, googleResult, type GoogleForm, type GoogleResponse } from "./provider.ts";

const Mapping = z.object({ participant: z.string().max(255).optional(), name: z.string().max(255).optional(), cohort: z.string().max(255).optional(), state: z.string().max(255).optional(), lga: z.string().max(255).optional(), designation: z.string().max(255).optional() });
const Result = z.object({ response_id: z.string().min(1).max(255), participant_key: z.string().trim().min(1).max(255), participant_name: z.string().trim().min(1).max(255), percentage: z.number().finite().min(0).max(100), submitted_at: z.string().datetime(), answers: z.record(z.unknown()).optional(), cohort: z.string().nullable().optional(), state: z.string().nullable().optional(), lga: z.string().nullable().optional(), designation: z.string().nullable().optional() });
const Body = z.object({ action: z.enum(["list", "inspect", "connect", "import_questions", "sync", "pause", "receive", "scheduled"]), quiz_id: z.string().uuid().optional(), sync_id: z.string().uuid().optional(), form_id: z.string().regex(/^[a-zA-Z0-9_-]{5,255}$/).optional(), provider: z.enum(["google", "microsoft", "mentimeter", "other"]).optional(), assessment_type: z.enum(["pre_test", "post_test"]).optional(), mapping: Mapping.optional(), responses: z.array(Result).min(1).max(200).optional() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let activeSync: string | undefined;
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key || !anon) return json({ error: "Sync service unavailable" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const check = <T>(result: { data: T; error: { message: string } | null }): T => { if (result.error) throw new Error(result.error.message); return result.data; };
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const body = parsed.data;
    if (body.action === "receive") {
      if (!body.sync_id || !body.responses) return json({ error: "Sync ID and responses required" }, 400);
      const sync = check(await admin.from("quiz_external_syncs").select("*").eq("id", body.sync_id).maybeSingle());
      const token = req.headers.get("x-sync-token") ?? "";
      if (!sync?.enabled || !sync.secret_hash || !token || await hash(token) !== sync.secret_hash) return json({ error: "Invalid sync authorization" }, 401);
      if (!check(await admin.rpc("is_admin", { _user_id: sync.owner_id }))) return json({ error: "Connection owner no longer has administrator access" }, 403);
      const { responses } = body;
      const normalized = responses.map(r => ({ ...r, participant_key: r.participant_key.toLowerCase(), assessment_type: sync.assessment_type }));
      const count = check(await admin.rpc("store_external_quiz_responses", { p_sync_id: sync.id, p_responses: normalized }));
      check(await admin.from("quiz_external_syncs").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", sync.id));
      return json({ imported: count });
    }
    const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
    if (guard.response) return guard.response;
    if (body.action === "scheduled") {
      if (!guard.viaService) return json({ error: "Worker authorization required" }, 403);
      const syncs = check(await admin.from("quiz_external_syncs").select("id").eq("provider", "google").eq("enabled", true).order("last_sync_at", { nullsFirst: true }).limit(10));
      const outcomes = [];
      for (const sync of syncs ?? []) {
        const response = await fetch(`${url}/functions/v1/external-quiz-sync`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", sync_id: sync.id }) });
        outcomes.push({ id: sync.id, status: response.status }); await response.text();
      }
      return json({ outcomes });
    }
    if (body.action === "list") {
      if (!guard.userId || !body.quiz_id) return json({ error: "Quiz required" }, 400);
      const data = check(await admin.from("quiz_external_syncs").select("id,provider,form_id,assessment_type,enabled,last_sync_at,last_error,imported_count,mapping,schema_hash").eq("owner_id", guard.userId).eq("quiz_id", body.quiz_id));
      return json({ connections: data });
    }
    let sync = body.sync_id ? check(await admin.from("quiz_external_syncs").select("*").eq("id", body.sync_id).maybeSingle()) : null;
    if (sync && !guard.viaService && sync.owner_id !== guard.userId) return json({ error: "Connection access denied" }, 403);
    if (sync && !check(await admin.rpc("is_admin", { _user_id: sync.owner_id }))) return json({ error: "Connection owner no longer has administrator access" }, 403);
    if (body.action === "pause") {
      if (!sync) return json({ error: "Connection required" }, 400);
      check(await admin.from("quiz_external_syncs").update({ enabled: !sync.enabled }).eq("id", sync.id)); return json({ enabled: !sync.enabled });
    }
    const owner = sync?.owner_id ?? guard.userId;
    const formId = sync?.form_id ?? body.form_id;
    if (!owner) return json({ error: "Account required" }, 400);
    const googleAccess = async () => {
      const token = check(await admin.from("user_google_oauth_tokens").select("access_token,refresh_token,expires_at,scope").eq("user_id", owner).eq("provider", "google").maybeSingle());
      if (!token || !["forms.body.readonly", "forms.responses.readonly"].every(s => token.scope?.includes(s))) throw new Error("Reconnect Google and approve form questions and responses access.");
      if (Date.parse(token.expires_at) > Date.now() + 60000) return token.access_token;
      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"); const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
      if (!clientId || !secret || !token.refresh_token) throw new Error("Reconnect your Google account.");
      const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, refresh_token: token.refresh_token, grant_type: "refresh_token" }) });
      if (!response.ok) throw new Error(`Google authorization expired [${response.status}]. Reconnect Google.`);
      const next = await response.json();
      if (!next.access_token) throw new Error("Google did not return account authorization.");
      check(await admin.from("user_google_oauth_tokens").update({ access_token: next.access_token, expires_at: new Date(Date.now() + next.expires_in * 1000).toISOString() }).eq("user_id", owner).eq("provider", "google"));
      return next.access_token as string;
    };
    if (body.action === "connect") {
      if (!body.quiz_id || !formId || !body.provider || !body.assessment_type || !guard.userId) return json({ error: "Quiz, provider, form and assessment type required" }, 400);
      if (body.provider === "mentimeter") return json({ error: "Mentimeter does not publish a supported quiz-data API. Vendor-approved automated delivery is required." }, 422);
      const quiz = check(await admin.from("quizzes").select("id").eq("id", body.quiz_id).maybeSingle()); if (!quiz) return json({ error: "Quiz not found" }, 404);
      if (body.provider === "google") { const access = await googleAccess(); const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, { headers: { Authorization: `Bearer ${access}` } }); if (!response.ok) throw new Error(`Google Forms [${response.status}]: ${await response.text()}`); await response.text(); }
      const secret = body.provider === "google" ? undefined : `eqs_${crypto.randomUUID()}${crypto.randomUUID()}`;
      const connection = check(await admin.from("quiz_external_syncs").insert({ quiz_id: body.quiz_id, provider: body.provider, form_id: formId, owner_id: guard.userId, assessment_type: body.assessment_type, mapping: body.mapping ?? {}, secret_hash: secret ? await hash(secret) : null }).select("id").single());
      return json({ id: connection.id, token: secret, endpoint: secret ? `${url}/functions/v1/external-quiz-sync` : undefined });
    }
    if (!formId) return json({ error: "Form ID required" }, 400);
    if (body.action === "sync") {
      if (!sync || sync.provider !== "google") return json({ error: "Select a Google connection; other providers deliver responses to their receiving endpoint." }, 400);
      if (!check(await admin.rpc("claim_external_quiz_sync", { p_id: sync.id }))) return json({ error: "Sync is paused or already running" }, 409);
      activeSync = sync.id;
    }
    const access = await googleAccess();
    const get = async (path: string) => { const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}${path}`, { headers: { Authorization: `Bearer ${access}` } }); if (!response.ok) { const details = await response.text(); console.error(`Google Forms [${response.status}]: ${details}`); throw new Error(`Google Forms [${response.status}]: ${details}`); } return response.json(); };
    const form: GoogleForm = await get("");
    const schemaHash = await hash(JSON.stringify(form.items ?? []));
    if (body.action === "inspect") return json({ title: form.info?.title, questions: googleQuestions(form), fields: (form.items ?? []).flatMap(i => i.questionItem?.question?.questionId ? [{ id: i.questionItem.question.questionId, label: i.title }] : []), schema_hash: schemaHash });
    if (body.action === "import_questions") {
      if (!sync || !guard.userId) return json({ error: "Connection required" }, 400);
      if (sync.schema_hash === schemaHash) return json({ imported: 0, message: "This schema has already been imported" });
      if (sync.schema_hash) return json({ error: "The imported schema has changed. Create a new quiz version to preserve existing results." }, 409);
      const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
      const count = check(await caller.rpc("import_quiz_questions", { p_quiz_id: sync.quiz_id, p_questions: googleQuestions(form) }));
      check(await admin.from("quiz_external_syncs").update({ schema_hash: schemaHash, schema_json: form }).eq("id", sync.id)); return json({ imported: count });
    }
    if (!sync || body.action !== "sync") return json({ error: "Unsupported action" }, 400);
    if (sync.schema_hash && sync.schema_hash !== schemaHash) throw new Error("Google form questions changed. Sync paused until a new quiz version is linked.");
    let pageToken = sync.page_token || ""; let latest = sync.cursor_at || ""; let imported = 0;
    for (let page = 0; page < 3; page++) {
      const query = new URLSearchParams({ pageSize: "100" });
      if (pageToken) query.set("pageToken", pageToken);
      if (sync.cursor_at) query.set("filter", `timestamp >= ${sync.cursor_at}`);
      const result = await get(`/responses?${query}`);
      const responses: GoogleResponse[] = result.responses ?? [];
      const normalized = responses.map(r => ({ ...googleResult(form, r, sync.mapping, sync.assessment_type), response_id: r.responseId, answers: r.answers ?? {} }));
      if (normalized.length) imported += Number(check(await admin.rpc("store_external_quiz_responses", { p_sync_id: sync.id, p_responses: normalized })));
      for (const r of normalized) if (r.submitted_at && r.submitted_at > latest) latest = r.submitted_at;
      pageToken = result.nextPageToken ?? "";
      if (!pageToken) break;
    }
    // Keep the same timestamp filter while a multi-page scan is unfinished.
    check(await admin.from("quiz_external_syncs").update({ page_token: pageToken || null, cursor_at: pageToken ? sync.cursor_at : latest || null, schema_json: form, last_sync_at: new Date().toISOString(), last_error: null, lease_until: null }).eq("id", sync.id));
    activeSync = undefined;
    return json({ imported, more_pending: !!pageToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "External sync failed";
    if (activeSync) await admin.from("quiz_external_syncs").update({ last_error: message, lease_until: null }).eq("id", activeSync);
    return json({ error: message }, 400);
  }
});