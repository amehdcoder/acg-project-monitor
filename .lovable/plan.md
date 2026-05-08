# Plan: CES 3D Village Mapping — Full Survey Workflow

## Scope (large feature, will ship in cohesive slices)

### 1. Database (one migration)
New tables (RLS: authenticated read/write own; admin all):
- `ces_surveys` — SurveyID, date, state, lga, ward, flhf_name, community, settlement_id, settlement_name, est_hh_ai, est_hh_user, target_sample_n, segments_count, inferred_coverage_pct, ci_lower_95, ci_upper_95, ci_lower_99, ci_upper_99, design_effect, precision, status (draft/completed/submitted/locked), supervisor_qc_by, supervisor_qc_at, created_by.
- `ces_segments` — SegmentID, survey_id, label (S1..SN), polygon (jsonb), centroid_lat/lng, color, est_hh, sampled_hh, treated_hh, coverage_pct, weight, is_selected, segment_status.
- `ces_households_v2` (or extend existing `ces_households`) — survey_id, segment_id, hh_number (HH001…), lat, lng, gps_accuracy, coverage_status (treated/not_treated/absent/refused/ineligible), commodity, notes, photo_url, device_id, interviewer_name, timestamp, synced_at.
- `ces_audit_log` — survey_id, action, actor, lat/lng, timestamp, payload.
Reuse existing `ces_capture_sessions` for the perimeter walk.

### 2. New library code
- `src/lib/ces/rooftopDetector.ts` — uses Lovable AI Gateway (`google/gemini-2.5-flash` vision) to count rooftops from a static Google Maps Satellite tile around centroid (returns estimated HH).
- `src/lib/ces/kmeansSegments.ts` — k-means clustering + Voronoi polygons → equal-area segment polygons with high-contrast color palette.
- `src/lib/ces/coverageStats.ts` — design-based weighted coverage, design effect, 95% & 99% CI; comparator vs microplanning treated counts (two-proportion z-test, returns z, p, agreement flag).
- `src/lib/ces/exporters.ts` — CSV, GeoJSON, PDF (via jspdf + html2canvas already in project) for 1-page report.
- `src/lib/ces/auditLog.ts` — fire-and-forget action logger.

### 3. New edge function
- `supabase/functions/ces-rooftop-count/index.ts` — accepts {lat,lng,zoom,radius_m}, fetches Google Static Maps tile (publishable key), calls Gemini vision, returns {estimated_households, confidence}.

### 4. UI overhaul (`src/components/CoverageEvaluation/`)
Replace current single-pane view with stepper:
- **Step 1 — Locate & Fence**: GPS lock (block <15 m accuracy fail), reuse `CESCaptureDialog` perimeter walk, Mapbox GL satellite + 3D terrain (`terrain-rgb`), Google Street View toggle.
- **Step 2 — Estimate & Sample**: rooftop AI count (editable), target N input, auto-segment count, k-means polygons drawn + colored, random segment highlighted blue.
- **Step 3 — Navigate & Interview**: OSRM route line to segment centroid, geofence watcher (toast on exit), tap-to-drop household pins with sequential numbering, household form sheet (status icons, commodity, notes, photo+EXIF, auto device id/timestamp), running tally `x of N`, "Sample Another Segment" button.
- **Step 4 — Coverage Map & Inference**: choropleth segments (green/yellow/red), inferred % with 95 % & 99 % CI, design effect, donut by status, comparison panel vs microplanning JRSM treated (z-test result + agreement badge).
- **Step 5 — Export & QC**: CSV / GeoJSON / PDF buttons, Supervisor QC lock button.
- Admin boundary inputs (State → LGA → Ward → FLHF → Community → Settlement) using existing `nigeriaAdminData.ts` cascading selects, identical UX to Geo Microplanning.
- 30 s autosave hook; GPS gate on pin drop (>20 m blocks); 80 % completion guard on submit.

### 5. Microplanning ↔ CES validator
In Step 4, fetch matching microplanning row by State+LGA+Ward+Community and run two-proportion test:
```
z = (p_ces - p_jrsm) / sqrt(p̂(1-p̂)(1/n_ces + 1/n_jrsm))
```
Show 95 % and 99 % CI bands and an "Agreement / Discrepancy" verdict.

### 6. Offline + sync
- IndexedDB cache via existing `useOfflineStorage`.
- Per-record `synced_at`; banner shows queued count; auto-flush on `online`.

### Technical notes
- Mapbox: use existing token pattern (already used elsewhere) or fall back to Leaflet + Esri World Imagery if no token — confirm with user.
- Google Static Maps requires `GOOGLE_MAPS_API_KEY`; will request via secrets if not present.
- All colors via semantic tokens; status icons colorblind-safe (shapes + colors).

### Out of scope for this pass
- True NeRF / photogrammetry (existing 2.5D capture stays).
- Native Capacitor offline tile pre-bundling (web cache only this round).

## Open question before I build
You'll need a **Google Maps / Static Maps API key** for rooftop AI counting + Street View, and ideally a **Mapbox token** for 3D terrain. If you don't want to add either, I'll fall back to Leaflet + Esri imagery and skip Street View / 3D terrain (still ships every other step).

Reply "go" to proceed with keys, or "go, fallback" to ship without Google/Mapbox.
