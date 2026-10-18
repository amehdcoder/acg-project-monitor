# Architecture rules

- Keep major longitudinal workspace tabs separate from grouped record navigation, with Programme Report using the same project-scoped access gate — why: reporting is directly reachable without duplicating Overview entries or bypassing permissions.

- Dispatch CCFF paths to a standalone form-only shell before mounting workspace providers; use anonymous public-function requests and published QR origins — why: community visitors cannot enter records through form navigation, shared overlays, error states or editor-only links.

- Filter the beneficiary workflow tour through the workspace's visible destinations, effective permissions and configured component list — why: guidance stays aligned with actual access and project forms without introducing a separate permission system.

- Render Hand Cards on a protected standalone route using the same live record-backed document as exports; rely on record RLS for access — why: consistent viewing/downloads, no public beneficiary data.

- Serialize hand-card camera start/stop operations and cancel stale sessions; expose torch only when the running track supports it — why: no leaked cameras.
- Hand-card exports capture the same naturally flowing front/back layouts, with independent page aspect ratios — why: long beneficiary details must not collide with fixed footers or become cropped in downloads.

- Route all DHIS2 reporting/dashboard imports through `health-exchange`; maps use bundled Nigeria LGA/State/National boundaries — why: secrets server-side, exact geography.
- Revoke browser EXECUTE on SECURITY DEFINER trigger/internal functions; keep it only for RLS helpers and app-called RPCs — why: smaller attack surface.
- Self-hosting: Dockerfile + nginx.conf, backend on Lovable Cloud — why: no badge.
- Records reads go through `offlineReadCache.cachedRead` (IndexedDB); queue flush is Web-Lock single-tab, parent-first, backoff, jittered reconnect — why: offline use, no reconnect stampedes.
- Route every in-app Street View through the shared Google panorama viewer, with official imagery preferred and street-level fallback — why: consistent quality/fallbacks.
- Data Cleaner has no hand-written validation rules; all flags come from the on-device autoencoder + transformer brain worker (dataCleanerBrain.worker.ts) with IndexedDB memory — why: "normal" is learned cumulatively from cleaned history.
- Record quality brain trains in the browser worker and, once past 5,000 steps, in the `brain-train` edge function every 30 min (pg_cron, lease via `claim_brain_for_training`); checkpoint in `brain_models` (most-trained wins), flags/resolutions in `brain_flags`; `_shared/brain/*` mirrors `src/lib/dataCleaner/neural/*` — why: cumulative shared learning even with nobody online, within edge CPU limits.
- Microplanning DHIS2 push/pull runs as `mp_*` actions in `health-exchange`, with KPI matching in `_shared/microplanExchange.ts`, mappings stored as `mp:<kpi>` rows and pulled rows upserted by `microplan_entries.external_ref` — why: one server-side exchange path, idempotent re-pulls.
- Geo Microplanning workspace locks live in `microplan_workspace_locks` (user_id NULL = whole project); Owner/Co-owner/Super Admin manage and are never locked — why: mirrors the records-only shell without a side menu.
- Health-worker/programme-staff record scope is enforced in RLS via `user_programme_areas`/`beneficiary_in_user_scope`/`service_in_user_scope` (area regexes mirror `projectTeam.ts` AREA_PATTERNS); each Cases DHIS2 server may set `programme_area` so its pushes contain only that area's service totals — why: UI filters alone don't protect data, and multi-server pushes must not duplicate programmes.
- Typed (custom) component services live per project in `project_custom_services` (realtime), with device storage only as an offline fallback that is published on next load — why: every project user sees the same service list.
- Graduation pathway gate (mapped → verified → selected/not selected) is stored in beneficiary `profile.graduation`; delivery-stage progress is derived from recorded livelihood services matching the priority service names — why: tracking stays tied to real service records without a second register.
- WhatsApp follow-up reminders run in `send-whatsapp-reminders` (daily pg_cron 07:00 UTC); per-project Meta credentials live in server-only `whatsapp_settings`, dedup flags in `followup_reminders` keyed by beneficiary + `next_follow_up_date`, outcomes in `whatsapp_notification_log` — why: token never reaches the browser and each reminder stage sends once.
- SMS follow-up reminders run in `send-sms-reminders` (daily pg_cron 07:05 UTC) through an Android phone running SMS Gateway for Android (sms-gate.app, Basic auth); credentials in server-only `sms_settings`, dedup via `followup_reminders.sms_*_sent`, outcomes in `sms_notification_log` — why: free sending from a SIM bundle, separate from WhatsApp dedup.
- Programme Report logframe is per-project JSON in `programme_logframes`; `logframeExcel.ts` round-trips framework + period values — why: fully editable, spreadsheet-replaceable reporting.
