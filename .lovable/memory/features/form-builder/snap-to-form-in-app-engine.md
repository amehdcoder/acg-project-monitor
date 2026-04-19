---
name: Snap-to-Form In-App AI Engine
description: 100% on-device Snap-to-Form pipeline (Tesseract OCR + Phi-3.5 via WebLLM/WebGPU) with ZERO Lovable AI credit usage. No cloud calls, no edge function.
type: feature
---

The Snap to Form feature in the Form Builder converts paper forms (camera/upload/PDF) into structured digital forms with **ZERO Lovable AI credit consumption**. The entire pipeline runs in the user's browser.

## Pipeline (4 stages, all on-device)

1. **Image preprocessing** (`src/lib/snapToForm/imagePreprocess.ts`): downscale to 2200px, grayscale, contrast stretch, adaptive thresholding via integral image.
2. **OCR** (`src/lib/snapToForm/ocrEngine.ts`): Tesseract.js v5 worker (cached across pages, prewarmed on dialog open, terminated on close). Returns lines with bbox + confidence.
3. **Heuristic parser** (`src/lib/snapToForm/formParser.ts`): groups lines by vertical gap, detects sections, question lines, checkboxes, yes/no, "If yes…" skip logic, repeat hints, type inference, validation extraction. Always runs as the local baseline.
4. **On-device AI Enhance pass** (default ON, `src/lib/snapToForm/aiEnhancer.ts`): Phi-3.5-mini-instruct (q4f16, ~2.4GB) loaded via `@mlc-ai/web-llm` + WebGPU. Refines the heuristic draft: fixes OCR typos, infers types/options/skip-logic/repeat groups, translates non-English labels (Hausa/Yoruba/Igbo/Arabic/French) to English, generates clean snake_case names, auto-adds GPS/photo/signature/barcode where context implies.

## Why this is genuinely zero-credit

- **No Lovable AI Gateway calls.** The previous `snap-to-form-ai` edge function has been **deleted**.
- No external network calls during inference. Model is downloaded once from MLC's CDN and cached forever in IndexedDB.
- Inference runs on the user's GPU via WebGPU. Engine is a per-tab singleton.

## Fallback behaviour

`enhanceWithAI()` throws `AIEnhanceError` with codes: `unsupported` (no WebGPU), `load_failed` (download/init), `malformed` (non-JSON output), `disabled` (no OCR pages). The dialog catches all and falls back silently to the local heuristic draft + toast — the user always gets a result.

## UI

- Single "AI Enhance" toggle with badge "On-device · Zero credits". No model dropdown.
- Progress strings: `"On-device AI: Fetching shard 3/5 (47%)"`, `"On-device AI: refining form structure…"`.
- Success toast always says "zero AI credits used".

5. **Form Doctor** (`src/lib/snapToForm/formDoctor.ts` + `FormDoctorPanel.tsx`): rule-based scoring, per-issue and "Apply all fixes" actions, smart upgrades.
6. **Per-field re-extract**: Wand2 button re-runs the heuristic parser against the original OCR source text without re-running OCR or AI.

## Constraints

- Requires WebGPU (desktop Chrome/Edge, recent Android Chrome). Safari/old browsers fall back to heuristic-only.
- First run downloads ~2GB. Subsequent runs are instant and fully offline.
- Text-only AI refinement (vision quality comes from Tesseract) — perfect for printed forms; pure handwriting is the trade-off for zero credits.
