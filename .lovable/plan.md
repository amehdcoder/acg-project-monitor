# Plan: Forms expansion (cascade select + HFAT + iterations + custom/standard split)

The work spans 5 distinct concerns. I'll deliver them in batches so each can be reviewed/tested before moving on.

## Batch A — Form Builder: cascade / dependent dropdowns (UI)

The data model already supports cascading (`Question.cascadeParentId` and `QuestionOption.parentValue` in `src/components/FormBuilder/types.ts`). The FormFiller respects them. What's missing is the **builder UI** to set them.

- In the question editor (per `select_one` / `select_multiple` question), add a "Cascade from" picker — lists every preceding `select_one` question in the form by label.
- When a parent is chosen, each option row of the dependent question gets a new "Show when parent =" select populated from the parent's options. Multi-tag allowed.
- Visual badge on cascading questions in `FormCanvas`.
- Live preview still works because `FormPreview`/`FormFiller` already filter options by `parentValue`.

## Batch B — HFAT as a 4th default standard form

The XLSForm has 895 rows across HFAT + LFAT. I'll:

- Extract HFAT into a generated JSON definition (`src/lib/standardAssessments/hfat.generated.ts`) using a one-off script that walks the XLSX rows and groups questions under their `/domain_n/section_n` paths, preserves `Display Condition` as `relevant`, and converts `Multiple Choice` + immediate `Choice` rows into `select_one` with options. Lookup tables (state/LGA/facility) reuse the existing `nigeriaAdminData`.
- Register a new code `hfat` in `definitions.ts` (`StandardFormCode`).
- Because HFAT is far larger and structurally different from a 7-item screener, the existing `StandardAssessmentFiller` will get a section-paginated mode for `hfat` (one section card at a time, Next/Prev) so it stays usable on mobile.
- Add the HFAT tile to `FormsView` alongside WG-SS / GAD-7 / PHQ-9.

## Batch C — Iterations + activity-description popup for WG-SS / GAD-7 / PHQ-9

- On opening WG-SS, GAD-7, or PHQ-9, show a dialog asking for **Activity description** (textarea, required) before the first respondent. Persisted in component state for the whole session.
- After Submit, instead of returning to forms, show "Respondent saved — add another?" with **Add another respondent** / **Finish session** buttons. Each respondent submission writes its own row; all rows in the session share the same `activity_description` and a generated `session_id`.
- DB: add `session_id uuid` + `activity_description text` columns to `standard_assessment_submissions` (additive, nullable, no policy change).

## Batch D — Forms page split: Custom vs Standard

- Restructure the "Available Forms" area of `FormsView` into two clearly separated sections with headers and counts:
  - **Standard forms** (system-default): Microplanning + WG-SS + GAD-7 + PHQ-9 + HFAT. Cards styled with a distinct accent (subtle indigo gradient + "Standard" badge).
  - **Custom forms** (everything built in the FormBuilder). Existing card style.
- Section headers collapse/expand. Empty-state copy for each.

## Batch E — Factory reset: soft-disable standard forms

`owner_factory_reset` currently wipes data. Standard forms aren't stored as rows so they can't be deleted, but the request is to keep them **visible-but-disabled** post-reset.

- Add a `standard_form_disabled` table (`form_code text primary key, disabled_at timestamptz, disabled_by uuid`).
- After a factory reset succeeds, the owner reset flow inserts a row per standard form code, marking it disabled.
- `FormsView` reads this table and renders disabled standard-form tiles greyed-out with a "Disabled (factory reset) — Enable" action available to admins.
- Enabling deletes the row.

---

## Technical notes

- All DB changes are additive with RLS scoped to authenticated users; existing policies untouched.
- HFAT extraction script runs once locally (in `/tmp`) and emits a TS file checked into the repo — no runtime XLSX parsing.
- Cascade UI reuses existing `cascadeParentId` / `parentValue` so old forms stay compatible.
- No changes to the speech / voice pipeline.

---

**Proposed order:** A → B → C → D → E. Each batch is self-contained and shippable. Reply with "Proceed with Batch A" (or any batch) and I'll implement.
