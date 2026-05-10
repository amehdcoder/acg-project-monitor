## Research Insights Tab (SEITF Schistosomiasis)

Add a new tab **`Research Insights`** to `src/components/MathModelingView.tsx` (after the existing `Scenarios` tab) that runs scripted simulation sweeps on the currently loaded SEITF preset and renders comparative charts + a plain-language interpretation card per research question. All simulations reuse the existing local RK4 engine (`localMathModelSimulation`) so no AI credits are consumed; an optional "Generate AI interpretation" button calls the existing `interpret_simulation` action.

### Scope

- Available only when the loaded preset is **`SEITF Model (NTD)`** (auto-detected via `compartments` signature, same pattern already used in lines 1485 / 2821). For other models the tab shows a friendly "Switch to SEITF (NTD) preset to unlock these analyses" panel.
- All sweeps run client-side in a `Promise.resolve().then(...)` chunked loop with a progress bar so the UI stays responsive.
- A configurable horizon picker (default 6 years = 2190 days, matching "by 2030") and an MDA program editor (start year, coverage, rounds/yr, # rounds) sit at the top of the tab and feed every analysis.

### Five analyses (one card each)

```text
┌─────────────────────────────────────────────────────────┐
│ 1. Never-Treated Sub-Population                         │
│    sweep frac_never ∈ {0, 5, 10, 20, 30}% of Shcn/Shan  │
│    metric: SAC infected (Ihce+Ihcn) over 30y + final R0 │
├─────────────────────────────────────────────────────────┤
│ 2. Systematic Non-Adherence vs Coverage × Frequency     │
│    grid coverage ∈ {50,65,75,85,95}% × freq {1,2,3/yr}  │
│    × adherence {systematic-skip 0/10/25%}               │
│    metric: years to SAC prevalence < 1%                 │
├─────────────────────────────────────────────────────────┤
│ 3. Exposure Heterogeneity (children vs adults)          │
│    sweep β_sac/β_adult ratio ∈ {1, 2, 4, 8}             │
│    × MDA target {SAC-only, community-wide}              │
│    metric: SAC prev reduction + adult reservoir Iha*     │
├─────────────────────────────────────────────────────────┤
│ 4. Optimal Combination to reach <1% SAC by 2030         │
│    grid coverage × adherence × freq, 6-y horizon        │
│    output: heatmap (coverage × freq) of "achieves <1%"  │
│    + table of cheapest passing combos (fewest rounds)   │
├─────────────────────────────────────────────────────────┤
│ 5. Snail / Environmental Dynamics                       │
│    toggle Fm/Fc/Ss/Es/Is ON vs frozen-at-equilibrium    │
│    × seasonal β multiplier sin(2πt/365)·amp {0,.3,.6}   │
│    metric: predicted vs simplified model SAC prev curve │
└─────────────────────────────────────────────────────────┘
```

### Implementation

- **New file** `src/lib/mathModeling/researchInsights.ts`
  - `runNeverTreatedSweep(preset, horizon)` → array of `{ frac, timeSeries, metrics }`
  - `runAdherenceCoverageGrid(...)` → returns a 3-D result with derived `yearsToTarget` (interpolated time at which Ihce+Ihcn / Sac-pop < 0.01).
  - `runExposureHeterogeneitySweep(...)`
  - `runOptimalCombinationGrid(...)` → returns `{ passing: combo[], heatmap: number[][] }`
  - `runSnailDynamicsComparison(...)`
  - All helpers build a modified copy of the SEITF preset (parameters, initialValues, optional pulseEvents for MDA) and call `localMathModelSimulation("simulate", payload)` from `aiCreditFallback.ts`.
  - Pure functions, no React imports, easy to unit-test later.

- **New file** `src/components/MathModeling/ResearchInsightsTab.tsx`
  - Receives `compartments`, `parameters`, `initialValues`, `timeConfig`, helpers from parent via props (mirrors how `CalibrationWorkspace` and `SensitivityWorkspace` are wired in `MathModelingView`).
  - Top toolbar: horizon (years), MDA program editor (coverage, rounds/yr, rounds), "Run all analyses" / per-card "Run" buttons, progress bar.
  - Five `Card`s, each rendering:
    - A short research-question header.
    - The most informative chart (Recharts `LineChart` for time-series sweeps, `BarChart` for years-to-elimination, custom CSS-grid heatmap for Q4).
    - A compact metrics table.
    - A "Generate AI interpretation" button that pipes a summarized payload through the existing `callMathModel("interpret_simulation", …)` (so behavior matches the other AI panels and respects credit fallback).

- **Edit** `src/components/MathModelingView.tsx`:
  - Add `ResearchInsightsTab` import.
  - Add `<TabsTrigger value="research">Research Insights</TabsTrigger>` and corresponding `<TabsContent value="research">…</TabsContent>` after the Scenarios block.
  - Pass current `compartments`, `parameters`, `initialValues`, `timeConfig`, `pulseEvents`, plus the existing `callMathModel` helper.

### Out of scope (this task)

- No DB schema changes; results live in component state (saving runs to the existing model artifacts table can be a follow-up).
- No new AI Gateway calls beyond reusing the existing `interpret_simulation` action.
- Other presets (SIR/SEIR/SIS/SIRS) won't get the SEITF-specific analyses — they're disease-shape-specific.

### Acceptance check

- Loading the SEITF preset unlocks the tab; running "All analyses" produces 5 populated cards in <30 s on a typical laptop with 6-y horizon and shows a "years to <1%" value for at least the high-coverage / high-adherence cells.
- Switching to SIR shows the friendly empty-state instead of crashing.
