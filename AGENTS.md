# Architecture rules

- Render Hand Cards on a protected standalone route using the same live record-backed document as exports; rely on record RLS for access — why: field viewing and downloads remain consistent without exposing beneficiary data publicly.

- Serialize hand-card camera start/stop operations and cancel stale sessions; expose torch only when the running track supports it — why: prevents leaked cameras and false device-ready states.
- Hand-card exports capture the same naturally flowing front/back layouts, with independent page aspect ratios — why: long beneficiary details must not collide with fixed footers or become cropped in downloads.

- Route all DHIS2 reporting/dashboard imports through `health-exchange`; maps use bundled Nigeria LGA/State/National boundaries — why: credentials stay server-side and geography exact.
- Revoke browser EXECUTE on SECURITY DEFINER trigger/internal functions; keep it only for RLS helpers and app-called RPCs — why: shrinks the callable surface without breaking policies.
- Self-hosting ships the static build via Dockerfile + nginx.conf while the backend stays on Lovable Cloud — why: removes hosting badge without migrating data.
- Route every in-app Street View through the shared Google panorama viewer, with official imagery preferred and street-level fallback — why: keeps map drill-down quality and failure handling consistent.
- Data Cleaner has no hand-written validation rules; all flags come from the on-device autoencoder + transformer brain worker (dataCleanerBrain.worker.ts) with IndexedDB memory — why: "normal" is learned cumulatively from cleaned history.
- Record quality brain trains in the browser worker and, once past 5,000 steps, in the `brain-train` edge function every 30 min (pg_cron, lease via `claim_brain_for_training`); checkpoint in `brain_models` (most-trained wins), flags/resolutions in `brain_flags`; `_shared/brain/*` mirrors `src/lib/dataCleaner/neural/*` — why: cumulative shared learning even with nobody online, within edge CPU limits.
- Microplanning DHIS2 push/pull runs as `mp_*` actions in `health-exchange`, with KPI matching in `_shared/microplanExchange.ts`, mappings stored as `mp:<kpi>` rows and pulled rows upserted by `microplan_entries.external_ref` — why: one server-side exchange path, idempotent re-pulls.
- Geo Microplanning workspace locks live in `microplan_workspace_locks` (user_id NULL = whole project); Owner/Co-owner/Super Admin manage and are never locked — why: mirrors the records-only shell without a side menu.
