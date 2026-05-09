## Coverage Evaluation Survey — Therapeutic & Geographic Coverage + Discrepancy Surfacing

### 1. Database (one migration)

**Extend `ces_household_visits`** (the per-household record from CES):
- `eligible_persons` integer — eligible persons in HH (denominator for therapeutic coverage)
- `treated_persons` integer — eligible persons actually treated
- `treatment_took_place` boolean — generated from `treated_persons > 0`, used for geographic coverage

**Extend `ces_segments`**:
- `total_hh_in_segment` integer — user-reported true HH count in the segment (geographic denominator)
- `hh_treated_in_segment` integer — user-reported HHs where treatment occurred (geographic numerator)
- `eligible_persons_total` integer (derived/cached)
- `treated_persons_total` integer (derived/cached)

**Extend `microplan_allocations`** (Geo Microplanning Coverage tab):
- `community_total_hh` integer — total HHs in the community/settlement
- `community_hh_treated` integer — HHs where treatment took place
- `geographic_coverage_pct` numeric (generated)

**New view `v_ces_coverage_rollup`**: aggregates therapeutic and geographic coverage across Settlement → Community → FLHF → Ward → LGA → State, including target_population join from microplanning for two-proportion z-test inputs.

RLS: same patterns as existing CES tables (authenticated read; creator/admin write).

### 2. Library code

**`src/lib/ces/coverageStats.ts`** — extend with:
- `computeTherapeuticCoverage(visits)` — Σ treated_persons / Σ eligible_persons + 95/99% CI (Wilson)
- `computeGeographicCoverage(segments)` — Σ hh_treated / Σ total_hh + CI
- `rollupByGeography(rows, level)` — groups visits/segments by settlement/community/FLHF/ward/LGA/state

**`src/lib/ces/discrepancy.ts`** (new):
- `compareCESvsMicroplan(level, cesRollup, microplanRollup)` — two-proportion z-test
  - Operations dashboard rule: flag where `pTreatedAgainstTarget != pCES_therapeutic` (p<0.05) **AND** `geographic_coverage_pct < 100`
  - Microplanning Coverage rule: flag where geographic coverage from microplan vs CES differs significantly

### 3. UI changes

**CES — `CESSurveyWorkflow.tsx` Step 3 (household interview sheet)**:
- Add fields: "Total eligible persons in household" + "Eligible persons treated"
- Live-validate `treated ≤ eligible`
- Auto-set `treatment_took_place = treated > 0`

**CES — Step 2 (segment setup)**:
- Add "Confirmed total households in this segment" input (overrides AI estimate as the geographic denominator)

**CES — Step 4 (Coverage Map & Inference)**:
- Replace single "inferred coverage" with **two stat blocks**:
  - **Therapeutic Coverage** = treated_persons/eligible_persons + 95/99% CI
  - **Geographic Coverage** = HH_treated/total_HH_in_segment + 95/99% CI
- Add roll-up table: Settlement → Community → FLHF → Ward → LGA → State, columns: eligible, treated, therapeutic %, total HH, HH treated, geographic %.

**Operations tab — `SupervisorDashboard.tsx` (or new `CoverageDiscrepancyWidget`)**:
- Map (Leaflet) + table beneath listing communities/settlements where:
  `coverage_from_target_pop ≠ ces_therapeutic_coverage` (z-test p<0.05) AND `geographic_coverage < 100%`
- Columns: Community, Settlement, Target-pop coverage %, CES therapeutic %, z, p, geographic %, action button.

**Geo Microplanning — `CoverageView.tsx`**:
- Add columns: "Total HH in community", "HH where treatment took place", "Geographic Coverage %"
- Below table: Discrepancy panel listing communities/settlements where geographic coverage differs significantly between Microplanning and CES (two-proportion z-test).

### 4. Hooks / data wiring
- `useCESCoverageRollup(filters)` — fetches `v_ces_coverage_rollup`
- `useCoverageDiscrepancies(scope)` — joins microplan + CES rollup, runs z-test client-side

### Out of scope for this pass
- Editing historical CES visits to backfill new fields (existing rows default to NULL — excluded from denominators until edited)
- Mobile-specific re-layout of the new fields beyond default responsive grid

---

**Reply "go" to proceed**, or tell me which slice to ship first if you'd rather stage it (e.g., "DB + CES capture only", then dashboards in a follow-up).
