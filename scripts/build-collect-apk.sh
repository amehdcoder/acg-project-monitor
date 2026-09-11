#!/usr/bin/env bash
# Build a shareable "Amehnities Collect" Android APK from the collector screens.
#
# Run this on your own computer (Lovable's sandbox has no Android SDK).
# Requirements: Node 18+, Java 17, Android Studio / Android SDK, ANDROID_HOME set.
#
#   npm install
#   npm run collect:apk
#
# The finished file is copied to ./Amehnities-Collect.apk — that single file is
# what you send to a data collector to install on their Android phone.

set -euo pipefail

echo "==> 1/4  Building the collector web bundle"
VITE_APP_FLAVOR=collect npm run build:collect

if [ ! -d android ]; then
  echo "==> Adding the Android project (first run only)"
  APP_FLAVOR=collect npx cap add android
  bash scripts/apply-android-splash.sh || true
fi

echo "==> 2/4  Syncing the bundle into the Android project"
APP_FLAVOR=collect npx cap sync android

echo "==> 3/4  Assembling the APK"
cd android
./gradlew assembleDebug
cd ..

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "APK not found at $APK" >&2
  exit 1
fi

cp "$APK" ./Amehnities-Collect.apk
echo "==> 4/4  Done: $(pwd)/Amehnities-Collect.apk"
echo "Send this file to the collector. On the phone: open it, allow"
echo "\"Install unknown apps\", install, then scan the project QR code."
