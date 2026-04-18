---
name: Global Location Enforcement
description: Every form is gated by useLocationEnforcement — device location must be on with high-accuracy permission, GPS auto-captured silently on open, admin chain (State/LGA/Ward/Settlement) reverse-geocoded 100% offline from cached GRID3 settlements, submission blocked on permission revoke, missing fix, or accuracy >100m. Persistent header bar shows "📍 Ward, LGA | ±xm" on every form.
type: feature
---

# Global Location Enforcement

**Files:**
- `src/hooks/useLocationEnforcement.tsx` — permission gate, capture (max 2 attempts), watch for revoke, metadata builder
- `src/lib/locationEnforcement/reverseGeocoder.ts` — offline nearest-neighbor over `/data/grid3_settlements.json` (state-bbox fallback at >25km)
- `src/components/FormFiller/LocationGate.tsx` — full-screen blocker with platform-specific settings tips, auto re-checks every 5s
- `src/components/FormFiller/LocationHeaderBar.tsx` — persistent "📍 Ward, LGA | ±xm" tap-to-expand bar with low-accuracy warning >30m
- Wired into `src/components/FormFiller/FormFiller.tsx`

**Rules (apply globally, no form bypasses):**
- Block form open if permission denied / services off; modal re-checks every 5s
- 1st captured fix < 30m → "📍 Location secured" toast; failure twice → block form
- If form has a `geopoint` question, the user-captured coord OVERRIDES auto_gps for admin resolution; updates live on recapture
- Block submit if: status is `stale` (revoked mid-form), no GPS at all, or accuracy > 100m
- Every submission carries `data.form_metadata = { auto_gps, auto_gps_used, gps_question_used, final_admin_levels_source, gps_accuracy_m, location_capture_timestamp, resolved_admin }`

**Convergence sampler (the accuracy fix):** `getHighAccuracyFix()` does NOT use a single `getCurrentPosition` call — that returns the first cell/wifi network fix (often ±500–2000m) before the GNSS chip locks. Instead it opens `watchPosition` with `maximumAge:0`, samples every fix for 8–22s, rejects fixes >8s old (cached), and only resolves once accuracy converges to ≤20m (target) or ≤50m after 12s (acceptable), or hard-stops at 22s. A parallel one-shot seeds the sampler. After capture, the continuous watch keeps refining: replaces `autoGps` only when the new fix is ≥5m better, OR the previous is >30s stale and within 25%, OR user moved >50m. Re-resolves admin chain whenever GPS moves >200m. Issues an "GPS lock acquired" upgrade toast when accuracy crosses 30m post-capture.

**Offline guarantee:** GRID3 settlements JSON is preloaded on hook mount → cached by the PWA service worker → reverse geocoding works fully offline forever after first install.

**Capacitor:** Uses `@capacitor/geolocation` (web fallback transparent), so the same gate works in the native build.
