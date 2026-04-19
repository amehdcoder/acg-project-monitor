---
name: Snap to Form in-app engine
description: Hybrid Snap-to-Form — Tesseract.js OCR + heuristic parser ALWAYS run on-device, then optional Gemini Vision AI Enhance pass via Lovable AI Gateway refines structure/options/skip-logic/handwriting/multilingual. AI failures fall back to local draft so users never get stuck.
type: feature
---

The Snap to Form feature in the Form Builder converts paper forms (camera/upload/PDF) into structured digital forms using a 4-stage pipeline:

1. **Image preprocessing** (`src/lib/snapToForm/imagePreprocess.ts`): downscale to 2200px, grayscale, contrast stretch, adaptive thresholding via integral image — produces high-contrast OCR-ready PNG.
2. **OCR** (`src/lib/snapToForm/ocrEngine.ts`): Tesseract.js v5 worker (cached across pages, prewarmed on dialog open, terminated on close). Returns lines with bbox + confidence.
3. **Heuristic parser** (`src/lib/snapToForm/formParser.ts`): groups lines by vertical gap, detects section headings, question lines (label + blank/checkbox/colon), checkboxes, yes/no, "If yes…" skip logic, repeat hints, type inference (date/phone/email/number/range/geopoint/photo/signature/barcode), validation extraction (min/max from "(0-120)", regex for phone/email). Always runs as the local baseline.
4. **AI Enhance pass (optional, default ON)** (`src/lib/snapToForm/aiEnhancer.ts` + `supabase/functions/snap-to-form-ai/index.ts`): sends the local draft + per-page OCR text + downscaled (1024px JPEG) page thumbnails to Gemini Vision via Lovable AI Gateway with strict tool-calling schema. The AI fixes OCR typos, infers correct types/options/validation/skip logic, detects sections/repeat groups/tables, handles handwriting and multilingual headings (Hausa/Yoruba/Igbo/Arabic/French) translating to English, auto-adds GPS/photo/signature/barcode where context implies, and generates a clean form title + description. Default model: `google/gemini-2.5-flash`; user can pick `gemini-3-flash-preview` (newest) or `gemini-2.5-pro` (highest accuracy).

**Resilience:** If the AI step fails for any reason (429 rate-limit, 402 no-credits, network, malformed output), the local heuristic draft is used instead and a toast explains why. The local pipeline alone is fully sufficient — AI is purely additive.

5. **Form Doctor** (`src/lib/snapToForm/formDoctor.ts` + `FormDoctorPanel.tsx`): rule-based scoring (completeness/validation/accessibility/duplicates), per-issue and "Apply all fixes" actions, smart upgrades (auto-add GPS/photo/signature when context suggests).
6. **Per-field re-extract**: Wand2 button on each question re-runs the heuristic parser against the original OCR source text without re-running OCR (and without calling AI).

The dialog shows a 4-step progress UI: 1/4 Enhancing → 2/4 OCR → 3/4 Building draft → 4/4 AI Enhancing. Review banner shows an "AI Enhanced" badge alongside confidence and language when the AI pass succeeded. The old `supabase/functions/snap-to-form` cloud function is unused (kept for backward compat).
