# TanStack Query + Server Aggregation Refactor

You chose the most aggressive scope: rewrite every table view, move dashboard aggregation into SQL, and paginate everything. That touches ~200 hooks, ~500 components, and the entire dashboard layer. It cannot land safely in one turn — a single-shot rewrite will break offline sync, MDA/BMZ/ACSM/SBC dashboards, custom Dashboard Studio widgets, and the cascading location dropdowns. I need to sequence it across turns.

Here is the phased plan. Each phase ends in a working app. I will pause for your OK before starting the next phase so we can verify nothing regressed.

## Phase 1 — Foundation (this turn)

Installs the primitives every later phase depends on. No visible behavior change.

1. Add `@tanstack/react-query` + devtools; wrap `App.tsx` in `QueryClientProvider` with `staleTime: 60_000`, `gcTime: 300_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: "always"`, `retry: 2` with exponential backoff.
2. New primitives:
   - `src/hooks/useDebouncedValue.ts` — 300ms debounce for search/filter inputs.
   - `src/hooks/useSubmitLock.ts` — instant-disable wrapper for submit/refresh buttons.
   - `src/hooks/useCursorQuery.ts` — 50/page cursor pagination using `range()` + `keepPreviousData`.
   - `src/hooks/useSupabaseQuery.ts` — thin wrapper standardizing keys and error handling.
3. Migration: B-Tree indexes on foreign keys, `user_id`, and hot `WHERE`/`ORDER BY` columns across `form_submissions`, `user_project_assignments`, `microplan_entries`, `attendance_records`, `bmz_monitoring`, `acsm_reports`, `sbc_reports`, `ces_household_visits`, `chat_messages`, `notifications`, `case_activities`, `submission_versions`. All `IF NOT EXISTS`, plain `CREATE INDEX` (migrations can't run `CONCURRENTLY`).
4. Migration: pre-joined views with `security_invoker=on` so RLS on the base tables still applies:
   - `v_form_submissions_enriched` — form_submissions ⨝ forms ⨝ profiles.
   - `v_user_project_assignments_enriched` — assignments ⨝ projects ⨝ profiles.
   - `v_microplan_entries_enriched` — microplan_entries ⨝ reference_locations.

## Phase 2 — Hot-path migration (next turn)

Migrate the top-traffic surfaces to the new primitives. Each becomes a `useQuery` with cursor pagination and debounced filters.

- `UsersView`, `FormsView` (My Forms list), `MdaDashboardView`, `BmzDashboard`, `DigitalAttendanceView`, `AdminSubmissionEditor`.
- All submit buttons in these flows adopt `useSubmitLock`.
- Search inputs adopt `useDebouncedValue`.

## Phase 3 — Server-side aggregation RPCs (turn after)

For each dashboard that currently pulls the full dataset:

- Add a `rpc_<name>_summary(project_id, from, to)` returning pre-aggregated KPI/chart rows.
- Rewrite the dashboard hook (`useBmzDashboard`, `useAcsmDashboard`, `useSbcDashboard`, `useSeeClearDashboard`, `useMdaKpis`, `useIrfDashboard`) to call the RPC via `useQuery`.
- Charts consume aggregated rows; raw-row tables inside the dashboard switch to cursor pagination.

## Phase 4 — Long tail

Sweep remaining list views, secondary hooks, chat/notification streams, and offline sync consumers. Delete now-unused ad-hoc fetch helpers.

## Technical notes

- **Offline resilience is preserved.** The existing `warmCacheUserForms`, `offlineFormCache`, and IndexedDB seeding stay in place; React Query only owns the online cache. Offline reads continue to hit IndexedDB via the current adapters.
- **RLS is untouched.** Views use `security_invoker=on` so `auth.uid()` still filters rows through the base-table policies. No new grants beyond `SELECT` on the views to `authenticated`.
- **Query keys.** Standardized as `[domain, table, filters, cursor]` so identical concurrent requests dedupe automatically.
- **Fetch chunking.** `fetchAllRows` / `fetchAllRowsKeyset` remain for aggregation code paths until their dashboards move to RPCs in Phase 3.
- **Type parsing perf.** New helpers type `.select()` strings as plain `string` and use `.returns<T>()` to avoid the supabase-js type-parsing blowup on long selects.
- **No client-side edits to `src/integrations/supabase/client.ts`** (auto-generated).

## What ships this turn

Only Phase 1: dependency install, provider setup, four hook primitives, indexes migration, three enriched views migration. No component behavior changes yet — so nothing that already works can break.

Approve to proceed with Phase 1.
