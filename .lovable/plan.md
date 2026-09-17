# Reliable Household & MDA recording

Today the Households & MDA tab only stores four totals per treatment round (eligible, treated,
absent, refused). Nobody can see who was treated, with what dose, by whom, or why someone was
missed — so the coverage figures can't be checked or defended. This makes the tab record treatment
person by person and derive the household totals from those entries.

## What changes for the user

**1. Person-level treatment register**
When recording a round, each registered household member appears as a row with a treatment outcome:
treated, absent, refused, or not eligible (with a reason — too young, pregnant, breastfeeding,
severely ill, already treated elsewhere, other). For a treated person the worker records the
medicine, number of tablets, dose measurement (height pole band or weight), whether swallowing was
directly observed, and any side effect noticed.

**2. Totals calculated, not typed**
Eligible / treated / absent / refused are computed from the member rows, so household coverage always
matches the register. Extra non-registered household members can still be captured as a count, kept
separately from named people.

**3. Round details that make analysis possible**
Each round also captures round type (annual, mop-up, re-treatment), medicine batch number and expiry,
the distributor (CDD) name and their supervisor, the community and facility it belongs to, whether
the household was revisited, and free-text notes.

**4. History and editing**
Rounds can be edited and deleted. A round history view per household shows every round with coverage,
side effects and who recorded it; a project-wide round summary lists rounds across households with
coverage by disease and by community, plus CSV export.

**5. Guardrails so the data is trustworthy**
- Treated cannot exceed eligible; the form blocks saving and explains why.
- Duplicate warning if the same household, disease and round name already exists.
- Missing medicine, batch or distributor is flagged as an incomplete record on the round row.
- Side effects marked serious are highlighted for follow-up.

## Technical outline

**Database migration**
- New table `household_mda_treatments` — project_id, module_id, round_id (FK to
  `household_mda_rounds`, cascade delete), beneficiary_id (nullable, for unregistered members),
  person_name, age_years, sex, outcome, not_eligible_reason, drug, tablets, dose_basis,
  dose_value, directly_observed, adverse_event, adverse_event_serious, notes, timestamps,
  created_by. RLS mirrors `household_mda_rounds` (project-scoped via `accessible_project_ids`,
  admins full access), GRANTs to authenticated + service_role, updated_at trigger.
- Extend `household_mda_rounds` with round_type, drug_batch, drug_expiry, distributor_name,
  supervisor_name, facility_id, community, revisit_done, unregistered_treated,
  unregistered_eligible.

**Frontend**
- `src/lib/programmeModule/households.ts` — treatment row type, outcome/reason/dose constants,
  `saveMdaRoundWithTreatments` (upsert round + replace its treatment rows), `deleteMdaRound`,
  coverage helpers that aggregate from treatment rows, CSV builder.
- `src/components/ProgrammeModule/MdaRoundDialog.tsx` — new multi-section dialog (round details,
  member register with per-person outcome, unregistered members, validation summary).
- `HouseholdsPanel.tsx` — use the new dialog, add edit/delete actions on each round row, a round
  detail drawer showing treated people and side effects, a project-wide rounds tab with filters
  (disease, community, date range) and CSV export, plus the incomplete/serious badges.
- Cluster dashboard coverage keeps reading the same round totals, so it stays correct.

## Build order
1. Migration (new treatment table + round columns).
2. Data layer in `households.ts`.
3. `MdaRoundDialog` with validation.
4. Panel rewiring: history, edit/delete, project-wide rounds view, export.
5. Typecheck and verify in the running app.
