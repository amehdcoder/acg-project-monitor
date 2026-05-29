## Goal

Grow the existing case management feature into a full CommCare-style Case Management System. Standard (non-case) forms stay exactly as they are today — every change here is gated behind "case management enabled".

## What already exists (reuse, don't rebuild)

- **DB:** `cases` (id, case_type_id, project_id, owner_id, name, properties jsonb, status, opened/closed/last_modified fields, next_follow_up_date), `case_types` (name, label, description, properties, follow_up_schedule), `case_activities` (event log: case_id, activity_type, performed_by, changes, notes, form_submission_id).
- **UI:** `CasesView` (cases/map/analytics tabs, KPI cards, search, transfer/reassign, bulk close/reopen, follow-up creator), `CaseDetails` (timeline/properties/history tabs), `CaseList`, `CaseLocationMap`, `CaseAgingAnalytics`, `FollowUpScheduleEditor`, `FollowUpFormCreator`.
- **Form Builder:** `CaseManagementEditor` with actions `none | register | update | close`, case-type picker, property mapping, close condition.
- **Filler:** `FormFiller` + `useCaseManagement` hook create/update/close cases on submit; `CaseSelector` to pick an existing case.

## Gap analysis (what to build)

Missing tables: `case_types` icon/color/status-workflow columns, `case_referrals`, `case_notes`, `case_relationships` (parent–child), `case_tasks` (follow-up scheduling), `case_attachments`, `case_permissions`/sharing, `case_status_history`. Missing UI: Case Types admin, referral engine, notes panel, parent–child linking, task queue (upcoming/overdue), sharing/visibility, safeguarding stages, no-code workflow rules, expanded reporting, sequential human-readable Case IDs.

## Phased delivery

### Phase 1 — Data model + Case Types admin (foundation)
- Migration: add `case_id_seq`/`reference_code` (e.g. `CASE-2026-00001`) to `cases`; add `icon`, `color`, `status_workflow jsonb`, `sharing_default` to `case_types`; new tables `case_referrals`, `case_notes`, `case_relationships`, `case_tasks`, `case_attachments`, `case_status_history`, `case_permissions`. All with GRANTs + RLS (owner + admin + shared-via-permissions visibility, security-definer helper `can_access_case`).
- New **Case Types admin** screen (within CasesView as a "Configure" tab, admin-only): create/edit unlimited case types with name, description, icon, color, status workflow.

### Phase 2 — Form behaviors expansion
- Extend `CaseManagementAction` to `none | register | update | close | referral | case_note | follow_up`. Update `CaseManagementEditor` UI and `useCaseManagement` so each behavior writes the right record (referral → `case_referrals`, note → `case_notes`, follow_up → `case_activities` + `case_tasks`). Keep `register/update/close` working as-is.

### Phase 3 — Case Detail enrichment
- Add tabs to `CaseDetails`: Referrals, Notes, Relationships (parent/child), Tasks, Attachments, Forms Submitted. Timeline merges all event sources. Closure dialog with reasons (Completed/Recovered/Transferred/Withdrawn/Deceased/Duplicate/Resolved) writing `case_status_history`; closed cases render read-only.

### Phase 4 — Referral engine + Task scheduling
- Referral create dialog (type, destination, reason, priority, expected date) + status flow (Pending→Accepted→Completed/Rejected/Cancelled). Task queue view in CasesView: Upcoming / Overdue / Completed, generated from follow-up schedules and manual tasks.

### Phase 5 — List filters, ownership/sharing, reporting
- Case List filters: case type, status, owner, ward/LGA/state, date opened, risk level. Sharing levels (Private/Team/Facility/District/National) enforced via `case_permissions` + RLS. Reporting tab: active/closed/referrals/by status/location/owner, plus KPIs (avg resolution time, referral completion rate, follow-up compliance, open vs closed).

### Phase 6 — Safeguarding + Workflow rules (no-code)
- Safeguarding case type with stages (Reported→Screened→Investigated→Actioned→Resolved→Closed) and role-based visibility. Simple no-code rule builder: "If property = value → create task / assign / notify", stored as JSON on case type and evaluated on submit. (Full drag-and-drop designer deferred; start with a condition→action list editor.)

### Offline
Reuse the existing offline forms/sync queue (`useOfflineForms`); case create/update/note/referral actions queue and sync like current submissions. Conflict handling reuses `optimisticUpdate`/version pattern where applicable.

## Technical notes

- Event sourcing: continue appending to `case_activities` (+ new `case_status_history`) — never overwrite history.
- All new public tables get GRANTs + RLS in the same migration; access gated by a `can_access_case(_user_id, _case_id)` security-definer function covering owner, admin/owner, and `case_permissions` sharing rows.
- Sequential IDs via a Postgres sequence + trigger (mirrors existing `set_office_form_reference` pattern).
- No changes to standard (non-case) form behavior anywhere.

## Suggested approach

I recommend we start with **Phase 1 (data model + Case Types admin)** since everything else depends on it, then proceed phase-by-phase so you can review each. Phases 1–3 deliver the core CommCare experience; 4–6 add the advanced engines.

Confirm and I'll begin with Phase 1, or tell me which phases to prioritize.