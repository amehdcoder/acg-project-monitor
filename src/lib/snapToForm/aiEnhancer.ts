/**
 * Snap-to-Form AI Enhancer (client wrapper)
 *
 * Sends the local parser draft + per-page OCR text + downscaled page
 * thumbnails to the `snap-to-form-ai` edge function. The edge function
 * calls Gemini Vision via the Lovable AI Gateway and returns a clean
 * ParsedForm via tool calling.
 *
 * If anything fails (no credits, rate-limited, network error, malformed
 * response), this function THROWS — the dialog catches and falls back to
 * the local heuristic draft so the user never gets stuck.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ParsedForm } from "./formParser";
import type { OcrPageResult } from "./ocrEngine";

export type AIEnhanceErrorCode =
  | "rate_limited"
  | "no_credits"
  | "network"
  | "malformed"
  | "disabled"
  | "unknown";

export class AIEnhanceError extends Error {
  code: AIEnhanceErrorCode;
  constructor(message: string, code: AIEnhanceErrorCode) {
    super(message);
    this.code = code;
  }
}

const THUMBNAIL_MAX = 1024; // px on the longest side — keep payload small

/** Downscale a dataURL to a JPEG thumbnail for the AI request. */
async function makeThumbnail(dataUrl: string, max = THUMBNAIL_MAX): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width > max || height > max) {
        const scale = max / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export interface AIEnhanceInput {
  draft: ParsedForm;
  ocrPages: OcrPageResult[];
  pageDataUrls: string[]; // original full-size pages (we'll thumbnail)
  extraInstructions?: string;
  /** Optional model override; defaults to gemini-2.5-flash on the server. */
  model?: string;
  /** Progress callback ("Compressing pages 2/4", "Calling AI…", etc.) */
  onProgress?: (msg: string) => void;
}

export interface AIEnhanceResult {
  form: ParsedForm;
  model: string;
}

export async function enhanceWithAI(input: AIEnhanceInput): Promise<AIEnhanceResult> {
  const { draft, ocrPages, pageDataUrls, extraInstructions, model, onProgress } = input;

  if (!ocrPages.length || !pageDataUrls.length) {
    throw new AIEnhanceError("No pages to enhance", "disabled");
  }

  // Prepare thumbnails sequentially to keep memory low on mobile.
  const pages: { ocrText: string; thumbnailDataUrl: string }[] = [];
  const total = Math.min(ocrPages.length, pageDataUrls.length);
  for (let i = 0; i < total; i++) {
    onProgress?.(`Compressing page ${i + 1}/${total} for AI…`);
    const thumb = await makeThumbnail(pageDataUrls[i]);
    pages.push({
      ocrText: ocrPages[i]?.text || "",
      thumbnailDataUrl: thumb,
    });
  }

  onProgress?.("Calling Lovable AI (Gemini Vision)…");

  const { data, error } = await supabase.functions.invoke("snap-to-form-ai", {
    body: {
      draft,
      pages,
      extraInstructions,
      model,
    },
  });

  if (error) {
    // supabase.functions.invoke surfaces non-2xx as an error. Try to read code.
    const status = (error as any)?.context?.status as number | undefined;
    const ctxBody = await readErrorBody(error);
    if (status === 429 || ctxBody?.code === "rate_limited") {
      throw new AIEnhanceError(
        ctxBody?.error || "AI is busy. Please retry shortly.",
        "rate_limited",
      );
    }
    if (status === 402 || ctxBody?.code === "no_credits") {
      throw new AIEnhanceError(
        ctxBody?.error || "AI credits exhausted.",
        "no_credits",
      );
    }
    throw new AIEnhanceError(
      ctxBody?.error || error.message || "AI enhancement failed",
      "network",
    );
  }

  if (!data?.ok || !data?.form) {
    throw new AIEnhanceError("AI returned an unexpected response", "malformed");
  }

  return { form: data.form as ParsedForm, model: data.model || "gemini" };
}

async function readErrorBody(err: any): Promise<{ error?: string; code?: string } | null> {
  try {
    const ctx = err?.context;
    if (!ctx) return null;
    if (typeof ctx.json === "function") return await ctx.json();
    if (typeof ctx.text === "function") {
      const t = await ctx.text();
      try {
        return JSON.parse(t);
      } catch {
        return { error: t };
      }
    }
    return null;
  } catch {
    return null;
  }
}
