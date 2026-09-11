# Longitudinal Beneficiary Record (CiSKuLA-style) — configurable standard form

A new reusable programme module that can be added to **any project** from a "+" button. It gives every
beneficiary one unique Case ID and a single record that links services, follow-ups, referrals,
assessments, outcomes and history — laid out like the reference screenshot.

## What the user gets

**1. Add to a project with "+"**
- On the Cases page, a "+ Add programme module" button opens a gallery of templates
  (Integrated NTD / Eye Health, blank template, plus any template saved by an admin).
- Picking one creates the module for that project in seconds; nothing else in the project changes.

**2. Beneficiary record screen (mirrors the image)**
- Header card: photo, name, status pill, Case ID, age/sex, phone, village, LGA, state, disability status,
  Edit Profile, overflow actions.
- Overall Progress ring ("6 of 7 components", On track).
- Component tabs: Overview + one tab per programme component (Eye Health, MMDP/NTD, Mental Health,
  WASH, Livelihood, Health System, Documents) — all defined in configuration.
- Component cards grid with icon, colour, last-service date, latest result, status chip.
- Personal & household info card, key clinical/social card, location card with map and "View on Map".
- Service delivery summary donut, latest assessments table, quick actions.
- Right rail: Longitudinal Care Timeline, Next Follow-up, Referrals with status.
- Footer strip: component list, alignment note, online/offline dot, version.

**3. Beneficiary list**
- Search by name/Case ID/phone, filters by component, status, LGA/ward, risk, data-quality flag.
- Cards/table with progress, last service, next follow-up; opens the record screen.

**4. Everything editable, no code**
An admin "Configure module" workspace with tabs:
- **Components** — add/remove/rename/reorder/hide, set icon and colour.
- **Sections & questions** — reuses the existing form-builder engine: question types, options,
  required, validation, calculations, skip logic, ordering, show/hide.
- **Workflow** — statuses, transitions, risk rules, referral reasons/statuses, follow-up schedules.
- **Case ID format** — prefix, year, sequence width (e.g. `CISKULA-2025-000124`).
- **Header & summary layout** — which fields appear in the header, cards and quick actions.
- **Branding** — module name, tagline, logo, accent colour, partner logos, footer text.
- Save as template, duplicate, export/import JSON so the same setup is reusable for any project,
  programme, sector, country or beneficiary type.

**5. Preserved platform behaviours**
Role-based access (project scoped, admin-only configuration), offline capture and sync status with
queued records, audit trail of every field change, data-quality indicators (missing/inconsistent
fields flagged on the record), GIS location capture, and full mobile responsiveness including the
collector app.

## Technical outline

**Database (new tables, project-scoped, RLS + grants)**
- `programme_modules` — project_id, name, config jsonb (components, sections, workflow, layout,
  branding, case-ID rules), is_active, template flags, timestamps.
- `beneficiaries` — module_id, project_id, case_id text (unique per module), profile jsonb,
  status, risk_level, progress cache, photo_path, gps, submission_uuid for offline idempotency,
  version, timestamps.
- `beneficiary_services` — beneficiary_id, component key, service data jsonb, service_date, result,
  recorded_by; drives component cards, timeline and assessments table.
- `beneficiary_referrals` — referred_to, reason, date, status, notes.
- `beneficiary_audit` — field-level before/after, actor, timestamp.
- Case ID generated server-side by a `SECURITY DEFINER` function to keep it unique under concurrency.

**Frontend**
- `src/lib/programmeModule/` — config schema, defaults, CiSKuLA preset, case-ID formatter,
  progress/data-quality evaluators, config validation.
- `src/components/ProgrammeModule/` — `ModuleGallery`, `BeneficiaryList`, `BeneficiaryRecord`
  (header, progress ring, component tabs, cards, timeline rail, referrals, quick actions),
  `ModuleConfigurator`, `ServiceEntryDialog`, `ReferralDialog`.
- Question rendering delegates to the existing FormFiller engine, so validation, skip logic and
  calculations behave exactly as elsewhere.
- Offline: services and beneficiaries queue through the existing IndexedDB sync contract with
  client UUIDs, so records save with no network and sync when back online.
- Design tokens only (semantic colours in the theme), WHO/FMoHSW-style clean information design.

**Integration**
- Entry point on the Cases page via the "+" button; module also registered as a standard form so it
  can be assigned per user.
- No changes to existing case types, forms or dashboards.

## Build order
1. Migration for the five tables, RLS, grants, Case ID function.
2. Config schema + CiSKuLA preset.
3. Beneficiary record screen and list.
4. Configurator workspace.
5. Offline queue, audit trail, data-quality indicators.
6. Module gallery + "+" entry point and template export/import.
