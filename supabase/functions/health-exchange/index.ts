// Bi-directional health data exchange: DHIS2 (aggregate indicators + metadata),
// HL7 FHIR (Patient / Condition) and LMIS (commodity stock).
//
// All remote credentials live server-side in health_exchange_credentials and
// are never returned to the browser.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";

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
  kind: "dhis2" | "fhir" | "lmis";
  base_url: string;
  auth_type: "bearer" | "basic" | "none";
  username: string | null;
  org_unit_id: string | null;
  dataset_id: string | null;
  default_period_type: string;
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

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
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
            : "api/health";
        const res = await remoteFetch(joinUrl(connection.base_url, path), { headers });
        await log(db, connection, "test", "connection_test", res.ok ? "success" : "error", 0,
          res.ok ? `Reachable (HTTP ${res.status})` : `HTTP ${res.status}`, guard.userId);
        return json({ ok: res.ok, status: res.status, body: res.ok ? res.body : String(res.body).slice(0, 500) });
      }

      /* ------------------------- DHIS2 metadata ------------------------ */
      case "pull_metadata": {
        if (connection.kind !== "dhis2") return json({ error: "Metadata pull is for DHIS2 connections" }, 400);
        const [orgUnits, dataElements] = await Promise.all([
          remoteFetch(joinUrl(connection.base_url, "api/organisationUnits?fields=id,name,level&pageSize=200"), { headers }),
          remoteFetch(joinUrl(connection.base_url, "api/dataElements?fields=id,name&pageSize=500"), { headers }),
        ]);
        const ok = orgUnits.ok && dataElements.ok;
        await log(db, connection, "pull", "dhis2_metadata", ok ? "success" : "error", 0,
          ok ? "Metadata pulled" : "Metadata pull failed", guard.userId);
        if (!ok) return json({ error: "Metadata pull failed" }, 502);
        return json({
          ok: true,
          orgUnits: (orgUnits.body as any)?.organisationUnits ?? [],
          dataElements: (dataElements.body as any)?.dataElements ?? [],
        });
      }

      /* --------------------- DHIS2 indicator push ---------------------- */
      case "push_indicators": {
        if (connection.kind !== "dhis2") return json({ error: "Indicator push is for DHIS2 connections" }, 400);
        const period = String(payload.period ?? "");
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

        const res = await remoteFetch(joinUrl(connection.base_url, "api/dataValueSets"), {
          method: "POST", headers, body: JSON.stringify({ dataValues }),
        });
        const status = res.ok ? "success" : "error";
        await log(db, connection, "push", "dhis2_data_values", status, dataValues.length,
          res.ok ? `Sent ${dataValues.length} values for ${period}` : `HTTP ${res.status}: ${String(res.body).slice(0, 300)}`,
          guard.userId);
        return json({ ok: res.ok, sent: dataValues.length, response: res.body }, res.ok ? 200 : 502);
      }

      /* ------------------------- LMIS stock pull ----------------------- */
      case "pull_stock": {
        if (connection.kind !== "lmis") return json({ error: "Stock pull is for LMIS connections" }, 400);
        const path = String(payload.path ?? "api/stock") +
          (connection.org_unit_id ? `?facility=${encodeURIComponent(connection.org_unit_id)}` : "");
        const res = await remoteFetch(joinUrl(connection.base_url, path), { headers });
        if (!res.ok) {
          await log(db, connection, "pull", "lmis_stock", "error", 0, `HTTP ${res.status}`, guard.userId);
          return json({ error: `LMIS responded ${res.status}` }, 502);
        }
        const body: any = res.body;
        const items: any[] = Array.isArray(body) ? body : (body?.items ?? body?.stock ?? body?.entries ?? []);

        // Map external facility codes to registered facilities where possible.
        const { data: facilities } = await db.from("health_facilities")
          .select("id, facility_code, name").eq("project_id", connection.project_id);
        const byCode = new Map((facilities ?? []).map((f: any) => [String(f.facility_code ?? "").toLowerCase(), f.id]));
        const byName = new Map((facilities ?? []).map((f: any) => [String(f.name ?? "").toLowerCase(), f.id]));

        const rows = items.map((it) => {
          const code = String(it.facility_code ?? it.facilityCode ?? it.facility ?? "");
          const facilityId = byCode.get(code.toLowerCase()) ?? byName.get(String(it.facility_name ?? "").toLowerCase()) ?? null;
          return {
            project_id: connection.project_id,
            facility_id: facilityId,
            external_facility_code: code || null,
            commodity_code: String(it.code ?? it.commodity_code ?? it.productCode ?? it.id ?? "unknown"),
            commodity_name: String(it.name ?? it.commodity_name ?? it.product ?? "Unnamed commodity"),
            category: String(it.category ?? "morbidity_kit"),
            unit: it.unit ? String(it.unit) : null,
            quantity_on_hand: Number(it.quantity ?? it.stockOnHand ?? it.quantity_on_hand ?? 0) || 0,
            reorder_level: it.reorder_level != null ? Number(it.reorder_level) : (it.reorderLevel != null ? Number(it.reorderLevel) : null),
            expiry_date: it.expiry_date ?? it.expiryDate ?? null,
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
          headers: { ...headers, "Content-Type": "application/fhir+json" },
          body: JSON.stringify(bundle),
        });
        await log(db, connection, "push", "fhir_patients", res.ok ? "success" : "error", entries.length,
          res.ok ? `Sent ${entries.length} patients` : `HTTP ${res.status}: ${String(res.body).slice(0, 300)}`, guard.userId);
        return json({ ok: res.ok, sent: entries.length, response: res.body }, res.ok ? 200 : 502);
      }

      /* ------------------------ FHIR Patient pull ---------------------- */
      case "pull_fhir": {
        if (connection.kind !== "fhir") return json({ error: "FHIR pull is for FHIR connections" }, 400);
        const query = String(payload.query ?? "Patient?_count=50");
        const res = await remoteFetch(joinUrl(connection.base_url, query), { headers });
        const count = (res.body as any)?.entry?.length ?? 0;
        await log(db, connection, "pull", "fhir_query", res.ok ? "success" : "error", count,
          res.ok ? `Received ${count} resources` : `HTTP ${res.status}`, guard.userId);
        return json({ ok: res.ok, count, body: res.body }, res.ok ? 200 : 502);
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
