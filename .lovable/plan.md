## Goals
1. Stop blocking the workflow on GPS accuracy — only **recommend** higher accuracy.
2. Make GPS acquisition more reliable **indoors / weak-signal** locations.
3. Upgrade the satellite map to **deep-zoom hi-res** with a **street-level "what's actually there"** panel.

---

## 1) Remove all accuracy hard-gates (`src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`)

Keep `accuracyOk` / `accuracyColor` only for **visual recommendations**, not for disabling features.

| Location | Change |
|---|---|
| Line ~435 (auto-advance Step 1→2) | Drop `gps.accuracy > 25` check; advance as soon as `gps` exists and admin fields are filled. |
| Line ~518 (drop pin in Step 3) | Remove the `if (gps.accuracy > 20) return` block. Pin is allowed at any accuracy; show advisory toast only if >50 m. |
| Line ~1084 ("Walk Perimeter" button) | Remove `disabled={!gps || gps.accuracy > 50}`; disable only when `!gps`. Rename "Force Start Perimeter" → "Walk Perimeter" (single label). |
| Line ~1115–1130 (Continue button handler) | Remove the `canProceedAccuracy` block and its destructive toast. Keep only the `!gps` guard. |
| Lines 988–1006 (status alerts) | Convert >50 m destructive alert into an **amber recommendation** ("Best results: <15 m. Indoors? Move to a window or stay still for ~10s."). Keep the green "locked" alert. |

Acceptance: every action that previously refused on accuracy now proceeds; UI continues to show colored ±X m hint and recommendation chip ("High precision" / "Recommended: <15 m").

---

## 2) Strengthen indoor GPS capture (same file, GPS lock block ~lines 179–290)

Add a **hybrid acquisition strategy**:

- **Fast seed**: on mount, immediately call `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: false, maximumAge: 60_000, timeout: 5000` so a cached cell/Wi-Fi fix populates the map within ~1 s indoors.
- **Two parallel watches** (kept in `watchHighRef` and `watchLowRef`):
  - High-accuracy watch: `enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000` (was 15 s, was 500 ms).
  - Low-accuracy watch: `enableHighAccuracy: false, maximumAge: 5000, timeout: 30_000` — provides Wi-Fi/cell fallback when GPS chip can't see sky.
- **Best-of merge**: `setGps` takes whichever fresh reading has the *better* accuracy within the last 8 s. If only the low-accuracy stream is firing, we still update the marker (instead of "GPS…" forever).
- **Indoor kickstart**: a 10 s interval that, while no fresh fix has arrived, re-issues `getCurrentPosition` to pulse the radios.
- **LKG**: store *every* better-than-current fix (drop the hard <20 m gate so indoor LKG still works).
- Cleanup tears down both watches + the interval on unmount.

Add a small chip "Indoor mode" that lights up when only the low-accuracy stream is feeding the marker, so users know the position is Wi-Fi-derived.

Acceptance: opening the workflow indoors shows a position bubble within ~3 s (cached fix), the marker keeps updating as the user walks, and `gps` is never `null` for >10 s on a device with location services on.

---

## 3) Hi-res satellite + street-level realtime panel (`src/components/CoverageEvaluation/CESSurveyMap.tsx`)

### 3a. Deeper, sharper satellite
- Switch to layered Esri World Imagery setup:
  ```ts
  L.tileLayer(esriImageryUrl, {
    maxZoom: 22,        // allow user to zoom past native
    maxNativeZoom: 19,  // Leaflet upscales 19→22 for sub-meter feel
    detectRetina: true, // serve @2x tiles on hi-DPI screens
    crossOrigin: true,
  });
  ```
- Add an Esri **Reference labels overlay** (`World_Boundaries_and_Places`) on top of imagery so streets, neighborhoods, and POI names are always readable in satellite mode.
- Set the Leaflet map options `{ zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.25, wheelPxPerZoomLevel: 80 }` for fine-grained zooming.

### 3b. Honest "street view" panel
> Note for the user: there is no public free *real-time* sub-meter satellite feed of people walking. The closest free, no-key option is **Mapillary** (community-uploaded street-level imagery — buildings, landmarks, and pedestrians captured during recent walks/drives).

- Add a "Street View" button next to the existing `BasemapToggle` in Step 1.
- Clicking it opens a side panel / `Sheet` that embeds Mapillary's public viewer for the current `gps` coordinate (`https://www.mapillary.com/embed?map_style=Mapillary+streets&image_key=&x=...&y=...&style=photo`). No API key required.
- Live overlays already in place stay: user's GPS marker (pulsing dot), recorded perimeter polyline, segment K-means clusters, and household pins. We add a small "Live" badge anchored to the user marker that reflects the freshest GPS timestamp.

### 3c. New basemap option: "Hybrid"
Extend `BasemapToggle` with a fourth value `"hybrid"` (satellite + labels overlay always on). Make it the default for Step 1.

Acceptance:
- Zooming on the satellite basemap now goes to z22 and stays sharp (slightly soft at z20–22 due to upscaling — expected).
- "Street View" button opens a Mapillary embed centered on the user's coordinates and refreshes when the user moves >25 m.
- Streets, place names, and major landmarks are visible on satellite mode without switching to street basemap.

---

## Out of scope / honest limits
- True **Google-Street-View parity (panning, time-of-day, recent imagery everywhere)** requires a paid Google Maps API key. We can wire a `VITE_GOOGLE_MAPS_API_KEY` later if you want; the plan above ships the best free experience without one.
- "People moving in realtime" from satellites is not available from any public free provider. Live people positions in this app come from teammates' devices (already shown via FieldActivityTracker) — happy to surface their live dots on this map in a follow-up.

## Files touched
- `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` — sections 1 & 2.
- `src/components/CoverageEvaluation/CESSurveyMap.tsx` — section 3a/3c, expose `mapInstance` and add street-view button hook.
- `src/components/CoverageEvaluation/StreetViewPanel.tsx` (new) — Mapillary embed.

No DB changes, no new dependencies.
