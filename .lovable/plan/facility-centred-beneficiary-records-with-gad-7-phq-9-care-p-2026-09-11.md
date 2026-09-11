# Facility-centred Beneficiary Records with GAD-7 / PHQ-9 care pathway

Turn the Beneficiary Records area of the Cases page into a facility-based clinical record: patients belong to a registered health facility, focal persons manage them, mental-health screening uses the real GAD-7 and PHQ-9 instruments, and referrals move a patient's full history to the receiving facility.

## 1. Mental health screening inside the record

- In the "Mental Health & Psychosocial Support" tab, choosing the service **GAD-7 assessment** opens the GAD-7 questionnaire; choosing **PHQ-9 assessment** opens the PHQ-9 questionnaire. Any other service keeps the current simple entry.
- The questionnaires reuse the exact wording, scoring and look of the Mental Health assessment in Standard Forms: coloured header (green for GAD-7, violet for PHQ-9), progress bar, the 4-column frequency grid, difficulty question, and the score/severity result card.
- The patient's identity comes from the beneficiary record itself — no re-typing of name, sex, age or Patient ID.
- Each completed screening is stored against the beneficiary as a service (score, severity, all answers) so it appears in the timeline, history and audit trail, and works offline through the existing queue.

## 2. Longitudinal patient outcome

- A "Longitudinal outcome" panel on the mental health tab, styled like the Standard Forms records view: score-trend line chart per scale, first vs latest score, improvement/decline arrow, visit count, severity badges, and a visit-by-visit table.
- Scoped to this one patient, with a scale filter (GAD-7 / PHQ-9) when both exist.

## 3. Facilities, Pharmacy & Referrals in the record

- New "Care network" area in the beneficiary record with the same three sections as Standard Forms:
  - **Facility** — the registered facility this patient belongs to, its type, location and contact.
  - **Pharmacy** — antidepressant stock at that facility, so a prescriber sees availability before referring.
  - **Referrals** — referral history with urgency and status (initiated / accepted / declined / completed), and accept/decline actions for the receiving facility.
- The referral form now refers **to a registered facility** picked from the register (free text is no longer the identifier), with reason, urgency, clinical summary and linked programme component.

## 4. Facility-based access and focal persons

- Beneficiaries are registered against a facility; the list can be filtered and grouped by facility, with per-facility counts.
- Administrators can appoint any user as a **focal person** for one or more facilities from a "Facility focal persons" panel (add, deactivate, list).
- A focal person sees and manages every beneficiary, service and referral of their facilities.
- When a referral is sent to a facility, that facility's focal persons immediately gain read access to the complete record and history of the referred patient — profile, all services, all referrals, and audit trail — and can accept, decline or complete the referral.
- Existing project-member and administrator access is unchanged; facility access is additive.

## Technical notes

Database migration:
- `beneficiaries.facility_id` → `health_facilities(id)`; `beneficiary_referrals.from_facility_id` / `to_facility_id`, `urgency`, `clinical_summary`.
- New `facility_focal_persons` (facility_id, user_id, role, is_active, timestamps) with GRANTs, RLS, unique (facility_id, user_id).
- Security-definer helpers: `is_facility_focal(uuid, uuid)`, `user_facility_ids(uuid)`, `has_facility_access_to_beneficiary(uuid, uuid)` (home facility OR an active referral to one of my facilities).
- Additional permissive SELECT/UPDATE policies on `beneficiaries`, `beneficiary_services`, `beneficiary_referrals`, `beneficiary_audit` using those helpers; existing policies untouched.
- Index on `beneficiaries.facility_id`, `beneficiary_referrals.to_facility_id`.

Frontend:
- `src/components/ProgrammeModule/MentalHealthServiceForm.tsx` — GAD-7/PHQ-9 filler driven by `STANDARD_ASSESSMENTS` + `scoreAssessment` from `src/lib/standardAssessments/definitions.ts`, saving through the existing service payload path (offline queue preserved).
- `src/components/ProgrammeModule/LongitudinalOutcome.tsx` — recharts trend panel fed by `beneficiary_services` rows for `gad_7` / `phq_9`.
- `src/components/ProgrammeModule/CareNetworkPanel.tsx` — facility / pharmacy / referral sections reading `health_facilities`, `antidepressant_stock`, `beneficiary_referrals`.
- `src/components/ProgrammeModule/FacilityFocalPersons.tsx` — admin panel in the workspace header.
- Updates to `ServiceEntryDialog.tsx` (route mental-health services to the questionnaire), `ReferralDialog.tsx` (facility picker, urgency, summary), `BeneficiaryRecord.tsx` (new panels), `BeneficiaryFormDialog.tsx` + `BeneficiaryList.tsx` (facility assignment, filter), and `types.ts`.
- Referral inbox for focal persons: incoming referrals list with one-click open of the referred patient's full record.
