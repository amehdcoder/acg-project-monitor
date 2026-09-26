# Architecture rules

- Route all DHIS2 LGA reporting through the existing `health-exchange` function so credentials, authorization, scoped aggregation, and audit logging remain server-side.
- Revoke browser EXECUTE on SECURITY DEFINER trigger/internal functions; keep it only for RLS helpers and app-called RPCs — why: shrinks the callable surface without breaking policies.
- Self-hosting ships the static build via Dockerfile + nginx.conf while the backend stays on Lovable Cloud — why: removes hosting badge without migrating data.
- Route every in-app Street View through the shared Google panorama viewer, with official imagery preferred and street-level fallback — why: keeps map drill-down quality and failure handling consistent.
- Data Cleaner has no hand-written validation rules; all flags come from the on-device autoencoder + transformer brain worker (dataCleanerBrain.worker.ts) with IndexedDB memory — why: "normal" is learned cumulatively from cleaned history.
- Record quality brain trains in the browser worker and, once past 5,000 steps, in the `brain-train` edge function every 30 min (pg_cron, lease via `claim_brain_for_training`); checkpoint in `brain_models` (most-trained wins), flags/resolutions in `brain_flags`; `_shared/brain/*` mirrors `src/lib/dataCleaner/neural/*` — why: cumulative shared learning even with nobody online, within edge CPU limits.
