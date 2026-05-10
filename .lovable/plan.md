# Coverage Evaluation 3D — Polish, Roles, Microplan Link, Operations Dashboard

## 1. Database (one migration)

**New table `ces_role_assignments`** (per-user, per-project)
- `user_id`, `project_id`, `role` (enum: `community_locator`, `household_surveyor`, `peer_validator`)
- Unique `(user_id, project_id, role)`. Granted by Super Admin / Owner.
- RLS: any authenticated user can SELECT their own row; only owners/super_admins INSERT/UPDATE/DELETE.

**New table `ces_fenced_communities`** (canonical list created when locator finishes Step 1)
- `project_id`, `state`, `lga`, `ward`, `flhf_name`, `community_name`, `settlement_name`, `center_lat`, `center_lng`, `perimeter_coords (jsonb)`, `area_m2`, `session_id` (FK ces_capture_sessions OR ces_surveys), `created_by`, `created_at`.
- RLS: SELECT → any authenticated; INSERT → only users with `community_locator` role for the project (or admin); UPDATE/DELETE → creator or admin.
- Index on `(project_id, state, lga, ward)` and on `created_at`.

**New table `ces_peer_validations`** (replaces ad-hoc QC for peer review)
- `survey_id` (FK ces_surveys), `validator_id`, `mode` (`revisit` | `desk_review`), `verdict` (`confirmed` | `disputed` | `needs_resample`), `households_revisited (int)`, `households_agreed (int)`, `agreement_pct (numeric)`, `notes`, `created_at`.
- RLS: SELECT → admin or survey creator or validator; INSERT → users with `peer_validator` role on project who are NOT the surveyor or locator on that survey; UPDATE/DELETE → validator or admin.

**Helper SECURITY DEFINER functions**
- `has_ces_role(_user_id uuid, _project_id uuid, _role text) returns boolean`
- `can_locate_community(_user_id uuid, _project_id uuid)` — true if has `community_locator` role OR is admin.
- `can_peer_validate_survey(_user_id uuid, _survey_id uuid)` — true if has `peer_validator` role on that project AND user is neither the survey's creator nor a locator who fenced its community.

## 2. Admin panel — CES Access Manager

New component `src/components/CoverageEvaluation/CESAccessManager.tsx` shown only to owner/super_admin in the Coverage Evaluation page header (gear icon → dialog).

- Lists all approved users with their `designation` from profiles (read-only hint).
- For each user, three checkboxes per project: Locator / Surveyor / Validator.
- Bulk action: "Auto-suggest from designation" (sets locator for Supervisor-like titles, surveyor for Enumerator/CDD, validator for M&E/Officer — purely a hint, admin always confirms).
- Saves to `ces_role_assignments`.

New hook `src/hooks/useCESRoles.ts` — returns `{ canLocate, canSurvey, canValidate, loading }` for the active project + current user, plus admin bypass.

## 3. CES Survey Workflow gating (`CESSurveyWorkflow.tsx`)

- Wrap **Step 1 (Locate & Fence)** controls (start GPS, record perimeter, save) in a `canLocate` guard. Non-locators see a friendly card: "Step 1 is restricted to Community Locators. You can begin from Step 2 once a community has been fenced." + a dropdown of already-fenced communities to load.
- Wrap **Steps 2–3 (Sample, Visit households)** in a `canSurvey || canLocate` guard for the surveyor flow. (Locators are allowed to also survey, since they were on-site.)
- On successful Step 1 save (community + perimeter committed), also INSERT into `ces_fenced_communities` so it becomes immediately discoverable from microplanning.

## 4. Microplan ↔ CES bridge

Per the answer, the locator-saved community list must be **looked up from the Microplan New Entry page once microplan data is saved**.

In `src/components/Microplanning/MicroplanEntryForm.tsx`:
- After the user fills/saves a New Microplan Entry, run a lookup against `ces_fenced_communities` filtered by `(project_id, state, lga, ward)` matching the just-saved entry.
- If matches exist, open a "Linked Fenced Communities" panel listing each community with name, settlement, center coords, fenced-by user and date, plus a "Use this community" button that fills `community_name`/`settlement_name`/`community_latitude`/`community_longitude` on the entry form and a "View on map" link.
- Also add a passive autocomplete on the `community_name` field that suggests matching fenced communities while typing once State/LGA/Ward are chosen, so the link works both directions.

