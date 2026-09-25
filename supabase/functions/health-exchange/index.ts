// Bi-directional health data exchange: DHIS2 (aggregate indicators + metadata),
// HL7 FHIR (Patient / Condition) and LMIS (commodity stock).
//
// All remote credentials live server-side in health_exchange_credentials and
// are never returned to the browser.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";
import { buildAdxXml, buildSdmxCsv, buildSdmxJson, validateAdxXml, validateSdmxPayload, type ExchangeObservation } from "../_shared/exchangeStandards.ts";
import { z } from "npm:zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Connection = {
  id: string;
  project_id: string;
  name: string;
  kind: "dhis2" | "fhir" | "lmis" | "sdmx";
  base_url: string;
  auth_type: "bearer" | "basic" | "none" | "apitoken" | "oauth2_client_credentials";
  username: string | null;
  org_unit_id: string | null;
  dataset_id: string | null;
  default_period_type: string;
  exchange_format: "json" | "adx-xml" | "sdmx-json" | "sdmx-csv";
  token_url: string | null;
  agency_id: string | null;
  dataflow_id: string | null;
  dataflow_version: string | null;
  dsd_id: string | null;
  default_dimensions: Record<string, string> | null;
  auto_push_enabled?: boolean;
  auto_push_day?: number;
  auto_push_dry_run?: boolean;
  last_auto_period?: string | null;
  lmis_program_id?: string | null;
};

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function authHeaders(db: ReturnType<typeof admin>, conn: Connection) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (conn.auth_type === "none") return headers;
  const { data } = await db
    .from("health_exchange_credentials")
    .select("secret")
    .eq("connection_id", conn.id)
    .maybeSingle();
  const secret = data?.secret;
  if (!secret) throw new Error("No credential saved for this connection.");
  if (conn.auth_type === "basic") {
    headers.Authorization = `Basic ${btoa(`${conn.username ?? ""}:${secret}`)}`;
  } else if (conn.auth_type === "apitoken" || /^d2pat_/.test(secret.trim())) {
    // DHIS2 personal access tokens must use the ApiToken scheme, even if
    // the connection was saved with "bearer".
    headers.Authorization = `ApiToken ${secret.trim()}`;
  } else if (conn.auth_type === "oauth2_client_credentials") {
    if (!conn.token_url || !conn.username) throw new Error("OAuth client ID and token URL are required.");
    const token = await remoteFetch(conn.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: conn.username, client_secret: secret }),
    });
    const body = token.body as Record<string, unknown> | null;
    if (!token.ok || !body?.access_token) throw new Error(remoteMessage(token.body, "OAuth token request failed"));
    headers.Authorization = `${String(body.token_type ?? "Bearer")} ${String(body.access_token)}`;
  } else {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}

const joinUrl = (base: string, path: string) =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

async function remoteFetch(url: string, init: RequestInit, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function remoteMessage(body: unknown, fallback: string) {
  if (typeof body === "string") return body.slice(0, 1000) || fallback;
  const value = body as Record<string, unknown> | null;
  if (!value) return fallback;
  const issue = Array.isArray(value.issue) ? value.issue[0] as Record<string, unknown> | undefined : undefined;
  const details = issue?.details as Record<string, unknown> | undefined;
  return String(
    value.message ?? value.description ?? value.status ?? details?.text ?? issue?.diagnostics ?? fallback,
  ).slice(0, 1000);
}

function asArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  const value = body as Record<string, unknown> | null;
  if (!value) return [];
  for (const key of ["content", "items", "stock", "entries", "results", "data"]) {
    if (Array.isArray(value[key])) return value[key] as Record<string, unknown>[];
  }
  return [];
}

async function log(
  db: ReturnType<typeof admin>,
  conn: Connection,
  direction: "push" | "pull" | "test",
  action: string,
  status: "success" | "error" | "partial",
  record_count: number,
  message: string,
  actor_id: string | null,
) {
  await db.from("health_exchange_sync_logs").insert({
    project_id: conn.project_id,
    connection_id: conn.id,
    direction, action, status, record_count,
    message: message.slice(0, 2000),
    actor_id,
  });
  await db.from("health_exchange_connections")
    .update({ last_sync_at: new Date().toISOString(), last_status: status })
    .eq("id", conn.id);
}


/* ------------------ Monthly indicator totals (server-side) ------------------ */
const BASE_INDICATORS = [
  "beneficiaries_registered", "beneficiaries_active", "cases_confirmed", "referrals_made",
  "home_visits", "mda_treatments", "morbidity_records",
];
const SEXES = ["female", "male"] as const;

function monthRange(period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (!/^\d{6}$/.test(period) || month < 1 || month > 12) throw new Error("Reporting month must be YYYYMM.");
  return { start: new Date(Date.UTC(year, month - 1, 1)).toISOString(), end: new Date(Date.UTC(year, month, 1)).toISOString() };
}

function previousPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Totals plus sex breakdowns (key:female / key:male) for one project-month. */
async function computeMonthlyValues(db: ReturnType<typeof admin>, projectId: string, period: string) {
  const { start, end } = monthRange(period);
  const count = async (table: string, extra?: (q: any) => any, dated = true) => {
    let q: any = db.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (dated) q = q.gte("created_at", start).lt("created_at", end);
    if (extra) q = extra(q);
    const { count: c, error } = await q;
    return error ? 0 : c ?? 0;
  };
  const sexFilter = (sex: string) => (q: any) => q.or(`profile->>sex.ilike.${sex}*,profile->>gender.ilike.${sex}*`);
  const out: Record<string, number> = {};
  const jobs: Promise<void>[] = [];
  const set = (key: string, p: Promise<number>) => jobs.push(p.then((v) => { out[key] = v; }));
  set("beneficiaries_registered", count("beneficiaries"));
  set("beneficiaries_active", count("beneficiaries", (q) => q.eq("status", "active"), false));
  set("cases_confirmed", count("mmdp_potential_cases", (q) => q.not("confirmed_at", "is", null)));
  set("referrals_made", count("beneficiary_referrals"));
  set("home_visits", count("beneficiary_home_visits"));
  set("mda_treatments", count("household_mda_treatments"));
  set("morbidity_records", count("ntd_morbidity_records"));
  for (const sex of SEXES) {
    set(`beneficiaries_registered:${sex}`, count("beneficiaries", sexFilter(sex === "female" ? "f" : "m")));
    set(`beneficiaries_active:${sex}`, count("beneficiaries", (q) => sexFilter(sex === "female" ? "f" : "m")(q.eq("status", "active")), false));
  }
  await Promise.all(jobs);
  return Object.entries(out).map(([indicator_key, value]) => ({ indicator_key, value }));
}

const ScopedMonthlySchema = z.object({
  period: z.string().regex(/^\d{6}$/),
  state: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{M} .'-]+$/u),
  lga: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{M} .'-]+$/u),
  org_unit: z.string().trim().min(1).max(100).optional(),
});

/** Monthly totals restricted to beneficiaries in one State/LGA. */
async function computeScopedMonthlyValues(db: ReturnType<typeof admin>, projectId: string, period: string, state: string, lga: string) {
  const { start, end } = monthRange(period);
  const beneficiaries: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("beneficiaries").select("id,status,profile,created_at")
      .eq("project_id", projectId).ilike("state", state).ilike("lga", lga).range(from, from + 999);
    if (error) throw error;
    beneficiaries.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const ids = beneficiaries.map((beneficiary) => beneficiary.id);
  const linkedCount = async (table: string, dateColumn = "created_at", extra?: (query: any) => any) => {
    if (!ids.length) return 0;
    let total = 0;
    for (let offset = 0; offset < ids.length; offset += 250) {
      let query: any = db.from(table).select("id", { count: "exact", head: true })
        .eq("project_id", projectId).in("beneficiary_id", ids.slice(offset, offset + 250))
        .gte(dateColumn, start).lt(dateColumn, end);
      if (extra) query = extra(query);
      const { count, error } = await query;
      if (error) throw error;
      total += count ?? 0;
    }
    return total;
  };
  const inMonth = (value: string) => value >= start && value < end;
  const sex = (beneficiary: any) => String(beneficiary.profile?.sex ?? beneficiary.profile?.gender ?? "").toLowerCase();
  const registeredRows = beneficiaries.filter((beneficiary) => inMonth(beneficiary.created_at));
  const activeRows = beneficiaries.filter((beneficiary) => beneficiary.status === "active");
  const [registered, active, confirmed, referrals, visits, treatments, morbidity, regF, regM, actF, actM] = await Promise.all([
    Promise.resolve(registeredRows.length), Promise.resolve(activeRows.length),
    linkedCount("mmdp_potential_cases", "created_at", (query) => query.not("confirmed_at", "is", null)),
    linkedCount("beneficiary_referrals"), linkedCount("beneficiary_home_visits"),
    linkedCount("household_mda_treatments"), linkedCount("ntd_morbidity_records"),
    Promise.resolve(registeredRows.filter((beneficiary) => sex(beneficiary).startsWith("f")).length),
    Promise.resolve(registeredRows.filter((beneficiary) => sex(beneficiary).startsWith("m")).length),
    Promise.resolve(activeRows.filter((beneficiary) => sex(beneficiary).startsWith("f")).length),
    Promise.resolve(activeRows.filter((beneficiary) => sex(beneficiary).startsWith("m")).length),
  ]);
  const totals: Record<string, number> = {
    beneficiaries_registered: registered, beneficiaries_active: active, cases_confirmed: confirmed,
    referrals_made: referrals, home_visits: visits, mda_treatments: treatments, morbidity_records: morbidity,
    "beneficiaries_registered:female": regF, "beneficiaries_registered:male": regM,
    "beneficiaries_active:female": actF, "beneficiaries_active:male": actM,
  };
  return { beneficiaryCount: beneficiaries.length, values: Object.entries(totals).map(([indicator_key, value]) => ({ indicator_key, value })) };
}

