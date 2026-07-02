#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# apply-android-splash.sh
#
# Removes the Android launch/splash screen so the app opens straight into the
# WebView with only a solid background color (matching first paint) — no logo,
# no spinner, no perceptible splash.
#
# Run this AFTER `npx cap add android` (and after every `npx cap sync android`,
# since sync can regenerate res/values files).
#
# Usage:
#   npm run build
#   npx cap sync android
#   ./scripts/apply-android-splash.sh
#   npx cap run android         # or open in Android Studio and Run
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$ROOT/android/app/src/main/res"
SRC="$ROOT/android-splash"

if [ ! -d "$ROOT/android" ]; then
  echo "ERROR: android/ not found. Run 'npx cap add android' first." >&2
  exit 1
fi

echo "→ Applying no-splash launch theme…"
mkdir -p "$RES/values"
cp "$SRC/values/styles.xml"  "$RES/values/styles.xml"
cp "$SRC/values/colors.xml"  "$RES/values/colors.xml"

# Remove any bitmap splash drawables Capacitor may have generated so nothing
# is drawn during the launch window.
find "$RES" -type f \( -name "splash.png" -o -name "splash.xml" \) -print -delete 2>/dev/null || true

echo "✓ Android launch theme patched. Rebuild the app to see the change."