## 5. Peer validation — dual mode (`CESQCWorkflow.tsx`)

Existing QC workflow refactored into peer validation with two modes:
- **Revisit mode**: validator selects ≥10% of the surveyor's sampled households, captures GPS at each, marks Agree/Disagree on coverage status; agreement % auto-computed.
- **Desk-review mode**: validator scrolls each household submission + photo, marks Confirmed/Disputed/Needs resample.
- Mode toggle at top of dialog. On submit, write to `ces_peer_validations` with `mode`, `verdict`, agreement metrics, notes.
- Validators are blocked (UI + RLS) from validating surveys they were the surveyor or locator for.

## 6. Operations dashboard CES aggregation (`PowerBIDashboard.tsx`)

Field Management tab remains default (already is — `subtab=management` default in URL). Operations tab gets a new **CES section** above existing widgets:

- KPI strip: # surveys, # households visited, weighted coverage %, 95% CI, # peer-validated, validator agreement rate.
- Choropleth-style segment coverage map (re-uses `Village3DMap`/leaflet) for the selected State/LGA/Ward.
- Discrepancy widget: CES therapeutic coverage vs Microplan target-population coverage (per LGA) — already partially present in `CoverageDiscrepancyWidget`; ensure it consumes the new tables.
- Validator agreement rate widget per surveyor.
- Drill-down: click any survey row → side-sheet showing households, photos, peer validation history, and any resample requests; clicking a resample shows reason + status.
- Realtime: subscribe to `ces_surveys`, `ces_household_visits`, `ces_peer_validations`, `ces_segment_resamples` — refetch on changes so the Operations tab stays live without a manual refresh.

## 7. CES Coverage Evaluation page polish

- Standardise tab order: Survey → Validation → 3D Map → Gap Intelligence → Audit → Access (admins only).
- Add header chip showing the user's CES roles for the active project ("Locator", "Surveyor", "Validator").
- Disable "New 3D Capture" button + Step 1 controls when `!canLocate`, with tooltip explaining why.
- Replace silent failures with toasts; add empty-state copy aligned to WHO CES guidance.
- Add an info banner linking to WHO CES SOP language ("≥30 households per cluster, ≥30 clusters, design-based weighting") on Step 2 to guide non-experts.
- Mobile responsive cleanups (44px touch targets, sticky step-indicator on small screens).

## 8. Files to be touched

- New: `supabase/migrations/<ts>_ces_roles_and_fenced_communities.sql`
- New: `src/hooks/useCESRoles.ts`
- New: `src/components/CoverageEvaluation/CESAccessManager.tsx`
- New: `src/components/Microplanning/LinkedFencedCommunitiesPanel.tsx`
- Edit: `src/components/CoverageEvaluation/CoverageEvaluationView.tsx` (tabs, role chip, Access Manager entry, gating)
- Edit: `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` (Step 1/2/3 gating + write to `ces_fenced_communities` on Step 1 commit)
- Edit: `src/components/CoverageEvaluation/CESQCWorkflow.tsx` (mode toggle + new validations table)
- Edit: `src/components/Microplanning/MicroplanEntryForm.tsx` (post-save lookup + autocomplete)
- Edit: `src/components/Dashboard/PowerBIDashboard.tsx` (CES KPI + drill-down + realtime)
- Edit: `src/components/SupervisorDashboard/CoverageDiscrepancyWidget.tsx` (consume new tables)

## 9. Out of scope

- No changes to authentication or signup flow (designation captured at signup is read as-is).
- No changes to other tabs of the Dashboard or unrelated modules.
- Supabase types regenerate automatically after migration approval; no manual `types.ts` edits.

## 10. Order of execution

1. Run migration (one approval).
2. Build hook + Access Manager.
3. Gate CES workflow + write fenced communities on Step 1 commit.
4. Microplan bridge UI.
5. Refactor QC into dual-mode peer validation.
6. Extend Operations dashboard with CES section + drill-down + realtime.
7. CES page polish + verification (build check).
