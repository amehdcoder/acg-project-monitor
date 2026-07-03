# Looker Studio–Style Dashboard Editor

Build a standalone, admin-only visual dashboard editor modeled on Google Looker Studio, layered on top of the existing dashboard tables. Admins (Owner, Systems Admin, Super Admin) can edit **any** dashboard, rebind each chart/KPI to a different data source and field, add many chart types with deep styling, and connect **external** data sources (Google Sheets, CSV/Excel upload, REST/JSON URL).

## What exists today
- `custom_dashboards` (bound to one `form_id`), `dashboard_widgets` (widget_type, config, position), `dashboard_access`.
- `DashboardBuilder` + `AddWidgetDialog` + `WidgetRenderer` + `DraggableWidgetGrid`: widget types bar/line/pie/area/radar/table/kpi/text/map/location_table, config with questionId/aggregation/groupBy, drag layout, filters, export.
- Data feeds from a single form's submissions.

## Data model changes (one migration)
1. New table `dashboard_data_sources`:
   - `id, name, source_kind` (`form` | `table` | `google_sheet` | `csv_upload` | `rest_api`), `config jsonb` (form_id, or sheet URL/range, or file storage path + parsed schema, or endpoint URL + auth headers + JSON path), `schema jsonb` (cached field list: {id,label,type}), `created_by`, timestamps.
   - GRANTs + RLS: readable by authenticated; insert/update/delete restricted to admins via `has_role`/owner check.
2. `dashboard_widgets.data_source_id uuid` (nullable, FK to `dashboard_data_sources`) so each widget can override the dashboard default source.
3. `custom_dashboards.default_data_source_id uuid` + make `form_id` nullable so a dashboard can be created without a form.
4. New storage bucket `dashboard-uploads` (private) for CSV/Excel files.
5. Edge function `dashboard-fetch-source` to server-side fetch Google Sheet / REST API rows (avoids CORS, hides auth headers). CSV/Excel parsed client-side on upload, rows cached in the data source `config`.

## Access control
- New `useCanEditDashboards()` hook: true when `isOwner`, `is_co_owner`, or role `super_admin`/`systems_admin`.
- Route/entry to the editor is gated by this hook. Editor loads any dashboard regardless of creator.

## New standalone editor (`src/components/DashboardStudio/`)
Looker-style three-pane layout:
- **Left rail — Data & Pages**: list of data sources with "Add data source" (opens connector UI), fields panel showing dimensions vs metrics per selected source.
- **Center — Canvas**: the draggable/resizable widget grid (reuse `DraggableWidgetGrid`) with live preview.
- **Right rail — Properties**: contextual config for the selected widget — Setup tab (data source dropdown, dimension, metric, aggregation, filter, date range) and Style tab (colors/palette, legend, axis, labels, number format, fonts, background, border, corner radius).
Top bar: dashboard name, View/Edit toggle, add-chart menu, theme, save state.

### Data source connector UI (`AddDataSourceDialog`)
Colorful card picker: App Form, App Table, Google Sheets, CSV/Excel upload, REST/JSON API. Each with a guided config step, "Connect & preview" that fetches a sample and auto-detects the field schema, then saves the source.

### Chart types (expand `WIDGET_TYPES` + `WidgetRenderer`)
Add: scorecard/KPI-with-delta, combo (bar+line), scatter, stacked/grouped bar, donut, gauge, treemap, heatmap-table, pivot table — on top of existing types.

### Deep styling
Extend `WidgetConfig` with a `style` object (palette, series colors, showLegend/position, gridlines, axis titles, number/date format, font family/size, background, border, radius, conditional formatting for tables/scorecards). `WidgetRenderer` reads `style` for every type.

### Unified data layer
`useWidgetData(widget)` resolves the widget's data source (form submissions via existing analytics, app table query, or cached external rows), applies dimension/metric/aggregation/filters, and returns chart-ready rows. This decouples widgets from the single-form assumption.

## Build order (phased)
1. Migration + storage bucket + `dashboard-fetch-source` edge function.
2. `useCanEditDashboards`, data-source hook + `AddDataSourceDialog` with all 5 source kinds.
3. `DashboardStudio` shell (3-pane) reusing existing grid; wire load-any-dashboard.
4. Per-widget data source + field rebinding in the right-rail Setup tab.
5. New chart types + Style tab.
6. Entry point in admin area + access gating; verify with typecheck and a Playwright smoke pass.

## Technical notes
- Reuses `recharts` already in the project; add lightweight `xlsx` parse for uploads (or SheetJS already present via ExcelJS — will parse CSV natively, Excel via a small reader).
- Google Sheets uses the connector gateway pattern if a connection is linked; otherwise a public-sheet CSV export URL fallback.
- All external fetches go through the edge function with input validation; secrets (API auth headers) stored per-source encrypted in config are avoided — instead sensitive headers go through a project secret when needed.
- No changes to existing per-form dashboards' runtime behavior; the studio is additive.
