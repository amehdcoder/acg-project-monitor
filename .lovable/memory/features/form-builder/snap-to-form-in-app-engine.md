---
name: Snap-to-Form Vision-First Pipeline
description: Why Snap-to-Form now achieves near-100% paper-to-digital fidelity — vision extraction with Gemini 2.5 Pro + completeness audit pass + lossless merge.
type: feature
---

The Snap-to-Form feature in the Form Builder converts paper forms into digital forms with maximum fidelity. The previous pipeline lost fields because it only sent **OCR text** to the AI; the AI never saw the actual paper. The new pipeline is vision-first.

## Why <100% before
1. **OCR-only AI input.** AI saw lossy Tesseract text, not the image — checkboxes (☐), ruled lines, multi-column layouts, table grids, and handwriting cues were invisible to the model.
2. **Heuristic-first.** Local regex parser ran first and the AI only "improved" its draft, inheriting every field the regex missed.
3. **Truncated context.** OCR capped at 22k chars and draft at 8k — long forms were cut off.
4. **Single pass.** No completeness check — silently dropped fields stayed dropped.
5. **Underpowered model.** `gemini-3-flash-preview` is fast but weaker on dense vision/reasoning vs `gemini-2.5-pro`.

## What changed (4 fixes)

1. **Vision extraction (Pass 1).** `enhanceWithAI` now downscales each captured page to 1280px and sends them as `image_url` parts to `google/gemini-2.5-pro` along with OCR text (as a spelling hint) and the heuristic draft (as inspiration only). The system prompt makes the IMAGE the ground truth.
2. **Completeness audit (Pass 2).** Edge function makes a second Gemini call showing the same page images plus the Pass-1 form, asking only for fields visible on paper but missing from the form. Tool-calling guarantees structured output. Missing items are appended to the right group (created if needed) and tagged `aiUpgrade: "Recovered by completeness audit"`.
3. **Lossless union merge (client).** Any heuristic-parser field whose label/name doesn't appear in the AI output is appended to a "Recovered Fields" group so nothing is ever silently dropped.
4. **Bigger budgets.** OCR up to 80k chars total / 12k per page; draft JSON up to 16k. Gemini 2.5 Pro handles all of it comfortably.

## Files
- `supabase/functions/snap-to-form-ai/index.ts` — two-pass vision pipeline (extract + audit), strict tool calling for both passes.
- `src/lib/snapToForm/aiEnhancer.ts` — sends `pageImages` (downscaled), surfaces `auditAddedCount`.
- `src/components/FormBuilder/SnapToFormDialog.tsx` — passes `pageDataUrls`, runs lossless merge, toasts when extra fields are recovered.

## Failure modes
- 429 (rate limit) / 402 (credits exhausted) → toast + heuristic draft fallback (same as before).
- Audit pass failure is non-fatal; Pass-1 form is still returned.
- No images at all → falls back to text-only request (still works, but lower fidelity).
