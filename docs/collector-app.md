# Amehnities Collect — standalone collector app

A phone app for data collectors who have **no account**. They join a project by
scanning its QR code (or typing the project code + optional PIN), then fill
Forms and open Cases completely offline. Queued records sync automatically when
a connection returns.

## Enabling a project for account-free collection

1. Open **Projects**, use the project menu → **Collect without accounts**.
2. Turn it on and choose what devices may do: Forms, Cases, and (where set up)
   the See Clear facility checklist.
3. Optionally set a PIN and an expiry date.
4. Share the QR code or the 6-character project code with collectors.
5. Rotating the code revokes every device that joined with the old one.

## Building the collector app

```bash
npm run build:collect          # web bundle, collector flavour
APP_FLAVOR=collect npx cap sync
APP_FLAVOR=collect npx cap run android   # or: run ios
```

- App id: `com.amehnities.collect`, name: **Amehnities Collect**.
- The build boots straight into the join screen; once joined it always opens the
  Forms / Cases workspace with no login step.
- The regular full app is unchanged: `npm run build && npx cap sync`.

## Offline behaviour

- The project bundle (forms, case types, checklists) is cached on join.
- Cold boots read the cached session synchronously — no spinner, no network.
- Saved and finalised records live in IndexedDB and are pushed in batches of 25
  with retry/backoff by the shared device sync loop.

## Building a shareable APK for a real collector

Lovable's build environment has no Android SDK, so the APK is produced on your
own machine (or any CI runner with Android tooling):

1. **Export to GitHub** from Lovable, then `git clone` the repository.
2. Install prerequisites: Node 18+, **Java 17**, Android Studio (Android SDK,
   with `ANDROID_HOME` set).
3. Run:

   ```bash
   npm install
   npm run collect:apk
   ```

4. The script builds the collector bundle, syncs Capacitor, assembles the APK
   and copies it to `./Amehnities-Collect.apk`.

### Sending it to a data collector

- Share `Amehnities-Collect.apk` by WhatsApp, Drive link or email.
- On the phone: open the file → allow **Install unknown apps** for the app doing
  the opening → **Install**.
- Launch **Amehnities Collect** → scan the project QR code (Projects → project
  menu → *Collect without accounts*) or type the 6-character code and PIN.
- Then turn airplane mode on and confirm forms still open, fill and save; the
  records sync automatically once data returns.

For Play Store distribution use `./gradlew bundleRelease` with your own signing
keystore instead of the debug APK above.
