## Goal
Make the GPS in **Coverage Evaluation 3D → CES Survey Workflow → Step 1 (Locate & Boundaries)** actually start, stay alive, update live, and recover from errors.

## Root causes (confirmed in `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` lines 179–248)

1. **Watch is killed immediately after start.** `startGPSLock` is a `useCallback` that depends on `gpsWatching`. The `useEffect` that calls it lists `[startGPSLock]` as deps. As soon as `setGpsWatching(true)` runs, the callback identity changes → the effect's cleanup runs → `clearWatch` is called on the watch we just registered. The next effect run sees `gpsWatching === true` and early-returns, so **no watch is ever active**. This is why GPS never updates.
2. **No user-gesture fallback.** Geolocation is auto-started on mount. On iOS Safari, fresh permission grants, or after a denial, this silently fails with no recovery path because there is no visible "Retry / Lock GPS" button in Step 1.
3. **Errors are swallowed.** `err.code === 3` (TIMEOUT) returns silently and `code === 1` (PERMISSION_DENIED) only shows a generic toast that disappears. The user sees only "GPS…" forever.
4. **No insecure-context / unsupported-API guard.** If `navigator.geolocation` is missing or the page is non-HTTPS, the user gets nothing.
5. **First fix is smoothed against itself.** Minor — first reading should seed directly, not be EMA-blended.

## Fix (single file: `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`)

### 1. Rewrite the GPS lifecycle
- Replace the `useCallback` + state-dependent effect with:
  - A stable `startGPSLock` that uses `watchIdRef.current` as the source of truth (no `gpsWatching` dep).
  - A mount-only `useEffect(() => { startGPSLock(); return cleanup; }, [])` so the watch is registered exactly once and only cleared on component unmount.
  - Keep `gpsWatching` purely as a UI flag (set inside the watch callbacks), not as a guard for `useCallback`.
- Add a `gpsError` state (`'denied' | 'unavailable' | 'timeout' | 'insecure' | null`) updated from the error callback and from a pre-check (`!('geolocation' in navigator)` / `!window.isSecureContext`).
- Seed directly on first fix (skip EMA when `prev === null`); throttle `setGps` updates to skip changes <0.3 m AND <1 m accuracy delta to keep React renders responsive.

### 2. Add a visible Lock / Retry control in Step 1
- Inside the Step 1 card (near the existing accuracy alerts around lines 904–920), render a compact "GPS status" panel:
  - Spinner + "Acquiring GPS…" + elapsed seconds when `!gps && !gpsError`.
  - Current `±Xm` + "High precision" badge when locked.
  - Destructive alert when `gpsError`, with a `Lock GPS` / `Retry` button that calls `startGPSLock()` from a real click handler (satisfies iOS user-gesture requirement and re-prompts permission).
- Pre-fill helpful messages per error code (denied → "Enable location in browser settings", insecure → "Open the app over HTTPS", unavailable → "Device has no GPS").

### 3. Keep all other behavior intact
- No DB changes, no schema changes, no changes outside this file.
- Smoothing logic, perimeter recording, household pinning, autosave, time-lapse logging all keep using the same `gps` state shape `{ lat, lng, accuracy }`.

## Acceptance check
- Open `/?tab=coverage-eval` → CES Survey Workflow → Step 1.
- Live GPS readout updates within ~2 s of granting permission and continues updating as the user moves (verified via `±X m` ticking).
- Denying permission shows an inline destructive alert with a working "Retry" button that re-triggers the browser permission prompt.
- "Walk Perimeter" enables once accuracy ≤ 50 m and starts collecting points.
- No more "GPS…" hang on first load.

## Out of scope
- Other steps (2/3) and other modules already use the same `gps` state and will benefit automatically; no separate edits needed.
