// Bi-directional health data exchange: DHIS2 (aggregate indicators + metadata),
// HL7 FHIR (Patient / Condition) and LMIS (commodity stock).
//
// All remote credentials live server-side in health_exchange_credentials and
// are never returned to the browser.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";
import { buildAdxXml, buildSdmxCsv, buildSdmxJson, validateAdxXml, validateSdmxPayload, type ExchangeObservation } from "../_shared/exchangeStandards.ts";

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
  } else if (conn.auth_type === "apitoken") {
    headers.Authorization = `ApiToken ${secret}`;
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
            : String(payload.path ?? "api/stockCards?page=0&size=1");
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
          remoteFetch(joinUrl(connection.base_url, "api/organisationUnits?fields=id,name,level&pageSize=200"), { headers }),
          remoteFetch(joinUrl(connection.base_url, "api/dataElements?fields=id,name&pageSize=500"), { headers }),
          remoteFetch(joinUrl(connection.base_url, "api/dataSets?fields=id,name,periodType,dataSetElements[dataElement[id,name]]&pageSize=200"), { headers }),
          remoteFetch(joinUrl(connection.base_url, "api/categoryOptionCombos?fields=id,name&filter=ignoreApproval:neq:true&pageSize=500"), { headers }),
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

      /* --------------------- DHIS2 indicator push ---------------------- */
      case "push_indicators": {
        if (connection.kind !== "dhis2") return json({ error: "Indicator push is for DHIS2 connections" }, 400);
        const period = String(payload.period ?? "");
        const dryRun = payload.dry_run === true;
        const values = Array.isArray(payload.values) ? payload.values as { indicator_key: string; value: number }[] : [];
        if (!period || values.length === 0) return json({ error: "period and values required" }, 400);

        const { data: maps } = await db.from("health_exchange_mappings")
          .select("indicator_key, remote_id, category_option_combo")
          .eq("connection_id", connection.id);
        const byKey = new Map((maps ?? []).map((m: any) => [m.indicator_key, m]));

        const dataValues = values
          .filter((v) => byKey.has(v.indicator_key))
          .map((v) => {
            const m: any = byKey.get(v.indicator_key);
            return {
              dataElement: m.remote_id,
              period,
              orgUnit: String(payload.org_unit ?? connection.org_unit_id ?? ""),
              value: String(v.value ?? 0),
              ...(m.category_option_combo ? { categoryOptionCombo: m.category_option_combo } : {}),
            };
          });
        if (dataValues.length === 0) return json({ error: "No mapped indicators to send" }, 400);

        const params = new URLSearchParams({
          dryRun: String(dryRun),
          importStrategy: "CREATE_AND_UPDATE",
          preheatCache: "true",
        });
        const res = await remoteFetch(joinUrl(connection.base_url, `api/dataValueSets?${params}`), {
          method: "POST", headers, body: JSON.stringify({ dataValues }),
        });
        const importBody = res.body as Record<string, any> | null;
        const conflicts = Number(importBody?.response?.conflicts?.length ?? importBody?.conflicts?.length ?? 0);
        const ignored = Number(importBody?.response?.importCount?.ignored ?? importBody?.importCount?.ignored ?? 0);
        const status = res.ok && conflicts === 0 && ignored === 0 ? "success" : res.ok ? "partial" : "error";
        const importSummary = remoteMessage(res.body,
          `${dryRun ? "Validated" : "Imported"} ${dataValues.length} values${conflicts || ignored ? `; ${conflicts} conflicts, ${ignored} ignored` : ""}`);
        await log(db, connection, "push", "dhis2_data_values", status, dataValues.length,
          res.ok ? importSummary : `HTTP ${res.status}: ${importSummary}`,
          guard.userId);
        return json({ ok: res.ok, dryRun, sent: dataValues.length, status, message: importSummary, response: res.body }, res.ok ? 200 : 502);
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
          content = buildAdxXml({ orgUnit: String(payload.org_unit ?? connection.org_unit_id ?? ""), dataSet: connection.dataset_id ?? "", period, observations });
          contentType = "application/adx+xml";
          validation = validateAdxXml(content);
        } else {
          const sdmxInput = { agencyId: connection.agency_id ?? "HANDS", dataflowId: connection.dataflow_id ?? connection.dataset_id ?? "", dataflowVersion: connection.dataflow_version ?? "1.0", period, observations, defaults: connection.default_dimensions ?? {} };
          if (!sdmxInput.dataflowId) return json({ error: "SDMX requires a dataflow ID" }, 400);
          content = format === "sdmx-json" ? buildSdmxJson(sdmxInput) : buildSdmxCsv(sdmxInput);
          contentType = format === "sdmx-json" ? "application/vnd.sdmx.data+json;version=2.0.0" : "application/vnd.sdmx.data+csv;version=2.0.0";
          validation = validateSdmxPayload(content, format, Object.keys(connection.default_dimensions ?? {}));
        }
        if (!validation.valid) return json({ error: validation.errors.join(" "), validation }, 400);
        if (action === "preview_aggregate") return json({ ok: true, content, contentType, format, validation });

        const dryRun = payload.dry_run === true;
        const target = format === "adx-xml" && connection.kind === "dhis2"
          ? joinUrl(connection.base_url, `api/dataValueSets?dryRun=${String(dryRun)}&importStrategy=CREATE_AND_UPDATE`)
          : connection.base_url;
        const response = await remoteFetch(target, { method: "POST", headers: { ...headers, Accept: contentType, "Content-Type": contentType }, body: content });
        const status = response.ok ? "success" : "error";
        const message = response.ok ? `${format.toUpperCase()} exchange accepted (${validation.observationCount} observations)` : remoteMessage(response.body, `HTTP ${response.status}`);
        await log(db, connection, "push", format, status, validation.observationCount, message, guard.userId);
        return json({ ok: response.ok, status, message, accepted: response.ok ? validation.observationCount : 0, rejected: response.ok ? 0 : validation.observationCount, response: response.body }, response.ok ? 200 : 502);
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
        const path = requestedPath + (connection.org_unit_id
          ? `${separator}facilityId=${encodeURIComponent(connection.org_unit_id)}&size=2000`
          : `${separator}size=2000`);
        const res = await remoteFetch(joinUrl(connection.base_url, path), { headers });
        if (!res.ok) {
          await log(db, connection, "pull", "lmis_stock", "error", 0, `HTTP ${res.status}`, guard.userId);
          return json({ error: remoteMessage(res.body, `LMIS responded ${res.status}`) }, 502);
        }
        const items = asArray(res.body);

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
          const facilityId = byCode.get(code.toLowerCase()) ?? byName.get(facilityName.toLowerCase()) ?? null;
          return {
            project_id: connection.project_id,
            facility_id: facilityId,
            external_facility_code: code || null,
            commodity_code: String(it.code ?? it.commodity_code ?? it.productCode ?? orderable.productCode ?? orderable.code ?? orderable.id ?? it.id ?? "unknown"),
            commodity_name: String(it.name ?? it.commodity_name ?? orderable.fullProductName ?? orderable.name ?? "Unnamed commodity"),
            category: String(it.category ?? "morbidity_kit"),
            unit: it.unit ? String(it.unit) : orderable.dispensable ? String((orderable.dispensable as Record<string, unknown>).displayUnit ?? "") || null : null,
            quantity_on_hand: Number(it.quantity ?? it.stockOnHand ?? it.quantity_on_hand ?? it.quantityOnHand ?? 0) || 0,
            reorder_level: it.reorder_level != null ? Number(it.reorder_level) : (it.reorderLevel != null ? Number(it.reorderLevel) : null),
            expiry_date: it.expiry_date ?? it.expiryDate ?? lot.expirationDate ?? null,
            source: "lmis",
            last_synced_at: new Date().toISOString(),
          };
        }).filter((r) => r.facility_id);

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
