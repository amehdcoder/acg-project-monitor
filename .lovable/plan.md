
## Goal

Two improvements to **Step 2 / Walk Perimeter** in `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`:

1. **Smart segmentation** — segments and synthesized households should sit only on residential structures, never on roads, rivers, schools, hospitals or other non-residential land use.
2. **Top-notch live Walk Perimeter telemetry** — capture every meaningful GPS vertex while the user walks, and surface that progress live on the "Stop (n pts)" button plus a compact insight strip useful to donors and government stakeholders.

---

## 1. Smart, non-residential-aware segmentation

Currently `buildSegments()` picks random points inside the perimeter bounding box, so synthesized households (and therefore the k-means segment centroids) can land on roads, rivers, school yards, hospital compounds, etc.

### New helper: `src/components/CoverageEvaluation/utils/residentialMask.ts`

A small client-side utility built on the **OpenStreetMap Overpass API** (`https://overpass-api.de/api/interpreter`, no key required, falls back to `https://overpass.kumi.systems/api/interpreter`).

For a given perimeter polygon it returns:

```ts
type ResidentialMaskResult = {
  residentialBuildings: Array<{ lat: number; lng: number }>; // building centroids
  exclusionZones: {
    roads: Array<{ lat: number; lng: number; bufferM: number }>;     // highway=*
    waterways: Array<{ lat: number; lng: number; bufferM: number }>; // waterway=* / natural=water
    nonResidential: Array<{ lat: number; lng: number; bufferM: number }>; // hospital/school/clinic/place_of_worship/industrial/commercial/government/cemetery
  };
  source: "osm-overpass";
  fetchedAt: number;
};
```

Overpass query (single call, bbox of perimeter):

```text
[out:json][timeout:25];
(
  way["building"](bbox);
  way["highway"](bbox);
  way["waterway"](bbox);
  way["natural"="water"](bbox);
  way["amenity"~"hospital|clinic|school|college|university|place_of_worship|government|police|fire_station"](bbox);
  way["landuse"~"industrial|commercial|cemetery|education|institutional"](bbox);
);
out tags center;
```

Classification rules (per way):

- **Residential building** if `building` ∈ {`yes`, `house`, `residential`, `apartments`, `detached`, `bungalow`, `semidetached_house`, `terrace`, `hut`, `farm`} AND none of the exclusion tags above are set.
- **Excluded** otherwise — recorded in `exclusionZones` so we can both filter samples and visualize them.

A 4-hour in-memory + `localStorage` cache keyed by rounded bbox to keep Overpass usage gentle.

### Refactor `buildSegments()`

Replace the current "random points in bbox" block with:

1. Resolve the working perimeter (existing `peri` logic).
2. Call `getResidentialMask(peri)`.
3. Build the household point set:
   - **Primary**: use `residentialBuildings` clipped to the perimeter polygon (point-in-polygon).
   - If `residentialBuildings.length >= max(20, N * 0.5)` → sample N from them (with replacement only if needed).
   - Otherwise fall back to the current random-bbox synthesis BUT reject any candidate that:
     - lies within `bufferM` of a road (default 6 m) / waterway (8 m) / non-residential polygon centroid (15 m), OR
     - lies outside the perimeter polygon.
   - Hard fallback: if Overpass fails, log a warning and use today's behavior so the workflow never blocks.
4. Run `kmeansSegments` on the cleaned points (unchanged).
5. After clustering, **snap each segment centroid to the nearest residential building centroid** in its cluster so segment markers never sit on a road or river.

### UI affordances (Step 2)

- Small badge above the map: `Smart placement: avoiding roads, rivers, schools, hospitals (OSM)` with a tooltip explaining the exclusion classes. Badge turns amber if Overpass failed and we used the fallback, with a "Retry" button.
- Optional subtle overlay layer in `CESSurveyMap` showing exclusion zones (roads as red dashed lines, waterways as blue dashed, non-residential as hatched grey). Toggle defaults to off; controlled by a new `showExclusionLayer` boolean. (Layer rendering only — no other map behavior changes.)

### Files touched (segmentation)

