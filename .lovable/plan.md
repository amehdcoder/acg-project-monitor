
## Status of your seven asks

Four are **already shipped** in the previous turn — confirming so we don't redo them:

1. ✅ Live donor/government insight strip (vertices · walked · GPS quality · area/closure) in Step 2.
2. ✅ Top-notch Walk Perimeter capture + live "Stop · N pts" button with count-up flash and walked/closure sub-line.
3. ✅ OSM-based residential mask used by `buildSegments()` (roads / rivers / schools / hospitals excluded).
4. ✅ Segment-centroid snap to nearest residential building (`snapToNearestResidential`, ≤80 m).

The remaining **three** items are what this plan implements.

---

## 1. Toggleable map overlay for excluded features

**Goal:** during Step 2, let the user flip on a layer that visually shows what the smart placement is avoiding (red dashed = roads, blue dashed = waterways, grey hatched = non-residential).

### Changes

- **`src/components/CoverageEvaluation/CESSurveyMap.tsx`**
  - Add two new optional props:
    - `exclusionZones?: { roads: Pt[]; waterways: Pt[]; nonResidential: Pt[] }`
    - `showExclusions?: boolean` (default `false`)
  - Inside the existing Leaflet effect, when `showExclusions && exclusionZones`, draw a small `L.circle` for each feature using the per-feature `bufferM` as radius and a category-specific style:
    - roads → `color: hsl(var(--destructive))`, `dashArray: "4 4"`, `weight: 1`, `fillOpacity: 0`
    - waterways → `color: #2563eb`, `dashArray: "2 4"`, `weight: 1`, `fillOpacity: 0`
    - non-residential → `color: hsl(var(--muted-foreground))`, `fillOpacity: 0.12`, `dashArray: "1 3"`
  - Cap each category at the first 400 features to keep render cheap.
  - Add to the deps array.

- **`src/components/CoverageEvaluation/CESSurveyWorkflow.tsx`**
  - Add `const [showExclusionLayer, setShowExclusionLayer] = useState(false);`
  - In Step 2 controls row, add a small `<Switch>` + label `"Show excluded zones"` (only when `residentialMask` is loaded).
  - Pass `exclusionZones={residentialMask?.exclusionZones}` and `showExclusions={showExclusionLayer}` to **both** Step 2 maps (the perimeter map and the segments map).
  - Tiny legend strip under the toggle: three coloured chips (Roads · Waterways · Non-residential) shown only while the layer is on.

---

## 2. Resample-reasons review section (current survey)

**Goal:** in Step 5, surface every resample reason captured for this survey so the user can audit what was documented.

### Changes (frontend only)

- **`CESSurveyWorkflow.tsx`**
  - New state: `const [resampleHistory, setResampleHistory] = useState<Array<{ id: string; segment_label: string; reason: string; created_at: string }>>([])`.
  - New effect: when `step === 5 && surveyId`, fetch
    ```ts
    supabase.from("ces_segment_resamples")
      .select("id, segment_label, reason, created_at")
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: true });
    ```
  - Render a new card section in Step 5 (placed above "Sample Completion"):
    - Title: `Resample Justifications` with a `Shuffle` icon and a count badge.
    - If empty → muted text: `No additional segments were resampled for this survey.`
    - Otherwise → ordered list, each row showing: `#i · Segment {label}` (bold), the reason (wrapped, no truncation per project memory), and `formatDistanceToNow(created_at)` muted.
  - Also surface `outside_microplan` here when true: a single amber `Alert` reading `Outside microplanned communities — Reason: {outsideMicroplanReason}`.

- The data is also embedded into exports (see §3); no schema changes needed since the table already exists with the right RLS.

---

## 3. Export `outside_microplan`, `outside_microplan_reason`, and resamples to CSV / GeoJSON / PDF / Google Sheets / Looker

### 3a. CSV (`exportCSV` in `CESSurveyWorkflow.tsx`)

