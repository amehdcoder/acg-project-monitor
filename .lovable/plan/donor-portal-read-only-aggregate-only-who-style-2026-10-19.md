# Donor Portal — read-only, aggregate-only, WHO-style

## What donors get
A dedicated, beautiful portal at `/donor` where invited donors see, per project they are granted:
- **Programme Report** — submitted reports with indicator values, disaggregations, risks and cumulative history (read-only).
- **Logframe** — the project's objectives, result areas, indicators and targets, presented as a clean WHO-style results framework.
- **Beneficiary insights — aggregates only** — KPI cards, trend charts, Nigeria choropleth map (state/LGA totals), disaggregation breakdowns (sex, age bands, disability, programme area). No names, no Case IDs, no individual records, no record-opening anywhere.
- **Field activity feed** — recent home visits reported, services recorded, community feedback summaries (counts and themes, not identities).

## Authorization model (explicit, project-scoped)
- New table `donor_viewers` (project_id, user_id, granted_by, label/organization, active). Donors are first added as normal users, then granted to a project by Owner/Co-owner/Super Admin or a project admin.
- Donors are **not** added to `user_project_assignments` — that would unlock individual beneficiary rows under existing RLS.
- RLS: donors get SELECT policies on `programme_reports`, `programme_report_entries`, `programme_logframes` scoped to their granted projects; beneficiary-derived numbers come only through a SECURITY DEFINER RPC `donor_project_aggregates(project_id)` that computes grouped counts server-side and returns no row-level data. Field feed via a similar RPC returning non-identifying activity summaries.
- Admin management UI ("Donor access" panel) in the project team area to add/remove donors and set their organization label.

## Portal experience (standalone shell)
- New early dispatch in `App.tsx` (same seam as the CCFF public route): `/donor` renders a minimal `DonorPortalRoute` with its own auth check — signed-out donors get a calm sign-in screen; signed-in users without a grant see a graceful "no access yet" screen. No workspace providers, side menus, registration or editing affordances.
- Sections: Overview (KPI hero + map + trends), Programme Report, Logframe, Field Activity. Elegant top navigation, project switcher when a donor has multiple projects.

## Design — WHO Institutional
- Palette: WHO blue `#0093D5`, deep navy `#0B2E4F` / `#1B4F8A`, ice background `#F4F9FC`.
- Typography: Libre Baskerville headings, IBM Plex Sans body (added to index.css font imports).
- Feel: editorial report aesthetic — generous whitespace, thin rules, serif numerals for KPIs, soft glass stat cards, choropleth in blue scale, subtle reveal animations. All colors as semantic tokens in index.css/tailwind.config; no hardcoded color utilities.

## Technical notes
- Migration: `donor_viewers` table (+ GRANTs, RLS, policies), donor SELECT policies on the three report tables, `is_donor_viewer(project_id)` helper, `donor_project_aggregates` and `donor_field_activity` SECURITY DEFINER RPCs (EXECUTE granted to authenticated, internally verifying the grant).
- New files under `src/components/DonorPortal/`; reuse `NigeriaChoropleth` and Recharts with aggregate-only props.
- Tests: vitest for aggregation/shape helpers; RLS verified by querying as a donor-granted user.
- AGENTS.md: one rule — donor portal is aggregate-only via explicit `donor_viewers` grants and server-side RPCs; never route donors through project assignment.
