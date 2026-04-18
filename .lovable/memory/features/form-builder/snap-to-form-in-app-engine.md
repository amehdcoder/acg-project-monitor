---
name: Snap to Form in-app engine
description: Snap to Form runs fully in-browser with Tesseract.js OCR + heuristic parser + rule-based Form Doctor. Zero AI credits, works offline.
type: feature
---

The Snap to Form feature in the Form Builder converts paper forms (camera/upload/PDF) into structured digital forms entirely on-device:

1. **Image preprocessing** (`src/lib/snapToForm/imagePreprocess.ts`): downscale to 2200px, grayscale, contrast stretch, adaptive thresholding via integral image — produces high-contrast OCR-ready PNG.
2. **OCR** (`src/lib/snapToForm/ocrEngine.ts`): Tesseract.js v5 worker (cached across pages, prewarmed on dialog open, terminated on close). Returns lines with bbox + confidence.
3. **Heuristic parser** (`src/lib/snapToForm/formParser.ts`): groups lines by vertical gap, detects section headings, question lines (label + blank/checkbox/colon), checkboxes, yes/no, "If yes…" skip logic, repeat hints, type inference (date/phone/email/number/range/geopoint/photo/signature/barcode), validation extraction (min/max from "(0-120)", regex for phone/email).
4. **Form Doctor** (`src/lib/snapToForm/formDoctor.ts` + `FormDoctorPanel.tsx`): rule-based scoring (completeness/validation/accessibility/duplicates), per-issue and "Apply all fixes" actions, smart upgrades (auto-add GPS/photo/signature when context suggests).
5. **Per-field re-extract**: Wand2 button on each question re-runs the parser against the original OCR source text without re-running OCR.

The old `supabase/functions/snap-to-form` cloud function is no longer called by the dialog (kept for backward compat). UI shows page-by-page progress with Progress bar + phase labels (preprocess → ocr → parse).
