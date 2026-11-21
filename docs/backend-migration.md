# Amehnities: move off Lovable Cloud

## Current status

Preparation only. No backend connection, records, user accounts, files, function deployments or production settings have changed.

The destination project and authorized access have not been provided. Migration cannot safely start by changing the app's connection settings: an empty destination would make existing records and accounts unavailable.

## Source inventory

Source inspection found 81 function directories with an `index.ts`, 416 SQL files in `supabase/migrations/`, and 69 in `drizzle/migrations/`. These counts do not prove how many functions or migrations are deployed. Reconcile actual source and destination state before applying schema; do not blindly run both histories or replay them on top of a full restored export.

Five function sources contain Lovable-specific references:

- `ai-media-generate`
- `analyze-media`
- `ces-rooftop-count`
- `special-form-export`
- `thematic-analysis`

Review their actual calls before choosing independently billed replacements. Rehosting these functions alone does not remove Lovable AI dependencies.

Function source references the following configuration names (not secret values):

`CRON_SECRET`, `DASHBOARD_SHARE_SECRET`, `DSS_AI_GATEWAY_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `GOOGLE_MAIL_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_API_KEY`, `HOSTINGER_SMTP_PASSWORD`, `IPFIND_API_KEY`, `KOBO_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, `PAYSTACK_SECRET_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VAPID_PRIVATE_KEY`.

This is a code-reference inventory, not verification that all values are configured or used. Destination runtime credentials must come from the destination; never transfer the source's managed runtime keys or put private values in frontend code. Also inventory settings stored in protected application tables, including messaging and integration configuration, without printing their secrets.

## Required inputs

- Identify the destination project and confirm whether it already contains data. Never restore over an existing project without a reviewed collision/backup strategy.
- Authorize destination management through a supported connection; never paste passwords or private keys into chat.
- Export the running Cloud database using **More → Database → Manage → Settings → Export project data → Export data → Database → Export → Start export**. Download the result from the emailed link or **More → Storage**. Exports are limited to one every 24 hours and require the backend to be running.
- Download storage files separately from **More → Storage**, preserving bucket/path associations. Database exports do not include these files.
- Provide replacement credentials through secure secret entry and decide on independently billed AI services.

The full database export includes structure, data and accounts with password hashes. It excludes storage files, function code, secrets, sign-in provider settings and API keys. Existing sessions do not transfer; users must sign in again after cutover.

## Migration gates

1. Prepare an isolated destination/test deployment and restore the supported database export using compatible restore tooling. Reconcile schema histories and retained user IDs; do not reconstruct accounts from a paginated user list.
2. Restore file contents separately and verify private bucket controls, file counts, representative checksums and report-photo path associations. Keep private beneficiary/report media private.
3. Deploy the function sources with correct authentication settings; securely configure new runtime/service credentials. Recreate auth providers, email delivery and same-origin redirect addresses.
4. Audit scheduled jobs, database HTTP callbacks, realtime subscriptions, stored absolute media URLs, public QR/form links and external integration destinations for source-specific addresses. Replace Cloud-specific callback authentication safely; avoid running reminders or outbound pushes on both backends.
5. Replace Lovable AI/connector dependencies where used. External AI, messaging, maps and payment services retain their own usage costs.
6. Verify real-account sign-in/recovery, project/facility/donor/beneficiary access isolation, record creation/edit/readback, dashboards, private photos, exports, public collection, Kobo-to-settlement-map delivery, DHIS2 and reminders. Validate totals and row/file counts against the source.
7. Test previously prepared devices with unsent offline work. Preserve queues and IDs; review cached authentication and source-specific signed URLs. Do not clear device storage as a migration shortcut.
8. Arrange a write freeze and final delta/export strategy compatible with the export timing limit. Reconcile submissions received during migration, then switch the authorized connection/deployment and external webhook destinations together. Generated client/config files remain managed; do not bypass connection protections by editing them here.
9. Verify reads, saves, realtime updates and offline replay again after traffic moves. Retain the source until the destination and rollback strategy are verified. Rollback must account for new writes at the destination, not simply point users back at stale data.

## Cost and hosting scope

Moving database, auth, storage and functions moves their billing to the user's own provider; it does not make those operations free. Supabase plan limits and usage charges apply. Lovable AI calls can still consume Lovable credits until replaced. Frontend hosting can remain on Lovable or move separately; moving frontend hosting alone does not change backend billing.

Do not use **Remove database** as a migration step. Removal permanently deletes the Cloud database, backups, accounts, storage and deployed functions and cannot be undone.

## Documentation

- https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- https://docs.lovable.dev/features/database-backups
- https://docs.lovable.dev/integrations/supabase

## Still unverified

Destination access/capacity, actual deployed inventories, exported data, storage completeness, replacement credentials, restored authentication, independent AI billing, all migration checks and production cutover. No migration has been performed.