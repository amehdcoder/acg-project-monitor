# Amehnities API & Webhooks (donor/system integration)

## Goal
Give every project two integration doors: (1) **outbound webhooks** that push signed events to any external system (donor dashboards, DHIS2-adjacent tools, MEL platforms), and (2) a **REST API** that lets external systems pull Longitudinal Beneficiary Records data securely.

## 1. Database (one migration)
- `api_keys` — per-project keys: name, key hash (SHA-256, raw key shown once at creation), prefix, scopes (`records:read`, `records:write`, `reports:read`, `aggregates:read`), active flag, last_used_at, created_by. RLS: project Owner/Co-owner/Super Admin manage.
- `webhook_endpoints` — per-project: url, description, signing secret (server-only), subscribed events[], active, created_by. Same admin RLS.
- `webhook_deliveries` — endpoint_id, event, payload hash, status (pending/success/failed), http_status, attempts, next_retry_at, response snippet. Admin read.
- `webhook_events` queue table — event type, project_id, payload JSONB, processed flag; populated by SECURITY DEFINER triggers (browser EXECUTE revoked).
- GRANTs per public-schema-grants; service_role full, authenticated scoped.

## 2. Edge functions
- `webhook-dispatch` — pg_cron every minute: picks pending `webhook_events`, finds matching active endpoints, POSTs JSON with headers `X-Amehnities-Event`, `X-Amehnities-Delivery`, `X-Amehnities-Signature` (HMAC-SHA256 of body with endpoint secret), `X-Amehnities-Timestamp`. Retries with backoff (5 attempts), logs to `webhook_deliveries`.
- `external-api` — REST API authenticated by `Authorization: Bearer amk_...` key:
  - `GET /external-api/v1/projects` — projects the key can see
  - `GET /external-api/v1/beneficiaries?project_id=&updated_since=&cursor=` — paginated records (keyset, 100/page), WG-SS, graduation, services summary
  - `GET /external-api/v1/beneficiaries/{case_id}`
  - `GET /external-api/v1/aggregates?project_id=&period=YYYY-MM` — the same national-indicator monthly aggregates used by DHIS2 push (donor-ready totals)
  - `GET /external-api/v1/services?project_id=&from=&to=`
  - `GET /external-api/v1/reports?project_id=` — programme report entries
  - Key validated server-side against hash, scope checked per route, `last_used_at` updated, rate-limited (sliding window per key). No key, no data; keys never expose other projects.

## 3. Events emitted (triggers)
- `beneficiary.created`, `beneficiary.updated`, `beneficiary.merged`
- `service.recorded`, `followup.completed`, `home_visit.reported`
- `feedback.submitted` (CCFF), `programme_report.submitted`, `graduation.stage_changed`

## 4. Admin UI — "API & Webhooks" panel (Integrations area)
- Create/revoke API keys (raw key shown once, copy button), scope checkboxes
- Add/test/pause webhook endpoints; "Send test event" button; delivery log with status, latency, response, retry now
- Event catalogue documentation + sample payloads + cURL examples in-app
- Only Owner/Co-owner/Super Admin see the panel

## 5. Docs & tests
- In-app integration guide (payload shapes, signature verification snippet in JS/Python/PHP)
- Tests: key hashing/scope enforcement, signature generation, retry backoff, trigger event payloads
- AGENTS.md rule: external access only via hashed keys + HMAC-signed webhooks; secrets server-side.

## Out of scope (confirm if wanted)
- Inbound write API (external systems creating records) — `records:write` scope reserved but POST endpoints deferred to a follow-up to keep this safe.
