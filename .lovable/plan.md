## Bloomberg School Enrolment Validation — Standard Form, Dashboard & Cascade Assignment

### Goal
Build a self-contained Bloomberg validation system that lives permanently in the **Standard Forms** folder (independent of whether the Bloomberg project still exists in Projects), is **visible only to the Owner** (and the data it produces), exactly matches the two reference images, and adds a **global owner capability** to scope a user to specific cascade field values (State/LGA/Ward/Community/School).

### 1. Database & data import
- **`bloomberg_schools`** table — identifying fields only (school_key, school_name, school_code, school_type, school_level, ownership, state/lga/ward/location + labels). Readable by `authenticated` (validators must pick their school). No baseline columns here.
- **`bloomberg_school_baselines`** table — keyed by `school_key`, holds all `*_baseline` figures + quality flag. **Owner-only** RLS (via `has_role`/owner email check) so validators can never read baselines.
- **`bloomberg_validations`** table — one row per submission: school_key, location answers, verification block, actual enrolment by class/sex, GPS, photos (storage paths), validator id, status, timestamps. Validators insert/read own rows; Owner/Admins read all.
- **`user_cascade_assignments`** table (global feature) — `(form_id, user_id, field_key, value)`. Owner-managed. Used app-wide to filter cascade options.
- Import all ~2,853 rows from `Schools.csv` into the two tables via an insert migration (split: identity → `bloomberg_schools`, baselines → `bloomberg_school_baselines`).
- All tables get GRANTs + RLS in the same migration. A storage bucket `bloomberg-evidence` for photos.

### 2. The Standard Form (mobile-first, matches Form image)
- Add a Bloomberg definition + filler so it appears as a card in the **Standard Forms** folder in `FormsView`, gated so **only the Owner** sees the card and its submissions.
- 4-step wizard exactly like the reference: **1 School** (cascading State→LGA→Ward→Community→School + code/type/level + GPS capture), **2 Verify** (exists?, operational status, head teacher, date, register toggles), **3 Enrolment** (P1–P6 + JSS1–JSS3 male/female tables with live totals, grand total), **4 Evidence** (required signboard/classroom/register photos + optional + remarks + confirm checkbox + Save Draft / Submit).
- Deep-navy header, stepper, blue primary buttons, rounded cards, soft shadows; offline-capable via existing saved-forms store.
- **Privacy:** baseline figures are looked up server-side for the dashboard only and are never fetched or shown anywhere in the filler.

### 3. The Dashboard (matches Dashboard image, Owner/Admin only)
- New `BloombergDashboardView`: Bloomberg branded navy sidebar, top filter bar (LGA/Ward/date), 7 KPI tiles (Total Schools, Visited, Validated, Partially Matched, Not Matched, Total Validated Enrolment), Nigeria map of validation status (reusing existing MapVisualization with Bauchi/Jigawa boundaries, colored status pins), Enrollment Comparison donut, aggregated Baseline-vs-Validated bar chart, Gender Distribution donut, Top Discrepancies table, Data Quality + Sync + Quick Actions panels.
- Baseline vs validated comparison + discrepancy % computed here (owner-only data).

### 4. Global cascade-field assignment (owner right, app-wide)
- Extend `OwnerRolesAccessManager` with a "Cascade Scope" section: pick a user + form, then assign allowed values for chosen cascade fields (State/LGA/Ward/Community/School).
- In `FormFiller` (and the Bloomberg filler), when a `user_cascade_assignments` record exists for the current user+form, **pre-filter and lock** the assigned cascade levels so the user only sees schools/areas within their assignment. Generic across any form with cascade fields.

### Technical notes
- School cascade options are sourced from `bloomberg_schools` (DB-backed `select_one_from_file`-style), filtered by parent selection and by the user's cascade assignment.
- Folder persistence: the form is registered as a built-in standard form (code-defined like existing WG-SS/PHQ-9), so it survives project deletion and never depends on the `projects` table.
- Owner gating reuses `useAuth` `isOwnerLevel` / owner email (`amehjoey1@gmail.com`).

### Files (high level)
- Migrations: schools + baselines + validations + cascade_assignments + storage bucket + CSV import.
- New: `src/lib/bloomberg/definition.ts`, `src/components/Bloomberg/BloombergFormFiller.tsx`, `BloombergDashboardView.tsx`, `useBloombergData.ts`.
- Edits: `FormsView.tsx` (Standard Forms card, owner gate), `OwnerRolesAccessManager.tsx` (cascade scope UI), `FormFiller.tsx` (assignment filtering), nav/route wiring.

### Open question
Will be confirmed before build: should the dashboard be a brand-new full-screen Bloomberg-skinned view (its own navy sidebar as in the image), or embedded inside the existing app shell/analytics area?