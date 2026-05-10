## Current state — already shipped

Walking through `CESSurveyWorkflow.tsx`, `sync-google-sheets/index.ts`, `kmeansSegments.ts` and `utils/residentialMask`, almost every item in the request is already implemented:

| Request | Status | Where |
|---|---|---|
| Live insight strip (vertices, walked, GPS accuracy, area/closure) | ✅ | `walkTelemetry` strip, lines 1882–1922 |
| Toggleable map overlay for roads / waterways / non-residential | ✅ | `showResidentialLayer` + `showExclusionLayer` switches, lines 1837–1879; rendered via `CESSurveyMap` |
| Walk Perimeter live "Stop · N pts" button with walked m & accuracy | ✅ | Button at lines 1781–1804 |
| OSM residential-only mask | ✅ | `getResidentialMask`, `residentialMask`, smart-placement badge (1818–1828) |
| Resample reasons listed for current survey | ✅ | "Resample Justifications" panel in Step 5, lines 2279–2310 (uses `resampleHistory`) |
| Export includes `outside_microplan`, `outside_microplan_reason`, `ces_segment_resamples` | ✅ | `sync-google-sheets/index.ts` writes `CES_Surveys` (cols 583–584) + dedicated `CES_Resamples` sheet (552–612) |
| Snap segment centroid to nearest residential building | ✅ | `buildSegments` post-cluster snap, lines 861–869 |

## Proposed plan — verify + small polish

Since the functionality is in place, the plan focuses on (a) a quick visual audit and (b) three small UX polish items so the existing features are easier to find and clearly framed for donor / government audiences.

### 1. Verify in preview
Walk through `?tab=coverage-eval`:
- Open a CES survey → Step 1: confirm the four-tile telemetry strip and Stop button counters update live as GPS ticks.
- Toggle "Show residential buildings" / "Show excluded zones" and confirm the legend + map layers respond.
- Step 2: build segments and confirm centroids land on a residential building (not on a road).
- Step 5: confirm the "Resample Justifications" panel lists historical entries.
- Trigger the Google Sheets sync and confirm `CES_Surveys` has `Outside Microplan` / `Outside Microplan Reason` columns and `CES_Resamples` is populated.

### 2. Small UX polish (frontend only)

- **Donor/Government framing on the telemetry strip**: rename the strip card heading to "Field evidence — live" with a small "Donor / Gov view" badge, and add a tiny tooltip on each tile explaining what it certifies (e.g. "Vertices = number of GPS waypoints recorded along the perimeter walk").
- **Layer toggle persistence**: persist `showResidentialLayer` / `showExclusionLayer` in `localStorage` so the user's preferred overlay state survives reloads.
- **Resample panel visibility**: surface the count of resample justifications as a chip on the Step 5 stepper button (e.g. `5. Export & QC · 2`) so reviewers know there's documented audit content waiting.

### 3. No backend / DB changes
No migrations, no edits to `sync-google-sheets`, no schema changes. The OSM mask, snapping, telemetry, and export are already wired correctly — verifying first avoids unnecessary churn.

## Technical notes
- All edits stay inside `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`.
- Persistence via `localStorage` keys `ces:showResidentialLayer` / `ces:showExclusionLayer`, hydrated on mount.
- Stepper chip uses the existing `resampleHistory.length` already in component state.

If you'd rather I add genuinely new behavior (e.g. an exportable "donor brief" PDF block, or stricter snap-to-building radius enforcement), tell me which and I'll revise the plan.