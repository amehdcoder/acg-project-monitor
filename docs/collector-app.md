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
