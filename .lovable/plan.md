# Project-Centred App with Account-Free Data Collection (KoboCollect style)

## Goal

Make Projects the organising centre of the app, and let a project owner switch a
project into **Open Collection** mode. In that mode field staff install the app,
scan a QR code (or type a short project code + PIN), and get straight to that
project's Forms and Cases pages — no email, no account, no password. Everything
keeps working with no network at all: opening the app, filling forms, saving,
and queuing records until a connection appears.

Nothing changes for today's signed-in users and their projects. Existing
projects stay exactly as they are until the owner explicitly turns Open
Collection on for one.

## What the owner sees

- Each project gets an **Access** panel: Standard (accounts only, the default and
  the current behaviour) or Open Collection (accounts + QR enrolment).
- Turning on Open Collection produces:
  - a QR code and a printable/downloadable card,
  - a 6-character project code plus an optional numeric PIN,
  - which pages the enrolled device may see (Forms, Cases, or both),
  - an optional expiry date and a "revoke all devices" button.
- A device list per project: nickname, first seen, last sync, records sent, with
  a per-device revoke.

## What the collector sees

1. Opens the app, taps **Join a project** on the sign-in screen.
2. Scans the QR code (camera) or enters the project code and PIN manually.
3. Names the device/collector (e.g. "Aisha - Kaugama 3"), and lands directly on
   the project's Forms page. Cases appear only if the project allows it.
4. From then on the app opens straight into that project, even fully offline —
   no sign-in screen, no spinner, no network needed.
5. Records save locally as Draft, Finalized then Sent, and upload automatically
   whenever connectivity returns. A queue badge shows what is still pending.

## Technical design

### Enrolment and identity
- New tables: `project_access_configs` (project, code hash, PIN hash, allowed
  pages, expiry, active flag) and `project_devices` (project, device id, label,
  enrol time, last seen, revoked flag). Both service-role only; no anon reads.
- New edge function `project-enroll`: takes code + PIN + device label, verifies
  against the config, registers the device, and returns a signed device token
  (HMAC, project-scoped, revocable) plus the project's forms/case-type bundle.
- New edge function `project-collect`: verifies the device token on every call
  and performs submission inserts with the service role, stamping
  `device_id`/`collector_label` instead of a user id. Submissions from devices
  are flagged so dashboards can distinguish them.
- Token and bundle are stored encrypted-at-rest in IndexedDB; the app never
  needs Supabase auth for these devices.

### Routing and shell
- `DeviceSessionProvider` sits beside `AuthProvider`. `ProtectedRoute` resolves
  in this order: signed-in user → enrolled device → `/auth`.
- New routes: `/join` (scan/enter code) and a device-mode shell that renders the
  existing `FormsView` and `CasesView` scoped to the enrolled project, with the
  rest of the navigation hidden.
- Projects become the entry surface for signed-in users too: the project picker
  drives the Forms/Cases/Dashboard scope already present in `Index.tsx`, with a
  clearer project switcher in the header.

### Offline behaviour (KoboCollect parity)
- The enrolment response caches the full form definitions, choice lists, case
  types and geography for the project, so forms render synchronously offline.
- Reuse the existing `savedForms` IndexedDB lifecycle (draft → finalized → sent)
  and its device-id conflict merge; add a device-token sync path alongside the
  current authenticated path.
- A single outbound queue with exponential backoff, resumable attachment
  uploads, and per-record error state visible in the Saved Forms manager.
- Service worker already precaches the shell; extend it so `/join` and the
  device shell are guaranteed offline-openable on a cold start.

### Safety
- Device tokens are project-scoped, expiring and revocable; revoking a device
  rejects its next sync and wipes its cached bundle.
- Codes and PINs are stored hashed; enrolment attempts are rate-limited and
  audited.
- All existing RLS stays untouched — device writes go only through the edge
  function, never through the browser client.

## Build order

1. Tables, hashing, and the owner-facing Access panel + QR generation.
2. `project-enroll` edge function and the `/join` screen (scan + manual entry).
3. Device session provider, routing, and the device-mode Forms/Cases shell.
4. `project-collect` submission path and the offline queue integration.
5. Device management (list, revoke, expiry) and enrolment audit.
6. Project-centred navigation polish for signed-in users.
