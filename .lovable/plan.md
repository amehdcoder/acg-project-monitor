# Household register that fills itself, and an NTD treatment passport per person

Today a household only exists if someone creates it by hand, and treatment is recorded round by
round at household level. This makes the Households & MDA screen build itself from the register,
and turns every person in it into a lifelong NTD record across all five preventive-chemotherapy
diseases — onchocerciasis, lymphatic filariasis, schistosomiasis, soil-transmitted helminths and
trachoma — together with the morbidity care they receive.

## What changes for the user

**1. Households appear on their own**
When a beneficiary is registered (at the desk, from a CDD case-search confirmation, or synced from
an offline device), they are placed into a household automatically: matched to an existing
household in the same community with the same head of household, or a new one is opened with the
next code. Nobody has to remember to create it. Staff can still move a person to another household
or correct the match at any time.

**2. Click a person, see their NTD passport**
Opening a person from the household register shows a treatment passport: a grid of the five
diseases down the side and the treatment years across the top, each cell coloured for treated,
missed, absent, refused, not eligible or never offered. At a glance you see "this child has missed
schistosomiasis three rounds running". Below it:
- **Treatment history** — every dose: medicine, tablets, how the dose was measured, whether
  swallowing was watched, and any side effect.
- **Morbidity management** — lymphoedema, hydrocoele, trichiasis and skin disease: current stage,
  limb measurements, acute attacks in the last year, hygiene/self-care kit issued, surgery status
  and next review date.
- **Consecutive misses and never-treated flags** — the person is marked as a persistent
  non-compliant when they have missed two or more consecutive rounds of the same disease, which is
  exactly the group that sustains transmission.

**3. Household members who are not beneficiaries**
Every household keeps a full roster, not just registered patients. A member can be added in
seconds (name, sex, age, relationship, pregnant/breastfeeding, height band) and carries their own
treatment passport and morbidity history. Any member can be promoted to a full registered
beneficiary later, keeping everything already recorded against them.

**4. Record a round against the roster**
Recording an MDA round pre-loads the whole household — registered beneficiaries and other
members — so the distributor just ticks down the list. Household coverage is calculated from those
entries. Eligibility is pre-applied per disease (age and height cut-offs, pregnancy, breastfeeding),
so the form proposes who should and should not be treated and says why.

**5. Household NTD profile**
Each household header shows treated/eligible for each of the five diseases this year, its water
point, its morbidity caseload, and a "household never fully covered" flag when any member has
missed the current round.

## Technical outline

**Database migration**
- `household_members` — project_id, module_id, household_id, beneficiary_id (nullable, unique when
  set), full_name, sex, date_of_birth, age_years, relationship, height_cm, is_pregnant,
  is_breastfeeding, is_alive, notes, timestamps, created_by. RLS mirrors
  `beneficiary_households` (project-scoped via `is_project_member`, admins full access), GRANTs to
  authenticated + service_role, updated_at trigger.
- `household_mda_treatments` gains `member_id` (FK → household_members, ON DELETE SET NULL) so a
  dose can belong to a non-registered member.
- `ntd_morbidity_records` — project_id, household_id, beneficiary_id / member_id, condition
  (lymphoedema, hydrocoele, trichiasis, skin_disease, other), stage, affected_side,
  limb_circumference_cm, acute_attacks_last_year, self_care_kit_issued, self_care_trained,
  surgery_status, surgery_date, next_review_date, notes, recorded_on, timestamps. Same RLS shape.
- Trigger `auto_place_beneficiary_household()` on `beneficiaries` (AFTER INSERT, and on UPDATE when
  household_id is still null): finds a household in the same project/village/ward with a matching
  head name, else creates one with the next `HH-` code from that project, then sets household_id
  and inserts the matching `household_members` row. Runs for every write path including offline
  sync.
- Backfill: place existing beneficiaries with no household, and create member rows for those
  already attached.

**Frontend**
- `src/lib/programmeModule/householdMembers.ts` — member types, `useHouseholdMembers`,
  save/delete/promote, per-disease eligibility rules (age/height/pregnancy per disease),
  `treatmentPassport(person, treatments, rounds)` building the disease × year matrix,
  consecutive-miss detection.
- `src/lib/programmeModule/morbidity.ts` — morbidity conditions, stages, `useMorbidityRecords`,
  save/delete, care-gap helpers (kit not issued, review overdue, surgery pending).
- `src/components/ProgrammeModule/PersonNtdPassport.tsx` — the person sheet: passport matrix,
  treatment table, morbidity timeline, add/edit morbidity dialog, promote-to-beneficiary action.
- `src/components/ProgrammeModule/HouseholdMemberDialog.tsx` — add/edit a non-registered member.
- `HouseholdsPanel.tsx` — roster list merging beneficiaries and members, click opens the passport,
  per-disease coverage strip in the household header, "Add member" action.
- `MdaRoundDialog.tsx` — pre-load the full roster, per-disease eligibility proposals with reasons.
- `BeneficiaryMdaPanel.tsx` — reuse the passport matrix so the Longitudinal page matches.

## Build order
1. Migration (members, morbidity, member_id, auto-placement trigger, backfill).
2. Data layer: householdMembers.ts, morbidity.ts, passport helpers.
3. PersonNtdPassport + HouseholdMemberDialog.
4. Panel and round-dialog rewiring; beneficiary page reuse.
5. Typecheck and verify in the running app.