/** Send mapped values to DHIS2 /api/dataValueSets and log the import summary. */
async function pushDataValues(
  db: ReturnType<typeof admin>, connection: Connection, headers: Record<string, string>,
  period: string, values: { indicator_key: string; value: number }[], orgUnit: string, dryRun: boolean,
  actor: string | null, action = "dhis2_data_values",
) {
  const { data: maps } = await db.from("health_exchange_mappings")
    .select("indicator_key, remote_id, category_option_combo")
    .eq("connection_id", connection.id);
  const byKey = new Map((maps ?? []).filter((m: any) => m.remote_id && m.remote_id !== "UNMAPPED").map((m: any) => [m.indicator_key, m]));
  const dataValues = values.filter((v) => byKey.has(v.indicator_key)).map((v) => {
    const m: any = byKey.get(v.indicator_key);
    return {
      dataElement: m.remote_id, period, orgUnit, value: String(v.value ?? 0),
      ...(m.category_option_combo ? { categoryOptionCombo: m.category_option_combo } : {}),
    };
  });
  if (!orgUnit) return { httpStatus: 400, body: { error: "Choose the reporting area (organisation unit) for this server first." } };
  if (dataValues.length === 0) return { httpStatus: 400, body: { error: "No mapped indicators to send" } };
  const params = new URLSearchParams({ dryRun: String(dryRun), importStrategy: "CREATE_AND_UPDATE", preheatCache: "true" });
  if (connection.dataset_id) params.set("dataSet", connection.dataset_id);
  const res = await remoteFetch(joinUrl(connection.base_url, `api/dataValueSets?${params}`), {
    method: "POST", headers, body: JSON.stringify({ ...(connection.dataset_id ? { dataSet: connection.dataset_id } : {}), period, orgUnit, dataValues }),
  }, 60000);
  const importBody = res.body as Record<string, any> | null;
  const conflictItems: any[] = importBody?.response?.conflicts ?? importBody?.conflicts ?? [];
  const summaryReturned = res.status === 409 && importBody?.response?.responseType === "ImportSummary";
  const counts = importBody?.response?.importCount ?? importBody?.importCount ?? {};
  const ignored = Number(counts.ignored ?? 0);
  const reached = res.ok || summaryReturned;
  const status = res.ok && conflictItems.length === 0 && ignored === 0 ? "success" : reached ? "partial" : "error";
  const message = reached
    ? `${dryRun ? "Dry run" : "Import"} ${period}: ${counts.imported ?? 0} imported, ${counts.updated ?? 0} updated, ${ignored} ignored.${conflictItems.length ? " " + conflictItems.slice(0, 3).map((c) => c.value).join("; ") : ""}`
    : `HTTP ${res.status}: ${remoteMessage(res.body, "DHIS2 rejected the request")}`;
  await log(db, connection, "push", action, status as any, dataValues.length, message, actor);
  return { httpStatus: reached ? 200 : 502, body: { ok: reached, dryRun, sent: dataValues.length, status, message, conflicts: conflictItems, response: res.body } };
}

