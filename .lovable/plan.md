# Offline Validation Hardening + Interactive Sync Conflict Resolution

The app already has a strong client-side foundation: a self-contained skip-logic engine (`skipLogic.ts`), a comprehensive `validateForm` in `FormFiller.tsx` (required, regex, numeric min/max, geofence — all client-side, no API calls), a deterministic merge engine (`savedFormMerge.ts`), an idempotency contract (`syncContract.ts`), and per-record device/rev tracking. This plan fills the specific gaps requested.

## Part 1 — Validation Engine Hardening (client-side only)

New file `src/lib/formFieldValidation.ts` — a single pure module (no network) that centralizes field-level rules so both `FormFiller` validation loops share identical logic:

- **No negative numbers**: for `number` fields, if no explicit `validation.min` is set, enforce `min = 0`. Explicit negative minimums are still respected (e.g. temperature fields).
- **No future dates**: for `date` / `datetime` fields, reject values after today unless the question explicitly opts in via `validation.allowFuture`.
- **Regex + numeric bounds**: reuse existing regex/min/max checks, consolidated here.

Wire this helper into both existing loops in `validateForm` (ungrouped + grouped/repeat questions) in `src/components/FormFiller/FormFiller.tsx`. Submit is already blocked when `errors` is non-empty and `scrollToFirstError` already flags the first invalid field — this is preserved and now also covers negatives/future-dates. Add a compact "N fields need attention" indicator near the submit button that jumps to the first error.

```text
number field  → min defaults to 0 (block negatives)
date field    → value > today ? error : ok  (unless allowFuture)
```

## Part 2 — Server-Side Revision Tracking (DB migration)

Add optimistic-concurrency versioning to `form_submissions`:

- New column `version integer NOT NULL DEFAULT 1`.
- A `BEFORE UPDATE` trigger that increments `version` on every content change.
- A security-definer RPC `update_submission_guarded(p_id, p_expected_version, p_data, ...)` that updates the row **only** when `version = p_expected_version`; otherwise it returns the current server row so the client can detect the conflict. This guarantees no silent overwrite.

(Existing `submission_versions` history table is retained and continues to snapshot each change.)

## Part 3 — Interactive Conflict Handler (UI + sync)

New file `src/lib/syncConflict.ts`:
- `detectFieldConflicts(local, server)` → per-key diff producing `{ key, localValue, serverValue }[]`, reusing `savedFormMerge` primitives.
- `resolveConflict(strategy, local, server)` for `keep-mine` | `accept-server` | `merge-both` (merge = field-union via the deterministic engine, local wins only on direct key clashes the user didn't override).

New component `src/components/SyncConflictDialog.tsx`:
- Clean "Sync Conflict Detected" modal, brand-aligned.
- Side-by-side **Local Changes vs Server Version** table highlighting only differing fields.
- Three explicit actions: **Keep My Version**, **Accept Server Version**, **Merge Both** (with per-field toggles in merge mode).

Sync integration (in the offline submission flush path, `offlineSubmissions.ts` / saved-form sync):
- On sync of an edited record, call `update_submission_guarded` with the version the device last saw.
- On a version mismatch, fetch the server row, open `SyncConflictDialog`, and apply the supervisor's chosen resolution — re-submitting with the new server version. Nothing is overwritten or dropped silently.

## Technical Notes

- All Part 1 logic runs fully offline (pure functions, no fetch).
- Migration follows the required order (column → trigger → RPC with `SECURITY DEFINER` + `search_path`), and the RPC is granted to `authenticated`.
- Typecheck (`tsgo`) must pass; collapsible section wrappers and responsive layout in `FormFiller` are left intact.

## Files

- add `src/lib/formFieldValidation.ts`
- add `src/lib/syncConflict.ts`
- add `src/components/SyncConflictDialog.tsx`
- edit `src/components/FormFiller/FormFiller.tsx` (wire validation helper + error indicator)
- edit `src/lib/offlineSubmissions.ts` (guarded update + conflict trigger)
- migration: `form_submissions.version` column, increment trigger, `update_submission_guarded` RPC
