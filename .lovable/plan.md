## Goal
Once GPS in **Step 1 — Locate & Boundaries** reaches accuracy ≤ 25 m, automatically move the user to Step 2 — without disrupting in-progress work.

## Behavior

Auto-advance fires only when ALL of these are true:
- `step === 1`
- `gps && gps.accuracy <= 25`
- Required admin fields are filled: `state`, `lga`, `ward`, `communityName` (same gate the existing "Continue" button enforces)
- `!recordingPerimeter` (don't yank the user mid-walk)
- It hasn't already auto-advanced this session (one-shot guard)

When it fires:
- Show a brief, dismissible toast: "GPS locked at ±Xm — continuing to Step 2".
- Call the same `setStep(2)` path the manual button uses (and reuse any side-effects there, e.g., persist).

If the user manually returns to Step 1 after the auto-advance, the guard prevents re-firing repeatedly. They can still hit Continue manually.

## Implementation (single file: `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`)

1. Add a ref `autoAdvancedRef = useRef(false)` near the other refs.
2. Add a `useEffect` that watches `[step, gps, state, lga, ward, communityName, recordingPerimeter]`. Inside:
   - If guard matches, set `autoAdvancedRef.current = true`, fire toast, and call `setStep(2)` (plus the same persist call the manual handler does, so behavior matches).
3. No UI/markup changes required.

## Out of scope
- No changes to other steps, no DB changes, no change to the manual Continue button (kept as a fallback).
