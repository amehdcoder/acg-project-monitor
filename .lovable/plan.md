# Integrated MDA Supervisory Dashboard — Enhancement Plan

This is a large request. I've grouped the 10 items into 4 phases that can be shipped and verified independently. Each phase is self-contained so the dashboard never ends up half-broken.

## Phase 1 — Owner Data Management (item 1)
A new **Owner Data Management** panel inside the dashboard (gated to Owner/Super Admin).

- Beautiful drawer/dialog with two modes:
  - **Delete submissions** — clear simulated/test data to "go live" for real field data. Supports: delete all, or delete within a defined date range, with a confirmation step + count preview.
  - **Restore submissions** — soft-delete model so deleted rows can be restored (all, or for a defined period). Implemented via a new `mda_submission_archive` table (or a `deleted_at` soft-delete column + restore RPC) so nothing is permanently lost unless explicitly purged.
- Backend: new RPCs `owner_soft_delete_mda_submissions(period)`, `owner_restore_mda_submissions(period)` with Owner-only authorization (reuse existing owner checks). RLS + GRANTs included.

## Phase 2 — KPI Excel Exports with provenance highlighting (item 2)
- Make each of the 6 KPI cards (Communities Supervised, MDA Completed, Sufficient Medicine, Follow-up Coverage, Adverse Cases Managed, Red-flag Sites) clickable to **download a formatted `.xlsx`**.
- One row per contributing submission; one column per question (resolved by label via `MdaQuestionIndex`).
- **Highlight** the exact column/cell that drove the KPI (e.g. "Status of MDA"=Completed cells highlighted green; "Sufficient medicine"=Yes; SAE=Yes etc.), plus a header note stating the formula. Generated with a library producing real styled xlsx (exceljs).
- Accuracy guaranteed by reusing the same determinant resolution logic already in `kpis.ts` (refactor the determinant selectors into a shared module so export and KPI use one source of truth).

## Phase 3 — CES Geography Prefill bridge (item 3)
- When Household Coverage Survey module → community selected → opening Coverage Evaluation 3D, map the checklist geography to CES Step 1 fields:
  - State→State, LGA→LGA, Ward→Ward, FLHF→FLHF Name, Community→Community, Settlement→Settlement.
- Harden the existing sessionStorage prefill bridge to carry all six fields with correct keys, lock them, include them in the CES submission payload, and tag the CES submission with the source checklist community so Community Checklist + all follow-up modules link to it and reflect on the dashboard.

## Phase 4 — Map, performance, UI & audit (items 4,5,6,7,8,9,10)
On `MdaSupervisoryChecklistDashboard.tsx` and `HouseholdCoverageSurveyMap.tsx`:

- **(5)** Add a polished, responsive **Refresh** button (spinner state, re-fetches data).
- **(7)** **Clustered/unclustered toggle** for household markers.
- **(8)** Click an outcome icon or visit-list row → pan/zoom to marker, switch basemap to **Satellite**, update shareable URL viewport.
- **(9)** **Export filtered household visits CSV** (outcome, LGA, GPS).
- **(10)** Memoize state/LGA boundary layers; lazy/virtualized marker rendering for large datasets.
- **(6)** UI/color revamp using semantic design tokens for a sharper, professional look.
- **(4)** Audit pass: fix wrong computations, remove dead code, fix non-responsive controls, guard against freezes on large datasets (paginated/aggregated fetches, capped renders, memoization, abortable fetches).

## Technical notes
- Data fetching already uses `fetchAllRowsKeyset`; Phase 4 will cap/aggregate where unbounded.
- New backend objects (Phase 1) follow the project's GRANT + RLS rules and owner-auth helpers.
- KPI export refactor keeps `kpis.ts` as the single source of determinant logic to guarantee export/KPI parity.

## Suggested order
Phase 3 (prefill correctness) and Phase 1 (owner data mgmt) are highest user value; Phase 2 next; Phase 4 last as it's the broadest. I can proceed in this order, or reprioritize.
