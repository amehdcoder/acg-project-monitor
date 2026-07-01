# Special Form Studio — Templates, Versioning, Dashboard Designer & XLSForm I/O

All five capabilities extend the existing Studio (`src/components/SpecialFormStudio/`) and store data inside the `forms.settings` JSON — **no schema migration needed**. The `forms` table already has `status` (`active`/`draft`/`inactive`), `questions` (sections), and `settings` (theme + dashboardConfig).

## 1. Template versioning + publish/unpublish

Store an immutable version history in `settings.versions[]`:
```text
version: { v: number, label, createdAt, createdBy, status: "published"|"archived",
           snapshot: { sections, theme, description, dashboardConfig } }
```
- **Publish** (existing "Publish" button): snapshots current state as a new version marked `published`, demotes the previously published one to `archived`, sets form `status="active"`, and records `settings.publishedVersion`.
- **Save draft**: writes working state without cutting a version.
- **Unpublish**: sets form `status="draft"` and clears `publishedVersion` so field users stop seeing it; older versions stay in history.
- New `VersionHistoryPanel.tsx`: lists versions, lets the Owner **preview**, **restore** (loads snapshot into the editor as new working draft), and **re-publish** an older version. Users always run the `publishedVersion` snapshot.
- Helpers in new `src/lib/specialStudio/versioning.ts` (cut/restore/resolve active snapshot). `recordStudioAudit` already logs actions.

## 2. Export / import full-fidelity presets (with dashboard)

New `src/lib/specialStudio/templatePackage.ts`:
- `exportTemplate(form)` → downloadable `.amtemplate.json` containing `{ meta, name, description, sections, theme, dashboardConfig, dashboardLayout }` — a complete, portable copy including linked dashboard structure.
- `importTemplate(file)` → validates + re-IDs (`id`/`name` regenerated to avoid collisions, dashboard field references remapped) and returns Studio state.
- Studio top bar gets **Export template** / **Import template** buttons; PresetPicker gets an "Import a shared template" entry so shared files become new starting points.

## 3. Drag-and-drop dashboard metric designer

Extend `DashboardConfig` (backward-compatible) with a `widgets[]` array:
```text
widget: { id, kind: "kpi"|"bar"|"donut"|"table"|"filter",
          field (question name), agg: "sum"|"count"|"avg"|"distinct",
          title, color, span: 1|2 }
```
- New `DashboardDesigner.tsx` (replaces the current simple Dashboard tab body): a `@dnd-kit` canvas where the Owner picks **any question/status field** from a palette and drops it in as a KPI card, chart, or filter; edit each card's title/aggregation/color inline; drag to reorder; delete.
- `dashboardSync.ts` gains `reconcileWidgets()` so widgets referencing deleted fields are dropped and legacy `kpiFields/statusField/geoField` auto-migrate into `widgets` on first open.
- `SpecialFormDashboard.tsx` renders `widgets[]` in saved order (KPI cards, bar/donut charts via existing `recharts`, tables, and working filter controls that filter the submission rows). Falls back to legacy rendering when no widgets exist. Realtime sync already in place.

## 4. Saved UI theming + layout per template

- Form theme already persists in `settings.theme`. Add `settings.dashboardLayout = { accent, background, columns, widgetOrder, density }` saved alongside the widgets so dashboard branding/positions survive edits.
- Both `theme` and `dashboardLayout` are captured inside every version snapshot (section 1) and inside exported template packages (section 2), so branding stays consistent after edits, restores, and imports.

## 5. XLSForm import into Studio + export/download of any special form

- **Import**: reuse `parseXLSForm` (SheetJS already a dep). Add an **Import XLSForm** button in the Studio that maps parsed `questions`/`groups` into Studio `sections` (wrapping ungrouped questions in a section), preserving skip logic/calculations/choice filters already supported by the parser.
- **Export**: new `src/lib/specialStudio/xlsformExport.ts` builds a valid three-sheet (`survey`, `choices`, `settings`) `.xlsx` with SheetJS at 100% fidelity — every field, type, `required`, `relevant`, `constraint`, `calculation`, `choice_filter`, `appearance`, and all options. Wired to a **Download XLSForm** action in both the Studio top bar and the FormsView form dropdown (available for any special/studio form).

## Technical notes
- No DB migration: everything rides in existing `forms.status`/`questions`/`settings` columns; realtime `forms` updates already flow to the live dashboard.
- New files: `versioning.ts`, `templatePackage.ts`, `xlsformExport.ts`, `VersionHistoryPanel.tsx`, `DashboardDesigner.tsx`. Edited: `SpecialFormStudio.tsx`, `SpecialFormDashboard.tsx`, `dashboardSync.ts`, `presets.ts` (types), `PresetPicker.tsx`, `FormsView.tsx`.
- Types stay backward-compatible so existing saved special forms keep working; legacy configs auto-migrate on open.
- Verify with `tsgo` typecheck + a Playwright smoke pass of the Studio (build form → designer → publish → export/import) before finishing.