- **new** `src/components/CoverageEvaluation/utils/residentialMask.ts`
- **edit** `CESSurveyWorkflow.tsx` — `buildSegments` + small badge UI
- **edit** `CESSurveyMap.tsx` — optional exclusion overlay (additive, off by default)

---

## 2. Top-notch live Walk Perimeter telemetry

The vertex-capture logic itself (≤10 m accuracy gate, 1.5 s rolling-window best-fix selection, distance gate `max(2×acc, 5 m)`) is solid and stays. The upgrade is **what we surface to the user while walking**.

### New live telemetry state

Computed from `perimeter` + the rolling GPS stream:

```ts
type WalkTelemetry = {
  vertices: number;             // perimeter.length
  walkedM: number;              // cumulative haversine distance along the polyline
  lastVertexAgoS: number;       // seconds since last accepted vertex
  liveAccuracyM: number | null; // gps.accuracy
  bestAccuracyM: number;        // perimeterBestAccRef.current
  estAreaM2: number | null;     // shoelace area on closed/near-closed polygon, else null
  closureM: number | null;      // distance from current GPS to first vertex (when ≥3 pts)
  pace: "good" | "slow" | "stationary"; // derived from vertex cadence + speed
};
```

`walkedM` is updated inside the existing perimeter `useEffect` whenever a vertex is accepted; `lastVertexAgoS` ticks via a 500 ms interval while `recordingPerimeter` is true. `estAreaM2` uses an equirectangular-projected shoelace on the current `perimeter` (treated as closed by appending the first point virtually).

### "Stop (n pts)" button — live, glanceable

Replace the single-line button label with a richer composition (still inside the existing `<Button variant="destructive">`):

```text
┌──────────────────────────────────────┐
│  ● Stop  ·  12 pts                   │
│  248 m walked  ·  ±4 m  ·  closes 18 m │
└──────────────────────────────────────┘
```

- Pulsing red dot while recording.
- The `12 pts` number animates (count-up) on each new vertex via a brief `scale-110` flash (`transition-transform`, 200 ms) so movement is visible at a glance.
- Sub-line uses `text-[10px] opacity-90` to stay compact.

Resting state stays `"Walk Perimeter"` with the navigation icon.

### Stakeholder insight strip (new)

Directly under the controls row, when `recordingPerimeter || perimeter.length > 0`, render a compact 4-tile strip styled with semantic tokens (`bg-muted/40`, `border-border`, `text-foreground`):

| Tile         | Value                                  | Sub-label                          |
|--------------|----------------------------------------|------------------------------------|
| Vertices     | `12`                                   | `+1 just now` / `accepted`         |
| Walked       | `248 m`                                | `pace: good`                       |
| GPS quality  | `±4 m` (color: green ≤5, amber ≤10, red >10) | `best ±3 m`                  |
| Area / closure | `~6,400 m²` once ≥3 pts, else `closes in 18 m` | `tap Stop near start` |

Tile values use `tabular-nums` so they don't jitter as they update. The whole strip is wrapped in `aria-live="polite"` so screen readers and (importantly) live demo audiences pick up the changes.

### Auto-close polish

Keep the existing 15 m auto-close on stop. Add: while recording, when `closureM <= 15` and `vertices >= 6`, show a green hint `Ready to close — return to start and tap Stop.` This makes the "complete the loop" action obvious to first-time field users in front of stakeholders.

### Files touched (telemetry)

- **edit** `CESSurveyWorkflow.tsx` — derive `WalkTelemetry`, restyle the Stop button content, add the insight strip + close-ready hint
- No new dependencies.

---

## Out of scope (not changing)

- Database schema, RLS, edge functions.
- AI rooftop count edge function.
- Step 1 administrative cascade, Step 4 microplan flow, resample dialog.
- Existing GPS lock / accuracy-gate logic (kept as-is).

---

## Risks and mitigations

- **Overpass availability / rate limits** — cache by bbox, dual endpoint fallback, graceful degradation to the old synthesis path with a visible amber badge.
- **Sparse OSM coverage in rural Nigeria** — fallback synthesis still runs but with road/water/non-residential buffer rejection from whatever Overpass *did* return, so even partial OSM data improves quality.
- **Battery / GPS load** — no change to the GPS subscription cadence; only added derived state.