Add three columns to every household row (constant per survey):
- `Outside_Microplan` → `"Yes" | "No"`
- `Outside_Microplan_Reason` → string or `""`
- `Resample_Count` → number of `resampleHistory` entries
- Add **one trailing summary row** per resample (so analysts can pivot in Excel) with `RowType = "RESAMPLE"`, `SegmentID`, `Resample_Reason`, `Resample_At`. Households get `RowType = "HOUSEHOLD"`.

### 3b. GeoJSON (`exportGeoJSON`)

- Add survey-level properties to each segment Feature: `outside_microplan`, `outside_microplan_reason`.
- For every resample with a known segment label, attach `resample_reasons: string[]` to that segment's Feature properties.
- Add a top-level `featureCollection.properties = { outside_microplan, outside_microplan_reason, resamples: resampleHistory }` (Mapbox/Looker tolerate this; QGIS ignores it harmlessly).

### 3c. PDF (`generateCESReportPDF` / `exportPDF`)

- Pass two new optional fields into `generateCESReportPDF`:
  - `outsideMicroplan?: { flag: boolean; reason: string | null }`
  - `resamples?: Array<{ segmentLabel: string; reason: string; at: string }>`
- In `src/lib/ces/exporters.ts` `generateCESReportPDF`, add a new compact section "Microplan Status & Resamples" rendered after the QC section, with a flagged badge + bullet list of resample reasons (truncate list at 8 with `… +N more`).

### 3d. Google Sheets / Looker Studio (`supabase/functions/sync-google-sheets/index.ts`)

Two additive changes — no breakage to existing `sync` action:

1. **Extend the form_submissions row** when sheet sync is triggered with a CES survey id: when a submission's `data` contains `_ces_survey_id`, the function fetches the matching `ces_surveys` row and augments the row with `Outside Microplan`, `Outside Microplan Reason`, `Resample Count`. (Cheap: single batched `select … in ('a','b',…)`.)

2. **New action `sync_ces`** (Looker-friendly, two sheets):
   - Body: `{ action: "sync_ces", spreadsheetId, projectId?, surveyIds?, sheetPrefix? }`
   - Sheet **`CES_Surveys`** — one row per survey with columns:
     `Survey ID, Project, Form, Survey Date, State, LGA, Ward, FLHF, Community, Settlement, Status, Outside Microplan, Outside Microplan Reason, Est HH (User), Est HH (AI), Target N, Sampled HH, Treated HH, Inferred Coverage %, CI95 Lower, CI95 Upper, Design Effect, Resample Count, Created At, Created By`.
   - Sheet **`CES_Resamples`** — one row per `ces_segment_resamples` entry:
     `Survey ID, Community, Segment Label, Reason, Created At, Created By`.
   - Uses the existing `clearAndWriteSheet` helper. Service-role client (already set up). RLS bypass via service role is fine because the function authenticates the caller via the existing pattern (no change there).

3. Frontend hook (`src/components/IntegrationsView.tsx` or wherever the CES export button sits — to be confirmed during build): add a "Sync CES surveys to Sheets" button that calls `supabase.functions.invoke("sync-google-sheets", { body: { action: "sync_ces", spreadsheetId, projectId } })`.

### Files touched in §3

- `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` — exportCSV / exportGeoJSON / exportPDF call site, resample fetch.
- `src/lib/ces/exporters.ts` — extend PDF signature + render section.
- `supabase/functions/sync-google-sheets/index.ts` — augment form rows + new `sync_ces` action.
- `src/components/IntegrationsView.tsx` — small new button (read first to confirm placement; fall back to a CES Step 5 button if the integrations view doesn't fit).

---

## Out of scope

- No DB schema changes — `ces_segment_resamples`, `outside_microplan`, `outside_microplan_reason` already exist.
- No changes to AI rooftop count, GPS subscription, or Step 1/3/4 flows.
- No new dependencies.

## Risks

- Overlay rendering large OSM bboxes could slow Leaflet → mitigated by 400-feature cap per category.
- `sync_ces` cross-table joins remain in app code (not SQL) to avoid coupling — fewer than 1k surveys per project in practice.
