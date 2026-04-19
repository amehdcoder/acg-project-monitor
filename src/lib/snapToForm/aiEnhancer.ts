/**
 * Snap-to-Form AI Enhancer
 *
 * Calls the `snap-to-form-ai` edge function which routes to the Lovable AI
 * Gateway (default model: google/gemini-3-flash-preview). The edge function
 * uses tool calling to guarantee a strict ParsedForm shape.
 *
 * On any failure (network, 429, 402, malformed response) this throws an
 * AIEnhanceError — the dialog catches it and falls back to the local
 * heuristic parser draft so the user is never blocked.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ParsedForm } from "./formParser";
import type { OcrPageResult } from "./ocrEngine";

export type AIEnhanceErrorCode =
  | "unsupported"
  | "load_failed"
  | "malformed"
  | "disabled"
  | "rate_limited"
  | "payment_required"
  | "unknown";

export class AIEnhanceError extends Error {
  code: AIEnhanceErrorCode;
  constructor(message: string, code: AIEnhanceErrorCode) {
    super(message);
    this.code = code;
  }
}

export interface AIEnhanceInput {
  draft: ParsedForm;
  ocrPages: OcrPageResult[];
  /** Original full-size pages — unused for the gateway path; kept for API compatibility. */
  pageDataUrls?: string[];
  extraInstructions?: string;
  /** Lovable AI Gateway model id. Defaults to google/gemini-3-flash-preview. */
  model?: string;
  onProgress?: (msg: string) => void;
}

export interface AIEnhanceResult {
  form: ParsedForm;
  model: string;
}

const QUESTION_TYPES = [
  "text", "number", "select_one", "select_multiple", "date", "time", "datetime",
  "geopoint", "geotrace", "geoshape", "image", "audio", "video", "file",
  "barcode", "calculate", "note", "range", "rank", "matrix", "signature", "acknowledge",
] as const;

function normalize(parsed: any): ParsedForm {
  const types = QUESTION_TYPES as readonly string[];
  parsed.groups = (parsed.groups || []).map((g: any) => ({
    name: g.name || "main",
    label: g.label || g.name || "Main",
    repeat: !!g.repeat,
    relevant: g.relevant,
    questions: (g.questions || []).map((q: any) => ({
      name: q.name,
      label: q.label,
      hint: q.hint,
      type: types.includes(q.type) ? q.type : "text",
      required: !!q.required,
      options: Array.isArray(q.options) ? q.options : undefined,
      validation: q.validation,
      relevant: q.relevant,
      aiUpgrade: q.aiUpgrade,
      confidence: typeof q.confidence === "number" ? q.confidence : 0.7,
      sourcePage: q.sourcePage,
    })),
  }));
  parsed.formName = parsed.formName || "Untitled Form";
  parsed.overallConfidence =
    typeof parsed.overallConfidence === "number" ? parsed.overallConfidence : 0.75;
  return parsed as ParsedForm;
}

export async function enhanceWithAI(input: AIEnhanceInput): Promise<AIEnhanceResult> {
  const { draft, ocrPages, extraInstructions, model, onProgress } = input;

  if (!ocrPages.length) {
    throw new AIEnhanceError("No OCR pages to enhance", "disabled");
  }

  onProgress?.("Calling Lovable AI to refine the form…");

  const { data, error } = await supabase.functions.invoke("snap-to-form-ai", {
    body: {
      draft,
      ocrPages: ocrPages.map((p) => ({ text: p.text })),
      extraInstructions,
      model,
    },
  });

  if (error) {
    // Supabase wraps non-2xx responses as FunctionsHttpError with the body in `context`.
    const status = (error as any)?.context?.status;
    const msg = (error as any)?.message || "AI Enhance failed";
    if (status === 429) throw new AIEnhanceError("Rate limit reached", "rate_limited");
    if (status === 402) throw new AIEnhanceError("AI credits exhausted", "payment_required");
    throw new AIEnhanceError(msg, "unknown");
  }

  if (!data?.form) {
    throw new AIEnhanceError("AI returned no form", "malformed");
  }

  if (!Array.isArray(data.form.groups) || data.form.groups.length === 0) {
    throw new AIEnhanceError("AI returned empty form", "malformed");
  }

  const form = normalize(data.form);
  return { form, model: data.model || "lovable-ai" };
}

/** Pre-warm hook (no-op for the gateway path). */
export async function prewarmAI(_modelId?: string, _onProgress?: (msg: string) => void) {
  /* no-op */
}

/** Always supported — the gateway is server-side. */
export function isOnDeviceAISupported(): boolean {
  return true;
}
