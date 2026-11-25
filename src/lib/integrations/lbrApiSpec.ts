// Developer integration specification for the Longitudinal Beneficiary Records (LBR).
// Pure data: every exporter (PDF, Word, PowerPoint, TXT, JSON) renders this one object,
// so the formats can never disagree. Routes, scopes and events mirror
// supabase/functions/external-api and webhook-dispatch — update both together.
import type { ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import { buildLbrSchema, type LbrSchema } from "./lbrApiSchema";

export type SpecField = { key: string; label: string; type: string; required: boolean; options?: string[]; location: string };
export type SpecEndpoint = {
  id: string; method: "GET" | "POST"; path: string; scope: string; summary: string;
  params: { name: string; in: "query" | "path" | "body"; type: string; required: boolean; description: string }[];
  returns: string; example: string;
};
export type SpecEvent = { id: string; summary: string; trigger: string; payload: Record<string, string> };

export type LbrApiSpec = {
  documentId: string; title: string; subtitle: string; version: string; generatedAt: string;
  classification: string; moduleName: string; projectName: string;
  /** Content fingerprint of this edition; changes whenever the records setup changes. */
  revision: string; lastChanged: string | null;
  baseUrl: string; webhookOrigin: string;
  selection: { mode: "all" | "single" | "multiple"; componentKeys: string[]; labels: string[] };
  endpointsForSelection: { purpose: string; method: string; url: string }[];
  overview: string[];
  connectionModes: { mode: string; use: string; how: string }[];
  auth: { header: string; keyFormat: string; rules: string[] };
  scopes: { scope: string; grants: string }[];
  componentAccess: string[];
  endpoints: SpecEndpoint[];
  components: { key: string; label: string; services: string[]; extraFields: SpecField[] }[];
  coreFields: SpecField[];
  profileFields: SpecField[];
  serviceFields: SpecField[];
  webhook: { headers: { name: string; description: string }[]; envelope: string; verification: string[]; retries: string[]; events: SpecEvent[] };
  errors: { status: number; meaning: string; action: string }[];
  schema: LbrSchema;
  checklist: string[];
  contacts: string[];
};

const BENEFICIARY_CORE: SpecField[] = [
  ["id", "Internal record UUID", "uuid", true],
  ["case_id", "Unique Case ID (stable cross-system identifier)", "string(≤64)", true],
  ["full_name", "Full name", "string", true],
  ["status", "Record status: active | on_hold | exited | completed | deceased", "enum", true],
  ["risk_level", "Risk level: low | medium | high", "enum", false],
  ["state", "State (INEC geography)", "string", false],
  ["lga", "Local Government Area", "string", false],
  ["ward", "Ward", "string", false],
  ["village", "Village / community", "string", false],
  ["profile", "Object holding every profile field listed in Section 7", "object", false],
  ["next_follow_up_date", "Next scheduled follow-up (YYYY-MM-DD)", "date", false],
  ["version", "Optimistic version counter, increases on every edit", "integer", true],
  ["created_at", "Creation timestamp (ISO 8601, UTC)", "timestamp", true],
  ["updated_at", "Last change timestamp (ISO 8601, UTC) — use for incremental sync", "timestamp", true],
].map(([key, label, type, required]) => ({ key: key as string, label: label as string, type: type as string, required: required as boolean, location: "beneficiary" }));

const SERVICE_FIELDS: SpecField[] = [
  ["id", "Service UUID", "uuid", true],
  ["beneficiary_id", "Owning beneficiary UUID (join to beneficiary.id)", "uuid", true],
  ["component_key", "Programme component key (Section 6)", "string", true],
  ["service_name", "Service delivered", "string", true],
  ["service_date", "Date delivered (YYYY-MM-DD)", "date", true],
  ["result", "Result / outcome text", "string", false],
  ["status", "on_track | due | overdue | at_risk | needs_follow_up | completed | suspended | exited | not_applicable", "enum", false],
  ["data", "Object with component-specific answers", "object", false],
  ["created_at", "Creation timestamp (ISO 8601, UTC) — cursor field", "timestamp", true],
].map(([key, label, type, required]) => ({ key: key as string, label: label as string, type: type as string, required: required as boolean, location: "service" }));

type Q = { name?: string; label?: string; type?: string; required?: boolean; options?: { value?: string; label?: string }[] };
const toField = (q: Q, location: string): SpecField => ({
  key: q.name || "", label: q.label || q.name || "", type: q.type || "text", required: Boolean(q.required), location,
  options: q.options?.length ? q.options.map((o) => String(o.value ?? o.label ?? "")).filter(Boolean) : undefined,
});

export function buildLbrApiSpec(input: {
  config: ProgrammeModuleConfig; moduleName: string; projectName: string; supabaseUrl: string; now?: Date;
  /** Component keys to document; empty or omitted = all components. */
  components?: string[]; moduleId?: string;
  /** When the records setup (components, fields) last changed. */
  lastChanged?: string | null;
}): LbrApiSpec {
  const now = input.now ?? new Date();
  const origin = input.supabaseUrl.replace(/\/+$/, "");
  const baseUrl = `${origin}/functions/v1/external-api/v1`;
  const all = (input.config.components || []).filter((c) => !c.hidden).sort((a, b) => a.order - b.order);
  const want = new Set(input.components || []);
  const picked = want.size ? all.filter((c) => want.has(c.key)) : all;
  const mode: "all" | "single" | "multiple" = !want.size || picked.length === all.length ? "all" : picked.length === 1 ? "single" : "multiple";
  const keys = picked.map((c) => c.key);
  const compQ = mode === "all" ? "" : `component_key=${keys.join(",")}`;
  const components = picked
    .map((c) => ({ key: c.key, label: c.label, services: c.services || [], extraFields: (c.questions || []).filter((q) => q.name).map((q) => toField(q as Q, `service.data (${c.key})`)) }));
  const profileFields = (input.config.sections || []).flatMap((s) =>
    (s.questions || []).filter((q) => q.name).map((q) => toField(q as Q, `profile — ${s.label}`)));
  const ex = (path: string) => `curl -H "Authorization: Bearer amk_YOUR_KEY" "${baseUrl}${path}"`;
  const post = (path: string, body: object) => `curl -X POST -H "Authorization: Bearer amk_YOUR_KEY" -H "Content-Type: application/json" \\\n  "${baseUrl}${path}" \\\n  -d '${JSON.stringify(body)}'`;
  const firstComp = picked[0];
  const sampleData = Object.fromEntries((firstComp?.questions || []).filter((q) => q.name).slice(0, 3).map((q) => [q.name as string, "…"]));
  const mod = input.moduleId ? { module_id: input.moduleId } : {};
  const scopeLabel = mode === "all" ? "All components" : picked.map((c) => c.label).join(", ");

  const spec: LbrApiSpec = {
    documentId: `AMH-LBR-API-${now.toISOString().slice(0, 10).replace(/-/g, "")}`,
    title: "Longitudinal Beneficiary Records — API & Webhook Integration Specification",
    subtitle: "Developer requirements for connecting external software to Amehnities",
    version: "1.0", generatedAt: now.toISOString(),
    classification: "Confidential — authorised integration partners",
    revision: "", lastChanged: input.lastChanged ?? null,
    moduleName: input.moduleName, projectName: input.projectName,
    baseUrl, webhookOrigin: origin,
    selection: { mode, componentKeys: keys, labels: picked.map((c) => c.label) },
    endpointsForSelection: [
      { purpose: "REST API base URL", method: "—", url: baseUrl },
      { purpose: "Confirm project and connectivity", method: "GET", url: `${baseUrl}/projects` },
      { purpose: "List modules and component keys", method: "GET", url: `${baseUrl}/components` },
      { purpose: "Pull beneficiaries (incremental)", method: "GET", url: `${baseUrl}/beneficiaries?updated_since=` },
      { purpose: "Pull one beneficiary", method: "GET", url: `${baseUrl}/beneficiaries/{case_id}` },
      { purpose: `Pull services — ${scopeLabel}`, method: "GET", url: `${baseUrl}/services${compQ ? `?${compQ}` : ""}` },
      { purpose: "Pull monthly aggregates", method: "GET", url: `${baseUrl}/aggregates?period=YYYY-MM` },
      { purpose: "Pull programme reports / indicators", method: "GET", url: `${baseUrl}/reports` },
      { purpose: "Push beneficiary (create or update by case_id)", method: "POST", url: `${baseUrl}/beneficiaries` },
      { purpose: `Push service — ${scopeLabel}`, method: "POST", url: `${baseUrl}/services` },
      { purpose: "Webhook delivery service (sender)", method: "POST →", url: `${origin}/functions/v1/webhook-dispatch` },
      { purpose: "Your webhook receiver (register in Amehnities)", method: "POST ←", url: "https://<your-system>/amehnities/webhooks" },
    ],
    overview: [
      `Living document: generated live from the current Longitudinal Beneficiary Records setup${input.lastChanged ? ` (last changed ${new Date(input.lastChanged).toUTCString().replace(" GMT", " UTC")})` : ""}. The revision code changes whenever components, services or fields change; GET /components always returns the current live structure.`,
      `This edition covers: ${scopeLabel} (${mode === "all" ? "all components" : mode === "single" ? "single component" : `${picked.length} components`}). Only the fields, services and filters for this selection are included.`,
      "Amehnities keeps one longitudinal record per person, identified by a unique Case ID, with integrated services delivered across programme components.",
      "External systems connect through two channels: a read-only REST API (pull) and signed webhooks (push). Both are scoped to exactly one project per credential.",
      mode === "all" ? "Use component_key to narrow any request to fewer components later." : `Always send component_key=${keys.join(",")} on GET /services and only push services with these component_key values.`,
      "Data is personal health information. Integrators must apply data minimisation, encryption in transit and at rest, and the project's data-sharing agreement.",
    ],
    connectionModes: [
      { mode: "All components", use: "Data warehouses, national HMIS, M&E platforms", how: "Pull /beneficiaries and /services without filtering; subscribe to all events (*)." },
      { mode: "Single component", use: "A specialist system (e.g. an eye-health EMR)", how: "Pull /services and keep rows whose component_key matches; subscribe to service.recorded and filter data.component_key." },
      { mode: "Multiple components", use: "Partner dashboards spanning selected programmes", how: "Keep an allow-list of component_key values and apply it to both API rows and webhook events." },
      { mode: "Aggregates only", use: "Donor or government reporting with no personal data", how: "Issue a key with only aggregates:read and/or reports:read." },
    ],
    auth: {
      header: "Authorization: Bearer amk_<secret>", keyFormat: "amk_ followed by a random secret; shown once at creation, stored only as a SHA-256 hash.",
      rules: [
        "Keys are created by a project administrator under Integrations → API keys & webhooks and are bound to one project.",
        "A key only returns data for its own project; there is no cross-project parameter.",
        "Keep keys server-side. Never embed them in browsers, mobile apps or public repositories.",
        "Revoke and reissue immediately if a key is exposed. Revocation takes effect on the next request.",
        "All traffic is HTTPS (TLS 1.2+). Plain HTTP is rejected.",
      ],
    },
    scopes: [
      { scope: "records:read", grants: "Pull beneficiary records and services (personal data)." },
      { scope: "records:write", grants: "Push beneficiaries (create/update by case_id) and services into the selected components." },
      { scope: "aggregates:read", grants: "Monthly totals: registrations, services by component/name, home visits, referrals." },
      { scope: "reports:read", grants: "Submitted and resolved programme reports with indicator entries." },
      { scope: "*", grants: "All of the above. Use only for fully trusted institutional systems." },
    ],
    componentAccess: [
      "Every service row carries component_key; this is the stable selector for component-level integration and is never renamed.",
      "Aggregates expose services_by_component, so component totals are available without personal data.",
      "Request least privilege: if the partner needs only one component, filter on receipt and discard other rows immediately.",
    ],
    endpoints: [
      { id: "projects", method: "GET", path: "/projects", scope: "any valid key", summary: "Returns the project the key belongs to.", params: [], returns: "{ data: [ { id, name, description, status, start_date, end_date, scope_states, scope_lgas } ] }", example: ex("/projects") },
      { id: "beneficiaries", method: "GET", path: "/beneficiaries", scope: "records:read", summary: "Lists beneficiaries in ascending updated_at order with keyset pagination.", params: [
        { name: "updated_since", in: "query", type: "ISO 8601 timestamp", required: false, description: "Only records changed at or after this time." },
        { name: "cursor", in: "query", type: "string", required: false, description: "next_cursor from the previous page (format updated_at|id)." },
        { name: "limit", in: "query", type: "integer 1–100", required: false, description: "Page size, default 100." },
      ], returns: "{ data: Beneficiary[], next_cursor: string | null }", example: ex("/beneficiaries?updated_since=2026-01-01T00:00:00Z&limit=100") },
      { id: "beneficiary", method: "GET", path: "/beneficiaries/{case_id}", scope: "records:read", summary: "Returns one beneficiary by Case ID.", params: [
        { name: "case_id", in: "path", type: "string ≤64", required: true, description: "URL-encoded Unique Case ID." },
      ], returns: "{ data: Beneficiary }  ·  404 when not found", example: ex("/beneficiaries/CISKULA-2026-000123") },
      { id: "services", method: "GET", path: "/services", scope: "records:read", summary: "Lists services delivered, ascending by created_at, with keyset pagination.", params: [
        { name: "component_key", in: "query", type: "comma list", required: mode !== "all", description: mode === "all" ? "Optional: restrict to one or more component keys." : `Use ${keys.join(",")} for this selection.` },
        { name: "from", in: "query", type: "date", required: false, description: "service_date on or after." },
        { name: "to", in: "query", type: "date", required: false, description: "service_date on or before." },
        { name: "cursor", in: "query", type: "string", required: false, description: "next_cursor from the previous page (created_at|id)." },
        { name: "limit", in: "query", type: "integer 1–100", required: false, description: "Page size, default 100." },
      ], returns: "{ data: Service[], next_cursor: string | null }", example: ex(`/services?${compQ ? compQ + "&" : ""}from=2026-01-01&to=2026-03-31`) },
      { id: "components", method: "GET", path: "/components", scope: "any valid key", summary: "Lists the project's modules (module_id) and their component keys and services.", params: [], returns: "{ data: [ { module_id, module_name, components: [ { key, label, services } ] } ] }", example: ex("/components") },
      { id: "push-beneficiary", method: "POST", path: "/beneficiaries", scope: "records:write", summary: "Creates a beneficiary or updates the existing one with the same case_id. Profile keys are merged; version increases on update.", params: [
        { name: "case_id", in: "body", type: "string ≤64", required: true, description: "Unique Case ID — the idempotency key." },
        { name: "full_name", in: "body", type: "string", required: true, description: "Required when creating." },
        { name: "module_id", in: "body", type: "uuid", required: false, description: "Required only when the project has more than one module." },
        { name: "status / risk_level / state / lga / ward / village / next_follow_up_date", in: "body", type: "see Section 7", required: false, description: "Core fields." },
        { name: "profile", in: "body", type: "object", required: false, description: "Any profile field keys from Section 7.1." },
      ], returns: "201 { data: { id, case_id, version, updated_at }, operation: created }  ·  200 operation: updated", example: post("/beneficiaries", { ...mod, case_id: "EXT-000123", full_name: "Jane Doe", state: "Kano", lga: "Gabasawa", profile: {} }) },
      { id: "push-service", method: "POST", path: "/services", scope: "records:write", summary: `Records a service against an existing beneficiary for ${scopeLabel}.`, params: [
        { name: "case_id", in: "body", type: "string", required: true, description: "Beneficiary Case ID (must exist)." },
        { name: "component_key", in: "body", type: "string", required: true, description: mode === "all" ? "Any component_key in Section 6." : `One of: ${keys.join(", ")}.` },
        { name: "service_name", in: "body", type: "string", required: true, description: "A service listed in Section 6." },
        { name: "service_date", in: "body", type: "YYYY-MM-DD", required: false, description: "Defaults to today." },
        { name: "status / result", in: "body", type: "enum / string", required: false, description: "See Section 7.2." },
        { name: "data", in: "body", type: "object", required: false, description: "Component-specific fields from Section 7.3." },
        { name: "external_id", in: "body", type: "string", required: false, description: "Your record ID; repeats return operation: duplicate instead of a second service." },
      ], returns: "201 { data: { id, beneficiary_id, component_key, created_at }, operation: created }", example: post("/services", { ...mod, case_id: "EXT-000123", component_key: firstComp?.key || "component", service_name: firstComp?.services?.[0] || "Service", service_date: "2026-11-25", status: "completed", external_id: "SRV-9981", data: sampleData }) },
      { id: "aggregates", method: "GET", path: "/aggregates", scope: "aggregates:read", summary: "Monthly totals for the project.", params: [
        { name: "period", in: "query", type: "YYYY-MM", required: false, description: "Month to summarise; defaults to the current month." },
      ], returns: "{ data: { project_id, period, registrations, home_visits_completed, referrals, services_total, services_by_component, services_by_name } }", example: ex("/aggregates?period=2026-10") },
      { id: "reports", method: "GET", path: "/reports", scope: "reports:read", summary: "Latest 100 submitted or resolved programme reports with indicator entries.", params: [], returns: "{ data: [ { id, period_label, report_year, status, notes, created_at, reviewed_at, resolution_note, entries: [ { indicator_code, value, disaggregation, risk, over_target_comment } ] } ] }", example: ex("/reports") },
    ],
    components, coreFields: BENEFICIARY_CORE, profileFields, serviceFields: SERVICE_FIELDS,
    schema: buildLbrSchema({ baseUrl, core: BENEFICIARY_CORE, profile: profileFields, service: SERVICE_FIELDS, components }),
    webhook: {
      headers: [
        { name: "Content-Type", description: "application/json" },
        { name: "X-Amehnities-Event", description: "Event name, e.g. service.recorded" },
        { name: "X-Amehnities-Delivery", description: "Unique delivery UUID — use as the idempotency key" },
        { name: "X-Amehnities-Timestamp", description: "ISO 8601 send time — reject if older than 5 minutes" },
        { name: "X-Amehnities-Signature", description: "sha256=<hex HMAC-SHA256 of the raw body using the endpoint secret>" },
      ],
      envelope: JSON.stringify({ id: "delivery-uuid", event: "service.recorded", project_id: "project-uuid", created_at: "2026-11-25T13:00:00.000Z", data: { "…": "event payload" } }, null, 2),
      verification: [
        "Read the raw request body before parsing JSON.",
        "Compute HMAC-SHA256(raw_body, endpoint_secret) as lowercase hex and compare with the signature header using a constant-time comparison.",
        "Reject the request (HTTP 401) on mismatch; reject stale timestamps to block replays.",
        "Store X-Amehnities-Delivery and ignore repeats — retries reuse the same delivery ID.",
        "Respond with any 2xx within 10 seconds; do heavy processing asynchronously.",
        "Endpoints must be public HTTPS URLs. Private/internal addresses and redirects are rejected.",
      ],
      retries: [
        "Non-2xx responses or timeouts are retried up to 5 attempts in total.",
        "Back-off doubles per attempt (1, 2, 4, 8 minutes, capped at 60) with an hourly safety sweep.",
        "Deliveries are woken immediately on each new event; ordering is not guaranteed — use updated_at to resolve.",
        "Administrators can send a test.ping event from the integrations panel to validate an endpoint.",
      ],
      events: [
        { id: "beneficiary.created", summary: "A beneficiary is registered.", trigger: "Insert into beneficiary records", payload: { case_id: "string", beneficiary_id: "uuid", full_name: "string", status: "enum", state: "string", lga: "string", ward: "string", profile: "object", updated_at: "timestamp" } },
        { id: "beneficiary.updated", summary: "Any change to a beneficiary record.", trigger: "Update of beneficiary records", payload: { case_id: "string", beneficiary_id: "uuid", full_name: "string", status: "enum", state: "string", lga: "string", ward: "string", profile: "object", updated_at: "timestamp" } },
        { id: "service.recorded", summary: "A service is delivered under a component.", trigger: "Insert into services", payload: { beneficiary_id: "uuid", service_id: "uuid", component_key: "string", service_name: "string", service_date: "date", result: "string", status: "enum" } },
        { id: "home_visit.reported", summary: "A home visit is completed.", trigger: "Home visit marked completed", payload: { visit_id: "uuid", beneficiary_id: "uuid", visited_at: "timestamp", status: "string" } },
        { id: "feedback.submitted", summary: "Community feedback (CCFF) is received.", trigger: "Insert into project feedback", payload: { reference: "string", category: "string", severity: "string", state: "string", lga: "string", ward: "string", is_anonymous: "boolean" } },
        { id: "programme_report.submitted", summary: "A programme report is submitted, with full entries.", trigger: "Report submission", payload: { report_id: "uuid", period_label: "string", report_year: "integer", status: "string", entries: "array" } },
        { id: "programme_report.monthly_sync", summary: "Monthly report snapshot on the 1st of each month.", trigger: "Scheduled", payload: { report_id: "uuid", period_label: "string", entries: "array" } },
        { id: "test.ping", summary: "Manual endpoint test.", trigger: "Administrator sends test", payload: { message: "string" } },
      ],
    },
    errors: [
      { status: 200, meaning: "Success", action: "Process data; follow next_cursor until null." },
      { status: 201, meaning: "Created (push)", action: "Store the returned id against your record." },
      { status: 400, meaning: "Invalid parameter or body (cursor, period, case id, status, missing required field)", action: "Fix the request; do not retry unchanged." },
      { status: 401, meaning: "Missing, invalid or revoked API key", action: "Check the Authorization header or request a new key." },
      { status: 403, meaning: "Key lacks the required scope", action: "Ask the project administrator to issue a key with the scope." },
      { status: 404, meaning: "Unknown route or record not found", action: "Check the path and Case ID." },
      { status: 500, meaning: "Server error", action: "Retry with exponential back-off; contact Amehnities if persistent." },
    ],
    checklist: [
      "Sign the project data-sharing agreement and confirm the components in scope.",
      "Receive a project-scoped amk_ key with the minimum scopes required.",
      "Call GET /projects to confirm connectivity and the project identity.",
      "Call GET /components to confirm module_id and component keys for the selection.",
      "Run an initial full sync of /beneficiaries and /services, following next_cursor.",
      "Schedule incremental sync using updated_since (beneficiaries) and from/cursor (services).",
      "Push records with POST /beneficiaries then POST /services, sending external_id so retries never duplicate.",
      "Register a public HTTPS webhook endpoint, store its secret securely, and verify signatures.",
      "Send test.ping, then confirm idempotent handling of duplicate deliveries.",
      "Use case_id as the cross-system person identifier; never create duplicates on your side.",
      "Log access, encrypt stored personal data and delete it at the end of the agreement.",
    ],
    contacts: ["Amehnities Platform — HANDS Nigeria Decision Support Platform", "https://www.amehnities.org"],
  };
  spec.revision = specRevision(spec);
  spec.version = `Live · rev ${spec.revision}`;
  return spec;
}

/** Stable fingerprint of the document content (ignores issue time). */
export function specRevision(s: LbrApiSpec): string {
  const body = JSON.stringify({ ...s, documentId: "", generatedAt: "", revision: "", version: "", lastChanged: "" });
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0").toUpperCase();
}
