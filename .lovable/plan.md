
## Scope
Upgrade the Integrated Supervisory Dashboard (KoboToolbox) with 7 fixes. All work stays inside `src/components/IntegratedSupervisory/` plus tiny helpers, one new table for share configs, and two npm packages.

## Dependencies to add
- `exceljs` — styled XLSX export
- `react-grid-layout` + `@types/react-grid-layout` — freeform canvas
- `expr-eval` — calculated field formulas

## Files to add
1. `src/components/IntegratedSupervisory/koboLabelResolver.ts`
   - `KoboLabelResolver` class built from `asset.content.survey` + `asset.content.choices`.
   - `resolveValue(fieldKey, rawValue)` handles null, stringified JSON arrays (`["KAFIN","HAUSA"]`), space-delimited `select_multiple`, and arrays; joins labels with `", "`.
   - `resolveHeader(fieldKey)` returns the question label.
   - Exposed on `KoboCache` as a lazy singleton keyed by `formUid`.

2. `src/components/IntegratedSupervisory/RecordPreviewDrawer.tsx`
   - Slide-over drawer (Radix `Sheet`) showing all schema questions grouped by group prefix, resolved values, badges for empty/multi-select, header in slate-900.

3. `src/components/IntegratedSupervisory/exportKoboData.ts`
   - `exportXlsx(rows, columns, resolver)` — ExcelJS workbook, frozen header row (28px, `#1E293B`/white bold), auto column widths, thin `#E2E8F0` borders, wrap text, resolved values.
   - `exportCsv(rows, columns, resolver)` — clean CSV using resolved values.

4. `src/components/IntegratedSupervisory/CanvasGridLayout.tsx`
   - Wraps `react-grid-layout` with `WidthProvider`, freeform (`compactType={null}`), persists layout via existing `saveLayout` helper.

5. `src/components/IntegratedSupervisory/CalculatedFieldDialog.tsx`
   - Uses `expr-eval` to preview a formula against sample rows; stores calculated fields in the dashboard config; exposes them as pseudo-columns in the Data panel.

6. `src/components/IntegratedSupervisory/ShareDashboardDialog.tsx`
   - Access levels: `PUBLIC_LINK`, `AUTHENTICATED`, `PROJECT_MEMBER`, `RESTRICTED` (email chip input).
   - Realtime sync toggle. Copy-link button generates `/shared-dashboard/:token`.

## Files to modify
- `koboClient.ts`: cache the raw asset content (`survey` + `choices`) alongside `fields`, and construct the resolver on load; add `assetContent` to `KoboCache`.
- `RawKoboDataTable.tsx`:
  - Remove `Status` column.
  - Render all dynamic Kobo question columns without horizontal truncation (min-width per column, horizontal virtualization already present).
  - Use resolver for every cell + header label.
  - Add "Preview" button per row opening `RecordPreviewDrawer`.
  - Swap Excel/CSV downloads to new `exportKoboData` helpers.
- `SupervisoryDashboardView.tsx`:
  - Replace dnd-kit canvas with `CanvasGridLayout`.
  - Add "+ Calculated field" in Data panel.
  - Add "Share" button in header opening `ShareDashboardDialog`.
  - Route dimension values + filter dropdowns through resolver.
- `KPICard` (scorecard widget): add `showTechnicalMeta` (default `false`); hide "Rows / Distinct …" subtext unless toggled in Setup/Style panel.

## Database
One migration for share configs:
```
create table public.dashboard_shares (
  id uuid primary key default gen_random_uuid(),
  dashboard_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('PUBLIC_LINK','AUTHENTICATED','PROJECT_MEMBER','RESTRICTED')),
  share_token uuid unique,
  allowed_user_ids uuid[] default '{}',
  allowed_project_ids uuid[] default '{}',
  allow_realtime boolean not null default true,
  created_at timestamptz not null default now()
);
```
+ GRANTs (`anon` SELECT for PUBLIC_LINK lookups by token, `authenticated` full), RLS policies: owner full; SELECT allowed when access_level='PUBLIC_LINK', or 'AUTHENTICATED' with auth.uid() not null, or 'RESTRICTED' with uid in allowed_user_ids, or 'PROJECT_MEMBER' via existing project membership.

## Out of scope
- No changes to Microplanning, MDA Checklist, or other modules.
- No changes to Supabase auth or edge functions beyond what the resolver needs (the asset's `content.survey`/`content.choices` are already available from `kobo-form-manager`; if not returned today, `fetch_submissions` response will include them).

## Verification
- Run `tsgo` after edits, confirm no type errors.
- Manual: sync a Kobo form, verify LGA/WARD values render as labels in table, KPIs, filters; preview drawer opens; XLSX opens in Excel with frozen header and borders; canvas widgets drag/resize; share dialog persists a row.