/** Classify a logistics item as a surgical consumable or a morbidity kit. */
function classifyCommodity(name: string, fallback?: unknown) {
  if (fallback && ["surgical_consumable", "morbidity_kit"].includes(String(fallback))) return String(fallback);
  return /suture|scalpel|blade|glove|gauze|syringe|needle|catheter|drape|forceps|surg|tt\b|trichiasis|hydrocele|anaesth|anesth|lidocaine/i.test(name)
    ? "surgical_consumable" : "morbidity_kit";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Exchange credentials and national reporting are privileged operations.
  // Project membership is not sufficient to call the service directly.
  const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
  if (guard.response) return guard.response;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(payload.action ?? "");
  const connectionId = payload.connection_id ? String(payload.connection_id) : "";
  const db = admin();

  // save_credential does not need the remote call path.
  if (action === "save_credential") {
    const secret = String(payload.secret ?? "");
    if (!connectionId || secret.length < 4) return json({ error: "connection_id and secret required" }, 400);
    const { error } = await db.from("health_exchange_credentials")
      .upsert({ connection_id: connectionId, secret, updated_at: new Date().toISOString() });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // Monthly automation: called by the scheduler (or an admin) with no connection.
  if (action === "run_scheduled") {
    const today = new Date();
    const period = String(payload.period ?? previousPeriod(today));
    const { data: due } = await db.from("health_exchange_connections")
      .select("*").eq("kind", "dhis2").eq("is_active", true).eq("auto_push_enabled", true);
    const results: unknown[] = [];
    for (const c of (due ?? []) as Connection[]) {
      if (payload.force !== true && (today.getUTCDate() < Number(c.auto_push_day ?? 5) || c.last_auto_period === period)) continue;
      try {
        const h = await authHeaders(db, c);
        const values = await computeMonthlyValues(db, c.project_id, period);
        const r = await pushDataValues(db, c, h, period, values, c.org_unit_id ?? "", c.auto_push_dry_run === true, null, "dhis2_monthly_auto");
        if (r.httpStatus === 200 && c.auto_push_dry_run !== true) {
          await db.from("health_exchange_connections").update({ last_auto_period: period }).eq("id", c.id);
        }
        results.push({ connection: c.name, period, ...r.body as object });
      } catch (e) {
        await log(db, c, "push", "dhis2_monthly_auto", "error", 0, (e as Error).message, null);
        results.push({ connection: c.name, period, error: (e as Error).message });
      }
    }
    return json({ ok: true, period, processed: results.length, results });
  }

  if (!connectionId) return json({ error: "connection_id required" }, 400);

  const { data: conn, error: connErr } = await db
    .from("health_exchange_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr || !conn) return json({ error: "Connection not found" }, 404);
  const connection = conn as Connection;

  let headers: Record<string, string>;
  try {
    headers = await authHeaders(db, connection);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  try {
    switch (action) {
      /* ---------------------------------------------------------------- */
      case "test": {
        const path = connection.kind === "dhis2"
          ? "api/system/info"
          : connection.kind === "fhir"
            ? "metadata"
            : connection.kind === "sdmx"
              ? String(payload.path ?? `dataflow/${connection.agency_id ?? "all"}/${connection.dataflow_id ?? "all"}/latest`)
              : String(payload.path ?? "api/stockCardSummaries?page=0&size=1");
        const res = await remoteFetch(joinUrl(connection.base_url, path), { headers });
        await log(db, connection, "test", "connection_test", res.ok ? "success" : "error", 0,
          res.ok ? `Reachable (HTTP ${res.status})` : remoteMessage(res.body, `HTTP ${res.status}`), guard.userId);
        return json({
          ok: res.ok,
          status: res.status,
          message: res.ok ? `Reachable (HTTP ${res.status})` : remoteMessage(res.body, `HTTP ${res.status}`),
          body: res.body,
        }, res.ok ? 200 : 502);
      }

      /* ------------------------- DHIS2 metadata ------------------------ */
      case "pull_metadata": {
        if (connection.kind !== "dhis2") return json({ error: "Metadata pull is for DHIS2 connections" }, 400);
        const [orgUnits, dataElements, dataSets, categoryCombos] = await Promise.all([
          // National instances hold 100k+ org units (down to wards/facilities);
          // pull all State/LGA/Ward levels (1-4) and everything else unpaged.
          remoteFetch(joinUrl(connection.base_url, `api/organisationUnits?fields=id,name,level&filter=level:le:${Number(payload.max_level ?? 4) || 4}&paging=false`), { headers }, 60000),
          remoteFetch(joinUrl(connection.base_url, "api/dataElements?fields=id,name&paging=false"), { headers }, 60000),
          remoteFetch(joinUrl(connection.base_url, "api/dataSets?fields=id,name,periodType,dataSetElements[dataElement[id,name]]&paging=false"), { headers }, 60000),
          remoteFetch(joinUrl(connection.base_url, "api/categoryOptionCombos?fields=id,name&paging=false"), { headers }, 60000),
        ]);
        const ok = orgUnits.ok && dataElements.ok && dataSets.ok && categoryCombos.ok;
        await log(db, connection, "pull", "dhis2_metadata", ok ? "success" : "error", 0,
          ok ? "Metadata pulled" : "Metadata pull failed", guard.userId);
        if (!ok) return json({ error: "Metadata pull failed" }, 502);
        return json({
          ok: true,
          orgUnits: (orgUnits.body as any)?.organisationUnits ?? [],
          dataElements: (dataElements.body as any)?.dataElements ?? [],
          dataSets: (dataSets.body as any)?.dataSets ?? [],
          categoryOptionCombos: (categoryCombos.body as any)?.categoryOptionCombos ?? [],
        });
      }

      /* ------------------ DHIS2 live instance browser ------------------ */
      case "dhis2_browse": {
        if (connection.kind !== "dhis2") return json({ error: "Browsing is for DHIS2 connections" }, 400);
        const mode = String(payload.mode ?? "overview");
        const base = connection.base_url;
        if (mode === "children" || mode === "search") {
          const q = mode === "children"
            ? `api/organisationUnits/${encodeURIComponent(String(payload.parent ?? ""))}?fields=id,children[id,name,level,childCount:children~size]`
            : `api/organisationUnits?fields=id,name,level,path,childCount:children~size&filter=name:ilike:${encodeURIComponent(String(payload.q ?? ""))}&withinUserHierarchy=true&pageSize=40`;
          const res = await remoteFetch(joinUrl(base, q), { headers }, 30000);
          if (!res.ok) return json({ error: remoteMessage(res.body, `HTTP ${res.status}`) }, 502);
          const body: any = res.body;
          const units = mode === "children" ? (body?.children ?? []) : (body?.organisationUnits ?? []);
          return json({ ok: true, orgUnits: units.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))) });
        }
        const [info, me, sets] = await Promise.all([
          remoteFetch(joinUrl(base, "api/system/info"), { headers }, 30000),
          remoteFetch(joinUrl(base, "api/me?fields=username,displayName,organisationUnits[id,name,level,childCount:children~size],dataSets"), { headers }, 30000),
          remoteFetch(joinUrl(base, "api/dataSets?fields=id,name,periodType,dataSetElements[dataElement[id,name,shortName,valueType,categoryCombo[id,name,categoryOptionCombos[id,name]]]]&paging=false"), { headers }, 60000),
        ]);
        if (!info.ok || !me.ok || !sets.ok) {
          const bad = [info, me, sets].find((r) => !r.ok)!;
          return json({ error: remoteMessage(bad.body, `HTTP ${bad.status}`) }, 502);
        }
        const i: any = info.body; const u: any = me.body;
        const writable = new Set<string>(Array.isArray(u?.dataSets) ? u.dataSets : []);
        const dataSets = ((sets.body as any)?.dataSets ?? []).map((d: any) => ({
          id: d.id, name: d.name, periodType: d.periodType, canWrite: writable.size === 0 || writable.has(d.id),
          dataElements: (d.dataSetElements ?? []).map((x: any) => x.dataElement).filter(Boolean).map((e: any) => ({
            id: e.id, name: e.name, valueType: e.valueType,
            categoryCombo: e.categoryCombo?.name ?? null,
            categoryOptionCombos: e.categoryCombo?.categoryOptionCombos ?? [],
          })),
        })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        await log(db, connection, "pull", "dhis2_browse", "success", dataSets.length, "Live instance browsed", guard.userId);
        return json({
          ok: true,
          system: { name: i?.systemName ?? null, version: i?.version ?? null, serverDate: i?.serverDate ?? null, contextPath: i?.contextPath ?? base },
          user: { username: u?.username ?? null, displayName: u?.displayName ?? null },
          roots: u?.organisationUnits ?? [],
          dataSets,
        });
      }


      /* --------------------- DHIS2 indicator push ---------------------- */
      case "push_indicators": {
        if (connection.kind !== "dhis2") return json({ error: "Indicator push is for DHIS2 connections" }, 400);
        const period = String(payload.period ?? "");
        const values = Array.isArray(payload.values) ? payload.values as { indicator_key: string; value: number }[] : [];
        if (!period || values.length === 0) return json({ error: "period and values required" }, 400);
        const r = await pushDataValues(db, connection, headers, period, values, String(payload.org_unit ?? connection.org_unit_id ?? ""), payload.dry_run === true, guard.userId);
        return json(r.body, r.httpStatus);
      }

      /* ------------- Monthly totals + category breakdowns ------------- */
      case "monthly_values": {
        const period = String(payload.period ?? previousPeriod());
        return json({ ok: true, period, values: await computeMonthlyValues(db, connection.project_id, period) });
      }
      case "scoped_monthly_values":
      case "push_scoped_monthly": {
        if (connection.kind !== "dhis2") return json({ error: "LGA reporting is for DHIS2 connections" }, 400);
        const parsed = ScopedMonthlySchema.safeParse(payload);
        if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
        const { period, state, lga, org_unit: orgUnit } = parsed.data;
        const scoped = await computeScopedMonthlyValues(db, connection.project_id, period, state, lga);
        if (action === "scoped_monthly_values") return json({ ok: true, period, geography: { state, lga, beneficiaryCount: scoped.beneficiaryCount }, values: scoped.values });
        if (!orgUnit) return json({ error: "Confirm the DHIS2 organisation unit before sending." }, 400);
        const result = await pushDataValues(db, connection, headers, period, scoped.values, orgUnit, payload.dry_run === true, guard.userId, "dhis2_lga_monthly");
        return json({ ...result.body as object, geography: { state, lga, beneficiaryCount: scoped.beneficiaryCount } }, result.httpStatus);
      }
      case "push_monthly": {
        if (connection.kind !== "dhis2") return json({ error: "Monthly reporting is for DHIS2 connections" }, 400);
        const period = String(payload.period ?? previousPeriod());
        const values = await computeMonthlyValues(db, connection.project_id, period);
        const dryRun = payload.dry_run === true;
        const r = await pushDataValues(db, connection, headers, period, values, String(payload.org_unit ?? connection.org_unit_id ?? ""), dryRun, guard.userId, "dhis2_monthly");
        if (r.httpStatus === 200 && !dryRun) await db.from("health_exchange_connections").update({ last_auto_period: period }).eq("id", connection.id);
        return json(r.body, r.httpStatus);
      }

      /* ---------------------- ADX / SDMX exchange --------------------- */
      case "preview_aggregate":
      case "push_aggregate": {
        if (connection.kind !== "dhis2" && connection.kind !== "sdmx") {
          return json({ error: "Aggregate standards are available for DHIS2 and SDMX connections" }, 400);
        }
        const period = String(payload.period ?? "");
        const format = String(payload.format ?? connection.exchange_format ?? "adx-xml") as "adx-xml" | "sdmx-json" | "sdmx-csv";
        const values = Array.isArray(payload.values) ? payload.values as { indicator_key: string; value: number }[] : [];
        const { data: maps } = await db.from("health_exchange_mappings")
          .select("indicator_key, remote_id, category_option_combo, dimensions")
          .eq("connection_id", connection.id);
        const byKey = new Map((maps ?? []).map((mapping: any) => [mapping.indicator_key, mapping]));
        const observations: ExchangeObservation[] = values.filter((value) => byKey.has(value.indicator_key)).map((value) => {
          const mapping: any = byKey.get(value.indicator_key);
          return { indicatorKey: value.indicator_key, remoteId: mapping.remote_id, value: Number(value.value), categoryOptionCombo: mapping.category_option_combo, dimensions: mapping.dimensions ?? {} };
        });
        if (!observations.length) return json({ error: "No mapped indicators to exchange" }, 400);
        let content = "";
        let contentType = "";
        let validation: { valid: boolean; errors: string[]; observationCount: number };
        if (format === "adx-xml") {
          content = buildAdxXml({ orgUnit: String(payload.org_unit ?? connection.org_unit_id ?? ""), dataSet: String(payload.data_set ?? connection.dataset_id ?? ""), period, observations });
          contentType = "application/adx+xml";
          validation = validateAdxXml(content);
        } else {
          const sdmxInput = { agencyId: connection.agency_id || "HANDS", dataflowId: connection.dataflow_id ?? connection.dataset_id ?? "", dataflowVersion: connection.dataflow_version ?? "1.0", period, observations, defaults: connection.default_dimensions ?? {} };
          if (!sdmxInput.dataflowId) return json({ error: "SDMX requires a dataflow ID" }, 400);
          content = format === "sdmx-json" ? buildSdmxJson(sdmxInput) : buildSdmxCsv(sdmxInput);
          contentType = format === "sdmx-json" ? "application/vnd.sdmx.data+json;version=2.0.0" : "application/vnd.sdmx.data+csv;version=2.0.0";
          validation = validateSdmxPayload(content, format, Object.keys(connection.default_dimensions ?? {}));
        }
        if (!validation.valid) return json({ error: validation.errors.join(" "), validation }, 400);
        if (action === "preview_aggregate") return json({ ok: true, content, contentType, format, validation });

        const dryRun = payload.dry_run === true;
        const isDhisAdx = format === "adx-xml" && connection.kind === "dhis2";
        // DHIS2 ADX import defaults to CODE identifiers; our mappings hold UIDs.
        const target = isDhisAdx
          ? joinUrl(connection.base_url, `api/dataValueSets?dryRun=${String(dryRun)}&importStrategy=CREATE_AND_UPDATE&idScheme=UID&dataElementIdScheme=UID&orgUnitIdScheme=UID&categoryOptionComboIdScheme=UID`)
          : connection.base_url;
        const response = await remoteFetch(target, {
          method: "POST",
          // DHIS2 answers with a JSON import summary, not ADX.
          headers: { ...headers, Accept: isDhisAdx ? "application/json" : contentType, "Content-Type": contentType },
          body: content,
        });
        const summary = (response.body as Record<string, any> | null) ?? {};
        const adxReached = response.ok || (isDhisAdx && response.status === 409 && summary.response?.responseType === "ImportSummary");
        const counts = summary.response?.importCount ?? summary.importCount ?? {};
        const conflictList = summary.response?.conflicts ?? summary.conflicts ?? [];
        const ignored = Number(counts.ignored ?? 0);
        const accepted = isDhisAdx && adxReached
          ? Number(counts.imported ?? 0) + Number(counts.updated ?? 0)
          : response.ok ? validation.observationCount : 0;
        const status = !adxReached ? "error" : (ignored > 0 || conflictList.length > 0) ? "partial" : "success";
        const conflictText = Array.isArray(conflictList) && conflictList.length
          ? ` Conflicts: ${conflictList.slice(0, 3).map((c: any) => c.value ?? c.object ?? JSON.stringify(c)).join("; ")}`
          : "";
        const message = adxReached
          ? `${format.toUpperCase()} ${dryRun ? "validated (dry run)" : "exchange accepted"}: ${isDhisAdx ? `${counts.imported ?? 0} imported, ${counts.updated ?? 0} updated, ${ignored} ignored` : `${validation.observationCount} observations`}.${conflictText}`
          : remoteMessage(response.body, `HTTP ${response.status}`);
        await log(db, connection, "push", format, status, validation.observationCount, message, guard.userId);
        return json({ ok: adxReached, status, dryRun, message, accepted, rejected: ignored, conflicts: conflictList, response: response.body }, adxReached ? 200 : 502);
      }

      case "validate_import": {
        const format = String(payload.format ?? connection.exchange_format) as "adx-xml" | "sdmx-json" | "sdmx-csv";
        const content = String(payload.content ?? "");
        if (content.length > 5_000_000) return json({ error: "Import is larger than 5 MB" }, 413);
        const validation = format === "adx-xml" ? validateAdxXml(content) : validateSdmxPayload(content, format);
        await log(db, connection, "test", `${format}_validation`, validation.valid ? "success" : "error", validation.observationCount, validation.valid ? "Payload is structurally valid" : validation.errors.join(" "), guard.userId);
        return json({ ok: validation.valid, validation }, validation.valid ? 200 : 400);
      }

      case "pull_sdmx_structure": {
        if (connection.kind !== "sdmx") return json({ error: "Structure pull is for SDMX connections" }, 400);
        const agency = connection.agency_id ?? "all";
        const dataflow = connection.dataflow_id ?? "all";
        const version = connection.dataflow_version ?? "latest";
        const response = await remoteFetch(joinUrl(connection.base_url, `dataflow/${agency}/${dataflow}/${version}?references=all`), { headers: { ...headers, Accept: "application/vnd.sdmx.structure+json;version=2.0.0, application/vnd.sdmx.structure+xml;version=2.1" } });
        await log(db, connection, "pull", "sdmx_structure", response.ok ? "success" : "error", 0, response.ok ? "SDMX structure received" : remoteMessage(response.body, `HTTP ${response.status}`), guard.userId);
        return json({ ok: response.ok, message: response.ok ? "SDMX structure received" : remoteMessage(response.body, `HTTP ${response.status}`), body: response.body }, response.ok ? 200 : 502);
      }

      case "pull_sdmx": {
        if (connection.kind !== "sdmx") return json({ error: "Data pull is for SDMX connections" }, 400);
        const query = String(payload.query ?? `data/${connection.dataflow_id ?? "all"}/all`);
        const response = await remoteFetch(joinUrl(connection.base_url, query), { headers: { ...headers, Accept: "application/vnd.sdmx.data+json;version=2.0.0, application/vnd.sdmx.data+csv;version=2.0.0" } });
        await log(db, connection, "pull", "sdmx_data", response.ok ? "success" : "error", 0, response.ok ? "SDMX observations received" : remoteMessage(response.body, `HTTP ${response.status}`), guard.userId);
        return json({ ok: response.ok, message: response.ok ? "SDMX observations received" : remoteMessage(response.body, `HTTP ${response.status}`), body: response.body }, response.ok ? 200 : 502);
      }

      /* ------------------------- LMIS stock pull ----------------------- */
      case "pull_stock": {
        if (connection.kind !== "lmis") return json({ error: "Stock pull is for LMIS connections" }, 400);
        const requestedPath = String(payload.path ?? "api/stockCards");
        const separator = requestedPath.includes("?") ? "&" : "?";
        const q = new URLSearchParams({ size: "2000" });
        if (connection.org_unit_id) q.set("facilityId", connection.org_unit_id);
        const program = connection.lmis_program_id || connection.dataset_id;
        if (program) q.set(requestedPath.includes("stockCardSummaries") ? "programId" : "program", program);
        const path = requestedPath + separator + q.toString();
        const res = await remoteFetch(joinUrl(connection.base_url, path), { headers });
        if (!res.ok) {
          await log(db, connection, "pull", "lmis_stock", "error", 0, `HTTP ${res.status}`, guard.userId);
          return json({ error: remoteMessage(res.body, `LMIS responded ${res.status}`) }, 502);
        }
        // stockCardSummaries nest one card per lot under each orderable.
        const items = asArray(res.body).flatMap((it) => Array.isArray(it.canFulfillForMe) && it.canFulfillForMe.length
          ? (it.canFulfillForMe as Record<string, unknown>[]).map((card) => ({ ...card, orderable: card.orderable ?? it.orderable, facility: it.facility }))
          : [it]);
        const filterCategory = payload.category ? String(payload.category) : "";

        // Map external facility codes to registered facilities where possible.
        const { data: facilities } = await db.from("health_facilities")
          .select("id, facility_code, name").eq("project_id", connection.project_id);
        const byCode = new Map((facilities ?? []).map((f: any) => [String(f.facility_code ?? "").toLowerCase(), f.id]));
        const byName = new Map((facilities ?? []).map((f: any) => [String(f.name ?? "").toLowerCase(), f.id]));

        const rows = items.map((it) => {
          const facility = (it.facility ?? it.servicePoint ?? {}) as Record<string, unknown>;
          const orderable = (it.orderable ?? it.product ?? it.commodity ?? {}) as Record<string, unknown>;
          const lot = (it.lot ?? {}) as Record<string, unknown>;
          const code = String(it.facility_code ?? it.facilityCode ?? facility.code ?? facility.id ?? "");
          const facilityName = String(it.facility_name ?? facility.name ?? "");
          const facilityId = byCode.get(code.toLowerCase()) ?? byName.get(facilityName.toLowerCase())
            ?? ((facilities ?? []).length === 1 ? (facilities as any[])[0].id : null);
          const commodityName = String(it.name ?? it.commodity_name ?? orderable.fullProductName ?? orderable.name ?? "Unnamed commodity");
          return {
            project_id: connection.project_id,
            facility_id: facilityId,
            external_facility_code: code || null,
            commodity_code: String(it.code ?? it.commodity_code ?? it.productCode ?? orderable.productCode ?? orderable.code ?? orderable.id ?? it.id ?? "unknown"),
            commodity_name: commodityName,
            category: classifyCommodity(commodityName, it.category),
            unit: it.unit ? String(it.unit) : orderable.dispensable ? String((orderable.dispensable as Record<string, unknown>).displayUnit ?? "") || null : null,
            quantity_on_hand: Number(it.quantity ?? it.stockOnHand ?? it.quantity_on_hand ?? it.quantityOnHand ?? 0) || 0,
            reorder_level: it.reorder_level != null ? Number(it.reorder_level) : (it.reorderLevel != null ? Number(it.reorderLevel) : null),
            expiry_date: it.expiry_date ?? it.expiryDate ?? lot.expirationDate ?? null,
            source: "lmis",
            last_synced_at: new Date().toISOString(),
          };
        }).filter((r) => r.facility_id && (!filterCategory || r.category === filterCategory));

        if (rows.length) {
          const { error } = await db.from("facility_commodity_stock")
            .upsert(rows, { onConflict: "project_id,facility_id,commodity_code" });
          if (error) {
            await log(db, connection, "pull", "lmis_stock", "error", 0, error.message, guard.userId);
            return json({ error: error.message }, 400);
          }
        }
        await log(db, connection, "pull", "lmis_stock", rows.length === items.length ? "success" : "partial",
          rows.length, `Updated ${rows.length} of ${items.length} stock lines`, guard.userId);
        return json({ ok: true, received: items.length, stored: rows.length });
      }

      /* ------------------------ LMIS stock push ------------------------ */
      case "push_stock": {
        if (connection.kind !== "lmis") return json({ error: "Stock push is for LMIS connections" }, 400);
        const program = connection.lmis_program_id || connection.dataset_id;
        const facility = String(payload.facility_id ?? connection.org_unit_id ?? "");
        if (!program || !facility) return json({ error: "Set the OpenLMIS programme ID and facility ID on this server first." }, 400);
        let q = db.from("facility_commodity_stock").select("*").eq("project_id", connection.project_id);
        if (payload.category) q = q.eq("category", String(payload.category));
        if (Array.isArray(payload.stock_ids) && payload.stock_ids.length) q = q.in("id", payload.stock_ids.map(String));
        const { data: lines } = await q;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const valid = (lines ?? []).filter((l: any) => uuid.test(String(l.commodity_code)));
        const skipped = (lines ?? []).length - valid.length;
        if (!valid.length) return json({ error: "No stock lines carry an OpenLMIS product ID. Pull stock from OpenLMIS first so items are linked." }, 400);
        const occurredDate = new Date().toISOString().slice(0, 10);
        // A stock event without reason/source/destination is a physical inventory count.
        const event = {
          facilityId: facility, programId: program,
          lineItems: valid.map((l: any) => ({ orderableId: l.commodity_code, quantity: Number(l.quantity_on_hand) || 0, occurredDate })),
        };
        const res = await remoteFetch(joinUrl(connection.base_url, String(payload.path ?? "api/stockEvents")), {
          method: "POST", headers, body: JSON.stringify(event),
        }, 60000);
        const message = res.ok
          ? `Sent ${valid.length} stock counts to OpenLMIS${skipped ? ` (${skipped} local-only items skipped)` : ""}`
          : `HTTP ${res.status}: ${remoteMessage(res.body, "OpenLMIS rejected the stock event")}`;
        await log(db, connection, "push", "lmis_stock", res.ok ? (skipped ? "partial" : "success") : "error", valid.length, message, guard.userId);
        if (res.ok) await db.from("facility_commodity_stock").update({ last_synced_at: new Date().toISOString() }).in("id", valid.map((l: any) => l.id));
        return json({ ok: res.ok, sent: valid.length, skipped, message, response: res.body }, res.ok ? 200 : 502);
      }

      /* ------------------------ FHIR Patient push ---------------------- */
      case "push_fhir": {
        if (connection.kind !== "fhir") return json({ error: "FHIR push is for FHIR connections" }, 400);
        const ids = Array.isArray(payload.beneficiary_ids) ? payload.beneficiary_ids.map(String) : [];
        if (ids.length === 0) return json({ error: "beneficiary_ids required" }, 400);

        const { data: people } = await db.from("beneficiaries")
          .select("id, case_id, full_name, profile, state, lga, ward, village, status")
          .in("id", ids.slice(0, 200));

        const entries = (people ?? []).flatMap((b: any) => {
          const profile = (b.profile ?? {}) as Record<string, unknown>;
          const [given, ...family] = String(b.full_name ?? "").split(" ");
          const patient = {
            resourceType: "Patient",
            identifier: [{ system: "https://amehnities.org/case-id", value: b.case_id }],
            name: [{ family: family.join(" ") || given, given: [given] }],
            gender: String(profile.sex ?? profile.gender ?? "unknown").toLowerCase(),
            birthDate: (profile.date_of_birth as string) || undefined,
            address: [{ city: b.village ?? undefined, district: b.lga ?? undefined, state: b.state ?? undefined, country: "NG" }],
          };
          return [{
            fullUrl: `urn:uuid:${b.id}`,
            resource: patient,
            request: { method: "PUT", url: `Patient?identifier=https://amehnities.org/case-id|${b.case_id}` },
          }];
        });

        const bundle = { resourceType: "Bundle", type: "transaction", entry: entries };
        const res = await remoteFetch(joinUrl(connection.base_url, ""), {
          method: "POST",
          headers: { ...headers, Accept: "application/fhir+json", "Content-Type": "application/fhir+json; charset=utf-8" },
          body: JSON.stringify(bundle),
        });
        await log(db, connection, "push", "fhir_patients", res.ok ? "success" : "error", entries.length,
          res.ok ? `Sent ${entries.length} patients` : `HTTP ${res.status}: ${remoteMessage(res.body, "FHIR transaction failed")}`, guard.userId);
        return json({ ok: res.ok, sent: entries.length, message: res.ok ? `Sent ${entries.length} patients` : remoteMessage(res.body, "FHIR transaction failed"), response: res.body }, res.ok ? 200 : 502);
      }

      /* ------------------------ FHIR Patient pull ---------------------- */
      case "pull_fhir": {
        if (connection.kind !== "fhir") return json({ error: "FHIR pull is for FHIR connections" }, 400);
        const query = String(payload.query ?? "Patient?_count=50");
        const res = await remoteFetch(joinUrl(connection.base_url, query), {
          headers: { ...headers, Accept: "application/fhir+json" },
        });
        const count = (res.body as any)?.entry?.length ?? 0;
        await log(db, connection, "pull", "fhir_query", res.ok ? "success" : "error", count,
          res.ok ? `Received ${count} resources` : remoteMessage(res.body, `HTTP ${res.status}`), guard.userId);
        return json({ ok: res.ok, count, message: res.ok ? `Received ${count} resources` : remoteMessage(res.body, `HTTP ${res.status}`), body: res.body }, res.ok ? 200 : 502);
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message ?? "Exchange failed";
    await log(db, connection, "test", action || "unknown", "error", 0, msg, guard.userId);
    return json({ error: msg }, 500);
  }
});
