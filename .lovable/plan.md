

## Plan: Editable Snap-to-Form + Scrollable, Mobile-Adaptive Form Builder

### 1. Snap-to-Form → Editable like any form
**Status check:** Snap-to-Form already routes through `handleXLSFormImport` → `setQuestions/setGroups` → `handleSaveForm` which writes to `forms.questions` exactly like manually built forms. `FormsView.handleEditForm` then loads via the same path. So editing should structurally work.

**Gap to fix:** Snap-to-Form-imported question objects sometimes carry extra fields (`name`, `validation` shape, `relevant`) that may not survive round-trip cleanly. Normalize the imported `Question` shape in `SnapToFormDialog.handleImport` to match the canonical shape used by `FormCanvas` (ensure `id`, `type`, `label`, `required`, plus optional `options`, `validation`, `hint`, `relevant`, `constraintMessage`). Also ensure `FormGroup` carries `id`, `name`, `label`, `questions[]`, `repeat`, `repeatCount`, `allowDynamicRepeat`, `relevant` — the same fields `CreateGroupDialog` and `QuestionGroup` produce. This guarantees the Edit Form button opens a Snap-to-Form-created form looking identical to a hand-built one.

### 2. Scrollbars on Form Builder page
**Current:** `FormBuilder.tsx` uses `flex-1 overflow-hidden` on tab content; only the inner `FormCanvas` `ScrollArea` scrolls vertically. Header & tabs can clip on small widths; horizontal scroll absent.

**Changes in `FormBuilder.tsx`:**
- Switch outer container from rigid `h-full flex-col` to one that allows page-level scroll fallback when content exceeds viewport.
- Replace `overflow-hidden` on `TabsContent value="questions"` with a layout that provides both vertical AND horizontal scroll on the questions area, so wide question editors / option lists are reachable on mobile/tablet.
- Wrap the header buttons row in a horizontally scrollable container (`overflow-x-auto`) on small screens so all action buttons remain reachable.
- Wrap `TabsList` in `overflow-x-auto` so the 4 tabs (Questions, Geofencing, Settings, Case Management) scroll horizontally on narrow viewports instead of clipping.

### 3. Mobile-adaptive Form Builder
**Changes in `FormBuilder.tsx`:**
- **Header**: stack title + actions vertically below `md` breakpoint; collapse secondary buttons (Snap to Form, Import XLSForm, Add Group, Preview, Save as Template) into a `DropdownMenu` ("More") on `<md`, keeping only Back, Save Form visible.
- **Question palette + canvas split**: convert `flex` row to `flex-col md:flex-row`; on mobile the palette becomes a horizontal strip on top OR a collapsible Sheet (using existing Sheet component) triggered by an "Add question" floating button. Recommended: collapsible Sheet to preserve canvas space.
- **Padding**: reduce side padding on `<sm` (`px-2 sm:px-4`) across header, tabs bar, canvas, settings panels.

**Changes in `FormCanvas.tsx`:**
- Inner question cards: ensure each editor row uses `flex-wrap` and inputs are `min-w-0 w-full sm:w-auto` so labels, type selects, and toggles wrap on narrow screens instead of overflowing.
- Make the option-list inputs (for select_one/select_multiple) stack on mobile.

**Changes in `QuestionPalette.tsx`** (read in next step if needed):
- Adapt to a 2-column compact grid on mobile when shown inside the Sheet.

### 4. Files to edit
- `src/components/FormBuilder/FormBuilder.tsx` — layout, mobile header, palette-as-Sheet, scroll wrappers
- `src/components/FormBuilder/FormCanvas.tsx` — wrap mobile-friendly editor rows + add scroll wrapper
- `src/components/FormBuilder/QuestionPalette.tsx` — responsive grid inside container
- `src/components/FormBuilder/SnapToFormDialog.tsx` — normalize imported question/group shape in `handleImport` to canonical FormBuilder types
- `src/components/FormsView.tsx` — verify `handleEditForm` passes the full normalized `editForm` (already does; no change expected unless mismatch found)

### 5. Out of scope
- No changes to OCR/parser engine.
- No DB schema changes (Snap-to-Form already saves to `forms` table identically).
- No changes to FormFiller behavior.

