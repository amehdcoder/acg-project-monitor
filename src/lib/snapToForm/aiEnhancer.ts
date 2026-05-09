/**
 * Snap-to-Form AI Enhancer (vision-first)
 *
 * Sends the original page IMAGES (downscaled for the wire) plus OCR text + the
 * heuristic draft to the `snap-to-form-ai` edge function. The function uses
 * google/gemini-2.5-pro for true visual extraction and a second audit pass to
 * recover any missed fields.
 */

import { supabase } from "@/integrations/supabase/client";
import { type ParsedForm, parseOcrPages } from "./formParser";
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
  /** Original full-size page dataURLs (one per page) — sent to the AI for vision extraction. */
  pageDataUrls?: string[];
  extraInstructions?: string;
  /** DSS Internal AI Gateway model id. Defaults to google/gemini-2.5-pro. */
  model?: string;
  onProgress?: (msg: string) => void;
}

export interface AIEnhanceResult {
  form: ParsedForm;
  model: string;
  auditAddedCount?: number;
  pagesUsed?: number;
}

const QUESTION_TYPES = [
  "text", "number", "select_one", "select_multiple", "date", "time", "datetime",
  "geopoint", "geotrace", "geoshape", "image", "audio", "video", "file",
  "barcode", "calculate", "note", "range", "rank", "matrix", "signature", "acknowledge",
] as const;

// Cap each image to ~1280px on the long edge before sending to the AI. Keeps
// the request small while preserving enough detail to read checkboxes & text.
const MAX_AI_IMAGE_DIM = 1280;

function downscaleForAI(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge > MAX_AI_IMAGE_DIM) {
        const scale = MAX_AI_IMAGE_DIM / longEdge;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      // JPEG keeps photos compact; AI can read text fine at q=0.85.
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

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
  const { draft, ocrPages, pageDataUrls, extraInstructions, model, onProgress } = input;

  if (!ocrPages.length && !(pageDataUrls && pageDataUrls.length)) {
    throw new AIEnhanceError("No pages to enhance", "disabled");
  }

  // 1. Always run local heuristic enhancement first.
  // This ensures the feature is instant, offline-capable, and cost-zero.
  onProgress?.("Applying local DSS Heuristic Intelligence (Formula & Skip Logic inference)…");
  const localForm = parseOcrPages(ocrPages);
  
  // 2. Decide if we need to call the cloud AI.
  // If the user didn't explicitly request cloud model OR if we are offline, stop here.
  const isCloudRequested = !!model && model !== "local";
  if (!isCloudRequested || !navigator.onLine) {
    onProgress?.("Digitization complete (Local Engine).");
    return {
      form: localForm,
      model: "dss-local-heuristic",
      pagesUsed: ocrPages.length,
    };
  }

  // 3. Optional Cloud Refinement (as a fallback/upgrade)
  onProgress?.(`Refining with Cloud AI (${model || "Gemini Pro vision"})…`);
  
  const pageImages = pageDataUrls 
    ? await Promise.all(pageDataUrls.map(url => downscaleForAI(url)))
    : undefined;

  const { data, error } = await supabase.functions.invoke("snap-to-form-ai", {
    body: {
      draft,
      ocrPages: ocrPages.map((p) => ({ text: p.text })),
      pageImages,
      extraInstructions,
      model,
    },
  });

  if (error) {
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

  if (typeof data.auditAddedCount === "number" && data.auditAddedCount > 0) {
    onProgress?.(`Audit recovered ${data.auditAddedCount} additional field${data.auditAddedCount === 1 ? "" : "s"}.`);
  }

  return {
    form,
    model: data.model || "google/gemini-2.5-pro",
    auditAddedCount: data.auditAddedCount,
    pagesUsed: data.pagesUsed,
  };
}

/** No-op (kept for API compatibility). */
export async function prewarmAI(_modelId?: string, _onProgress?: (msg: string) => void) {
  /* no-op */
}

/** Always supported — the gateway is server-side. */
export function isOnDeviceAISupported(): boolean {
  return true;
}
