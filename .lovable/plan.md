# Plan: Background Walk Perimeter + Operations Tab Fix

## Part A — Robust Background Location for Walk Perimeter

Goal: keep capturing GPS vertices reliably while the user walks, even when the screen is off, the browser is backgrounded, or the OS suspends timers.

### Strategy (layered, with graceful fallbacks)

1. **Native (Capacitor builds)** — add `@capacitor-community/background-geolocation` plugin.
   - Configure with `backgroundMessage`, `distanceFilter: 3m`, high accuracy.
   - Plugin keeps the GPS chip awake on iOS/Android even when screen is off and the app is backgrounded.
   - Request `ACCESS_BACKGROUND_LOCATION` (Android) and `NSLocationAlwaysAndWhenInUseUsageDescription` (iOS) — patch `AndroidManifest.xml` snippet and `Info.plist` snippet documented in code comments (user runs `npx cap sync`).

2. **Web / PWA fallback** — three reinforcements stacked:
   - **Wake Lock API** (`navigator.wakeLock.request("screen")`) acquired on Start, released on Stop. Re-acquired on `visibilitychange`.
   - **Persistent `navigator.geolocation.watchPosition`** with `enableHighAccuracy:true, maximumAge:0, timeout:30000`. Auto-restart on error (debounced).
   - **Heartbeat watchdog** — `setInterval` every 5s checks "last fix age". If >15s, tears down and restarts the watch (recovers from browser throttling).
   - **Audible silent loop / Web Audio keep-alive** (optional, gated by user toggle) to reduce Safari background suspension.

3. **Permission UX**
   - Pre-flight permission check via `navigator.permissions.query({name:"geolocation"})` and Capacitor `checkPermissions()`.
   - If denied → show actionable toast with "Open Settings" deep-link (Capacitor `App.openSettings` on native; instructions on web).
   - If background permission missing on Android → guided dialog explaining why "Allow all the time" is required.

4. **Vertex pipeline hardening**
   - Buffer fixes in a `ref` queue; flush to React state on `requestAnimationFrame` so background ticks (where RAF is paused) still queue but don't drop fixes.
   - Persist live perimeter to `localStorage` after each commit so a crash/kill doesn't lose the walk.
   - On Resume (visibilitychange → visible), reconcile buffered fixes and resync map.

### Files

- New: `src/lib/ces/backgroundGps.ts` — unified API: `startBackgroundGps({onFix, onStatus})`, `stopBackgroundGps()`. Internally chooses native plugin vs web fallback. Exposes `requestPermissions()`, `keepAwake()`.
- Edit: `src/components/CoverageEvaluation/CESSurveyWorkflow.tsx` — replace current `startRealtimeGpsWatch` block with calls into the new util; add Wake Lock, watchdog, localStorage persistence, resume reconciliation, and a "Background tracking active" status pill.
- Edit: `package.json` — add `@capacitor-community/background-geolocation` (native only — safe to install; lazy-imported so web build is unaffected).
- Edit: `capacitor.config.ts` — add plugin config block.
- Docs comment block in `CESSurveyWorkflow.tsx` reminding the user to run `npx cap sync` and accept "Allow all the time" on Android.

## Part B — Fix the Operations tab on the Dashboard

Symptom: user cannot view the Operations sub-tab (renders `<PowerBIDashboard />` at line 392-394 of `src/components/Dashboard.tsx`).

Likely causes (will be verified during build):
1. `PowerBIDashboard` throws during render (e.g., Leaflet init against an unmounted ref, or a Recharts crash on empty data) and the tab has **no `<ErrorBoundary>` wrapper** — unlike the Management tab which wraps every widget. A throw silently unmounts the panel, leaving a blank area.
2. `fetchData()` hangs when `selectedProjectId` is null + 60-day window returns no rows → infinite spinner.
3. Leaflet `mapContainerRef` initialised before the tab becomes visible (Tabs lazy-mount), so `L.map()` runs against a 0×0 div and throws on subsequent panes.

### Fixes

- Wrap `<PowerBIDashboard />` in `<ErrorBoundary name="Operations Dashboard">` with a friendly retry fallback so any internal crash no longer blanks the tab.
- In `PowerBIDashboard.tsx`:
  - Guard the Leaflet init: only call `L.map(mapContainerRef.current)` after the container has non-zero dimensions; use a `ResizeObserver` to defer init until the tab is actually painted.
  - Defensive: ensure `fetchData` always calls `setLoading(false)` in a `finally` block; add a 20s safety timeout that surfaces an error state instead of hanging.
  - Empty-data guard for Recharts components (return an "No data yet" panel when arrays are empty) so charts can't throw on undefined accessors.
  - Memo-stable dependencies for `useEffect(fetchData)` to avoid render loops.
- Add a small inline diagnostic banner in dev mode showing fetch counts, so future regressions are visible.

### Files

- Edit: `src/components/Dashboard.tsx` (line 392-394) — wrap with `ErrorBoundary`.
- Edit: `src/components/Dashboard/PowerBIDashboard.tsx` — Leaflet ResizeObserver guard, `finally` cleanup, empty-state guards, watchdog timeout.

## Verification

- Operations tab renders without blanking; with no data the panel shows a clear empty state instead of a blank screen.
- On mobile (after `npx cap sync`), starting Walk Perimeter, locking the phone, and walking 50 m results in new vertices captured and visible when the screen is unlocked.
- On web PWA, backgrounding the tab for 30 s and returning shows queued vertices appended to the polyline.
- Permission denial paths show actionable toasts.

## Out of scope

- Changing data sources or RLS.
- Redesigning the Operations dashboard layout (only stability fixes).
