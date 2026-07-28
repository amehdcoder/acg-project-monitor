# Microplanning Wizard Redesign + Real-Time Kobo Pipeline

Two connected deliverables: (1) a modern, step-by-step wizard shell for the Geo-enabled Microplanning entry form, and (2) a real-time Kobo → Supabase → Dashboard sync path. Existing form logic, validation, and offline saving are preserved — only the shell, controls, and realtime plumbing change.

## 1. Wizard shell (new component: `MicroplanWizardForm`)

Replaces the monolithic scrolling layout in `MicroplanEntryForm.tsx` with a stepper. Reuses all current field logic, validation, and submit path — only the container changes.

**Sections** (mapped from the existing form):
1. Campaign & Project
2. Administrative Hierarchy (State → LGA → Ward)
3. Frontline Health Facility (FLHF)
4. Community
5. Settlement
6. GPS & Coordinates
7. Population Estimates
8. PWD Breakdown
9. Medicines / Allocations
10. Review & Submit

**Design tokens** (added to `index.css` as semantic tokens — no hardcoded colors in components):
- Surface: `bg-slate-50/50`, cards `rounded-2xl bg-white shadow-sm`
- Primary `#2563EB`, ink `#0F172A`
- State chips: emerald (synced), amber (draft), rose (error)
- Typography: Inter, generous line-height, strong h/label contrast

**Progress header**: sticky top bar with "Section X of 10 · <name>" and an animated `<Progress>` bar (shadcn) reflecting completed-required fields per step.

**Quick Navigator drawer**: shadcn `Sheet` from the left listing all 10 sections with per-section badges — Complete / Incomplete / Missing Required — computed from current form values + validation results. Click to jump.

**Sticky action bar** (bottom): Previous · Save Draft (with "Saved 2s ago") · Next / Submit. Submit shows loading + success micro-animation. Wired to existing `useSubmitLock` and offline queue.

## 2. Enhanced field controls (in `src/components/Microplanning/fields/`)

- `CascadingGeoSelect`: reuse GRID3 cascade, add instant search, "GRID3" badge when option comes from GRID3 dataset, inline "Other (specify)" text input when selected.
- `PopulationStepper`: numeric input flanked by `-` / `+` touch targets (52px per mobile-ergonomics memory), live auto-sum of children 0–4 + 5–14 + adults 15+ displayed in a subtotal chip.
- `GpsCaptureWidget`: replaces raw GPS field. Shows lat/lng, accuracy meter (`±Xm`), Leaflet mini-map preview, and a toggle "GRID3 pre-loaded ↔ Manual override". Uses existing `useGeolocation` + `gpsWarmer`.

## 3. Real-time Kobo pipeline

Existing `kobo-microplan-webhook` edge function already ingests + upserts on `idempotency_key`. Extend it and add realtime + UI:

**a. Webhook function updates** (`supabase/functions/kobo-microplan-webhook/index.ts`)
- Add `project_id` to the conflict target for the requested `(kobo_submission_id, project_id)` semantics: change upsert to `onConflict: "idempotency_key,project_id"` after adding a matching unique index.
- Emit a `kobo_sync_events` row (`{ status, project_id, kobo_uuid, entry_id, at }`) that the UI subscribes to.

**b. Migration**
- Add composite unique index `microplan_entries (idempotency_key, project_id)`.
- Create `public.kobo_sync_events` (project_id, kobo_uuid, entry_id, status, message, created_at), GRANTs, RLS: project admins + super admins read, service_role write.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.microplan_entries, public.kobo_sync_events`.

**c. Realtime in UI**
- `useRealtimeMicroplanEntries(projectId)` hook: TanStack Query + `postgres_changes` on `microplan_entries` filtered by `project_id`; invalidates dashboard queries (`entries`, KPI counters, geotagged count).
- `KoboSyncStatusChip`: header chip subscribing to `kobo_sync_events`, showing "Synced just now" / "Sync pending" / "Validation failed" with pulse animation.
- `KoboSyncAuditDrawer`: slide-over listing the last 50 events, filterable by status.

**d. Offline readiness**
- Reuse existing offline queue. Draft badge in header shows "Saved locally — will sync when online" driven by `navigator.onLine` + queue length.

## 4. Wiring

- `MicroplanningView.tsx`: swap `MicroplanEntryForm` for `MicroplanWizardForm` behind a feature flag `wizard=true` (default on) so we can fall back if needed. Mount `KoboSyncStatusChip` in the tab header and the audit drawer trigger next to it.
- Dashboards (`MdaAdaptiveDashboard`, KPI tiles): consume the same TanStack query keys the realtime hook invalidates — no direct changes needed beyond hook adoption.

## Technical notes

- Wizard state lives in the existing form store; per-step validity computed via existing `formFieldValidation` helpers.
- Save Draft continues to write through `savedForms` / offline queue; timestamp comes from the last successful write.
- Realtime channels torn down on unmount (per cloud-realtime rules) to avoid subscription leaks.
- All new colors/shadows go through `index.css` tokens; no `bg-white`/`text-black` literals in components except via shadcn variants.
- No changes to auth, RLS shape beyond the new table, or Kobo secret rotation flow.

## Out of scope

- Rewriting non-microplanning forms.
- Changing Kobo mapping/versioning UI (already shipped).
- Server-side XLSForm regeneration.
