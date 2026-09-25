# Architecture rules

- Route all DHIS2 LGA reporting through the existing `health-exchange` function so credentials, authorization, scoped aggregation, and audit logging remain server-side.
- Revoke browser EXECUTE on SECURITY DEFINER trigger/internal functions; keep it only for RLS helpers and app-called RPCs — why: shrinks the callable surface without breaking policies.
- Self-hosting ships the static build via Dockerfile + nginx.conf while the backend stays on Lovable Cloud — why: removes hosting badge without migrating data.
- Route every in-app Street View through the shared Google panorama viewer, with official imagery preferred and street-level fallback — why: keeps map drill-down quality and failure handling consistent.
