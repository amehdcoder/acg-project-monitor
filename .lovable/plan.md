## Goals

1. **Walk Perimeter** marks vertices using only the highest-accuracy GPS readings, so the resulting polygon is clean enough to divide into equal-area segments.
2. **Step 2** clearly displays the satellite-derived household estimate **with a 95% confidence interval** next to the AI count.
3. The **Street View panel** automatically re-centers the Mapillary embed when GPS coordinates improve mid-workflow.

---

## 1) Highest-accuracy perimeter vertex capture

Edit `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` perimeter effect (lines ~326–344) and the "Walk Perimeter" toggle (lines ~1123–1134).

**New vertex acceptance logic** (replaces the current 7 m jitter filter):

- Maintain a small ref-buffer of the last few GPS fixes received while `recordingPerimeter` is true.
- Only consider a fix as a candidate vertex when:
  - `gps.accuracy ≤ 10 m` (hard quality gate for vertex placement), AND
  - distance from last accepted vertex ≥ `max(2 × accuracy, 5 m)` (movement gate scaled to noise), AND
  - the fix is the best-accuracy reading in the last 1.5 s window (debounce against jitter spikes).
- Every accepted vertex stores `{lat, lng, accuracy, t}` so segmentation can weight by quality. Only `{lat,lng}` is fed to the existing `setPerimeter` to keep the rest of the pipeline unchanged.
- If accuracy is currently > 10 m, surface a small inline status under the button: *"Holding for ≤10 m fix… current ±Xm"* so the user understands why no new vertex is being added. No toast spam.
- Add a tiny live counter beside the toggle: `Pts: N · best ±Ym`.

**Auto-close polygon on stop**: when the user clicks "Stop", if the last vertex is within 15 m of the first, snap it closed (push first vertex again) to guarantee a closed ring before segmentation. Keep a "Clear perimeter" escape hatch.

**Why this enables equal segments**: The existing `kmeansSegments` + bounding-box sampling in `buildSegments` (line 372) is sensitive to jittered vertices that bulge the bbox. A clean ≤10 m polygon yields a tighter bbox and more even k-means partitions. No change to `buildSegments` itself is required.

---

## 2) Household estimate + confidence interval in Step 2

**Backend** — `supabase/functions/ces-rooftop-count/index.ts`:
- Change the system prompt to require the model to also return a low/high range:
  `{"rooftop_count": n, "rooftop_low": n_lo, "rooftop_high": n_hi, "confidence": "...", "notes": "..."}`
- If the model omits a range, derive one server-side from the qualitative `confidence` token:
  - `high` → ±10%, `medium` → ±20%, `low` → ±35%
- Return `{ estimated_households, ci_low, ci_high, ci_level: 0.95, confidence, notes }`.

**Frontend** — `CESSurveyWorkflow.tsx`:
- Extend the `runRooftopAI` state to store `{count, ciLow, ciHigh, confidence}` (replace the single `estHHAi` number with a small object, or add `estHHAiCI: {low, high} | null`).
- In Step 2 (lines ~1191–1212), render the AI estimate as:
  ```
  AI Estimated HH:  ~142  (95% CI: 113 – 171, medium confidence)
  ```
  Use a small badge row under the input. Keep the numeric input read-only as today, but add the CI line + a tooltip explaining the interval is derived from the vision model's stated confidence.
- Carry `ci_low/ci_high` into `persistSurvey` so they're saved alongside `estHHAi` (use the existing JSON survey row; no schema change required if stored inside an existing JSON column — otherwise the CI is shown in UI only and persisted in the next iteration).

---

## 3) Street View auto re-center on GPS improvement

**`StreetViewPanel.tsx` (Mapillary embed)**:
- Today the iframe `src` is built from props on first render. Because the iframe URL only changes when `lat/lng` props change, this already re-mounts on coordinate change — but only because React re-renders. The issue is the iframe **reloads jarringly every minor GPS jitter**.
- Add a `lastCenter` ref and only update the iframe `src` when:
  - the panel is open, AND
  - new fix's accuracy is **better** than the accuracy used for the current center (or improvement ≥ 5 m), OR
  - the new fix has moved > 25 m from the last center.
- To pass accuracy in, extend props from `{lat, lng}` to `{lat, lng, accuracy}` and update the single caller in `CESSurveyWorkflow.tsx` (line ~1680) to pass `gps.accuracy`.
- Use `key={\`${centerLat.toFixed(5)},${centerLng.toFixed(5)}\`}` on the `<iframe>` so React only re-mounts it when the chosen center actually changes — eliminating flicker on every `setGps` tick.
- Show a small "Re-centered to ±Xm fix" caption in the SheetHeader description for ~2 s after a re-center.

---

## Files touched

- `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` — perimeter capture logic, Step 2 CI display, pass `accuracy` to StreetViewPanel.
- `src/components/CoverageEvaluation/StreetViewPanel.tsx` — accuracy-aware re-center, stable iframe key, caption.
- `supabase/functions/ces-rooftop-count/index.ts` — prompt + response schema for CI.

No DB migrations, no new dependencies.
