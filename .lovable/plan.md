## Goal

Three exhaustive fixes to the CES Survey Workflow on the Coverage Evaluation 3D page:

1. Step 1 must use ONLY real Microplanning data from the Geo Microplanning page — never demo/dummy data.
2. Step 4 must allow continuing the survey when no matching microplanning record is found, and persist that the community is "outside microplan" with a reason.
3. Every click of "Sample Another Segment" (Steps 2 & 3) must open a required comment dialog and persist the reason per added segment.

---

## 1) Remove demo data fallback in Step 1

**File:** `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`

- Delete the import `import { DEMO_ENTRIES } from "../Microplanning/demoData";` (line 31).
- Remove `isUsingDemoData` and `effectiveMicroplans` (lines 107–109). Use the real `microplans` array everywhere it was referenced (`handleMicroplanSelect`, `activeMicroplan`, the dropdown render at ~1128–1142, and the helper status text).
- Replace the dropdown's empty/demo-fallback UX with:
  - When `loading`: show "Loading microplanning entries…".
  - When `!loading && microplans.length === 0`: show an inline `Alert` with "No microplanning entries exist for this project. You can still proceed — this community will be flagged as **outside microplan** in Step 4." and disable the auto-fill `Select`.
  - When entries exist: keep current dropdown but drop the `(Demo)` suffix and `_isDemo` check.
- Keep cascading `state/lga/ward` selects free-text-capable (already are via `nigeriaAdminData`) so the user can still proceed without a microplan match.

## 2) Allow Step 4 to continue without a microplan match + capture "outside microplan" reason

**Schema change (migration):** add to `public.ces_surveys`:
- `outside_microplan boolean NOT NULL DEFAULT false`
- `outside_microplan_reason text`

**File:** `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`

- Add state: `const [outsideMicroplan, setOutsideMicroplan] = useState(false);` and `const [outsideMicroplanReason, setOutsideMicroplanReason] = useState("");`.
- After `fetchMicroplanComparison(...)` resolves in `computeAnalysis` (line ~842), set `outsideMicroplan = (cmp == null)` automatically.
- In the "No matching microplanning record found…" branch (~1473), replace the bare paragraph with:
  - A non-blocking `Alert` explaining that the community is not in the microplan and the survey will be tagged `outside_microplan = true`.
  - A required `<Textarea>` bound to `outsideMicroplanReason` (placeholder: "Why is this community being surveyed even though it is outside the microplan? e.g., newly settled hamlet, IDP camp, omission in microplanning…").
  - A "Save reason" `Button` calling `persistSurvey("draft")`.
- Step 5 "Submit final" button: if `outsideMicroplan && !outsideMicroplanReason.trim()` → block with toast "Reason required for surveys outside the microplan."
- Update `persistSurvey` payload (line ~493) to include `outside_microplan` and `outside_microplan_reason`, and add both to the `useCallback` deps.

## 3) Comment dialog on every "Sample Another Segment" click

**Schema change (same migration):** create new table `public.ces_segment_resamples`:
- `survey_id uuid not null references public.ces_surveys(id) on delete cascade`
- `segment_label text not null`
- `reason text not null`
- `created_by uuid` / `created_at`
- RLS: enable; policy "Users can manage resamples for their own surveys" using `EXISTS (SELECT 1 FROM ces_surveys s WHERE s.id = survey_id AND s.created_by = auth.uid())` for `select/insert`. Admin select via `is_admin(auth.uid())`.

**File:** `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`

- Add `const [resampleDialogOpen, setResampleDialogOpen] = useState(false);` and `const [resampleReason, setResampleReason] = useState("");`.
- Replace direct `onClick={sampleAnotherSegment}` on the two buttons (lines ~1321 and ~1406) with `onClick={() => { setResampleReason(""); setResampleDialogOpen(true); }}`.
- Refactor `sampleAnotherSegment` into `confirmSampleAnotherSegment(reason: string)` that:
  1. Picks a random remaining segment (existing logic).
  2. Inserts `{ survey_id: surveyId, segment_label, reason, created_by }` into `ces_segment_resamples` (only if `surveyId` exists; otherwise call `await persistSurvey("draft")` first to get an id).
  3. Calls `logCESAction(surveyId, "sample_another_segment", { added: label, reason })`.
  4. `setSelectedSegmentLabels(p => [...p, label])` and closes the dialog.
- Add a `<Dialog>` at the bottom of the component:
  - Title: "Reason for Sampling Another Segment".
  - Description: "Random sampling has scientific implications. Please document why an additional segment is being added (e.g., target N not reached, original segment inaccessible, security risk, refusal cluster)."
  - Required `<Textarea>` bound to `resampleReason` (min length 10).
  - Footer: Cancel / Confirm — Confirm disabled until reason length ≥ 10, then calls `confirmSampleAnotherSegment(resampleReason)`.

## Technical notes

- No changes to existing edge functions.
- No changes to other CES components.
- All new fields persist via the existing `persistSurvey` flow plus one new insert into `ces_segment_resamples`.
- Migration order: create table + columns first, then code edits.

## Files touched

- `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` (edits)
- New migration adding 2 columns to `ces_surveys` and creating `ces_segment_resamples` with RLS.
- No other files.
