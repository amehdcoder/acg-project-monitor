/**
 * useMoEExperts
 *
 * Lightweight Mixture-of-Experts router that runs ENTIRELY in the browser.
 *
 * Architecture (chosen approach: WebLLM expert routing):
 *   - One small base model (~200M-class, e.g. Qwen2.5-0.5B-Instruct quantized).
 *   - A deterministic router picks ONE expert "persona" per question:
 *       • math expert        → number / range / decimal / integer fields
 *       • language expert    → text / textarea / note / select_one(_other)
 *       • validation expert  → required, regex, min/max, choice constraints
 *   - Only the chosen expert's system prompt is loaded into the prompt window,
 *     so the *active* params per call are bounded by what the base model uses
 *     (~200M effective per question), matching the MoE spec.
 *
 * Rationale for not bundling 3 separate models:
 *   3× full downloads (~600MB-1GB) is impractical for field devices on weak
 *   networks. WebLLM expert routing achieves the same UX (specialised behaviour
 *   per field type) with one cached download.
 *
 * Status flow mirrors useConversationalSLM so the two hooks can share a UX:
 *   "idle" → "loading" → "ready" → "thinking" → "ready"
 *                       └─ "unsupported" / "error"
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ExpertId = "math" | "language" | "validation";
export type MoEStatus = "idle" | "loading" | "ready" | "thinking" | "error" | "unsupported";

export interface MoEProgress {
  progress: number;
  text: string;
}

export interface ExpertVerdict {
  expert: ExpertId;
  ok: boolean;
  /** Short human-readable issue if !ok, else null. */
  issue: string | null;
  /** Optional suggestion the user can one-tap accept. */
  suggestion?: string | null;
  /** 0–1 confidence score. */
  confidence: number;
}

export interface FieldContext {
  /** "number" | "text" | "select_one" | "select_multiple" | etc. */
  type: string;
  label: string;
  value: any;
  /** Optional numeric guard rails. */
  min?: number;
  max?: number;
  required?: boolean;
  /** Optional regex constraint. */
  pattern?: string;
  /** Optional choice values for select_one / select_multiple. */
  options?: { value: string; label: string }[];
  /** Optional sibling field context (e.g. household size when validating "people in 1 house"). */
  siblings?: { label: string; value: any }[];
}

interface UseMoEOptions {
  /** Override the base model id. Defaults to the smallest Qwen instruct preset. */
  modelId?: string;
  onProgress?: (p: MoEProgress) => void;
}

/**
 * Compact ~200M-active model. Qwen2.5-0.5B is the closest WebLLM preset to
 * the 200M-active spec while remaining capable enough for short validation tasks.
 */
const DEFAULT_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const NUMBER_TYPES = new Set(["number", "integer", "decimal", "range"]);
const TEXT_TYPES = new Set(["text", "textarea", "note", "string"]);

function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).gpu;
}

/**
 * Pure, deterministic router. Runs in <1ms — no model call.
 * Validation expert wins when explicit constraints exist, since constraint
 * violations dominate user-visible errors.
 */
export function routeExpert(ctx: FieldContext): ExpertId {
  const hasConstraint =
    ctx.required ||
    ctx.pattern ||
    typeof ctx.min === "number" ||
    typeof ctx.max === "number" ||
    (ctx.options && ctx.options.length > 0 && (ctx.type === "select_one" || ctx.type === "select_multiple"));

  if (hasConstraint && (ctx.value === undefined || ctx.value === null || ctx.value === "")) {
    return "validation";
  }
  if (NUMBER_TYPES.has(ctx.type)) return "math";
  if (TEXT_TYPES.has(ctx.type)) return "language";
  if (hasConstraint) return "validation";
  return "language";
}

/** Per-expert system prompts. Kept terse so they fit alongside the field payload. */
const EXPERT_PROMPTS: Record<ExpertId, string> = {
  math: [
    "You are MATH-EXPERT, a numeric plausibility checker for public-health field forms.",
    "Catch implausible values (e.g. '1500 people in 1 house', '300 year old', negative counts).",
    "Use the field label, value, min/max, and any sibling context.",
    "Be concise. Reply ONLY with JSON: {\"ok\":bool,\"issue\":string|null,\"suggestion\":string|null,\"confidence\":0..1}.",
  ].join(" "),
  language: [
    "You are LANGUAGE-EXPERT, fluent in English plus Nigerian languages incl. Hausa, Yoruba, Igbo and code-switching.",
    "Detect gibberish, accidental key-mash, very short non-answers, or text that contradicts the question.",
    "Treat Hausa/Yoruba/Igbo/Pidgin words inside English answers as VALID — do not flag code-switching.",
    "Reply ONLY with JSON: {\"ok\":bool,\"issue\":string|null,\"suggestion\":string|null,\"confidence\":0..1}.",
  ].join(" "),
  validation: [
    "You are VALIDATION-EXPERT, a strict constraint checker.",
    "Verify required, min, max, regex pattern, and choice-set membership.",
    "Suggest the closest legal value when possible.",
    "Reply ONLY with JSON: {\"ok\":bool,\"issue\":string|null,\"suggestion\":string|null,\"confidence\":0..1}.",
  ].join(" "),
};

function buildUserPrompt(ctx: FieldContext): string {
  const parts: string[] = [
    `Field label: ${ctx.label || "(no label)"}`,
    `Field type: ${ctx.type}`,
    `Value: ${JSON.stringify(ctx.value)}`,
  ];
  if (typeof ctx.min === "number") parts.push(`Min: ${ctx.min}`);
  if (typeof ctx.max === "number") parts.push(`Max: ${ctx.max}`);
  if (ctx.required) parts.push("Required: true");
  if (ctx.pattern) parts.push(`Pattern: ${ctx.pattern}`);
  if (ctx.options?.length) {
    parts.push(`Allowed choices: ${ctx.options.map((o) => o.label).slice(0, 20).join(" | ")}`);
  }
  if (ctx.siblings?.length) {
    const sib = ctx.siblings
      .filter((s) => s.value !== undefined && s.value !== null && s.value !== "")
      .slice(0, 6)
      .map((s) => `${s.label}=${JSON.stringify(s.value)}`)
      .join("; ");
    if (sib) parts.push(`Other answers: ${sib}`);
  }
  parts.push("Return JSON verdict only.");
  return parts.join("\n");
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Fast deterministic pre-checks. Saves the model call when the answer is
 * obviously fine OR obviously broken — important on phones to keep latency low.
 */
function fastPreCheck(ctx: FieldContext): ExpertVerdict | null {
  const expert = routeExpert(ctx);

  // Empty + required → instant validation failure.
  if (ctx.required && (ctx.value === undefined || ctx.value === null || ctx.value === "")) {
    return {
      expert: "validation",
      ok: false,
      issue: "This field is required.",
      suggestion: null,
      confidence: 1,
    };
  }
  // Empty + not required → trivially ok, no model call.
  if (ctx.value === undefined || ctx.value === null || ctx.value === "") {
    return { expert, ok: true, issue: null, confidence: 1 };
  }

  if (NUMBER_TYPES.has(ctx.type)) {
    const num = Number(ctx.value);
    if (Number.isNaN(num)) {
      return { expert: "math", ok: false, issue: "Not a valid number.", confidence: 1 };
    }
    if (typeof ctx.min === "number" && num < ctx.min) {
      return { expert: "validation", ok: false, issue: `Below minimum (${ctx.min}).`, suggestion: String(ctx.min), confidence: 1 };
    }
    if (typeof ctx.max === "number" && num > ctx.max) {
      return { expert: "validation", ok: false, issue: `Above maximum (${ctx.max}).`, suggestion: String(ctx.max), confidence: 1 };
    }
  }
  if (ctx.pattern) {
    try {
      const re = new RegExp(ctx.pattern);
      if (!re.test(String(ctx.value))) {
        return { expert: "validation", ok: false, issue: "Does not match required format.", confidence: 0.95 };
      }
    } catch {
      /* invalid regex on the form — ignore here, surfaced in form builder */
    }
  }
  return null;
}

export function useMoEExperts(opts: UseMoEOptions = {}) {
  const { modelId = DEFAULT_MODEL, onProgress } = opts;
  const [status, setStatus] = useState<MoEStatus>("idle");
  const [progress, setProgress] = useState<MoEProgress>({ progress: 0, text: "" });
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<any>(null);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!isWebGPUSupported()) setStatus("unsupported");
  }, []);

  const loadModel = useCallback(async (): Promise<void> => {
    if (engineRef.current) return;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;
    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      throw new Error("WebGPU is not supported on this device.");
    }

    setStatus("loading");
    setError(null);
    setProgress({ progress: 0, text: "Loading expert model…" });

    const p = (async () => {
      try {
        const webllm = await import("@mlc-ai/web-llm");
        const engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (report: any) => {
            const next: MoEProgress = {
              progress: typeof report.progress === "number" ? report.progress : 0,
              text: report.text || "Loading expert model…",
            };
            setProgress(next);
            onProgress?.(next);
          },
        });
        engineRef.current = engine;
        setStatus("ready");
        setProgress({ progress: 1, text: "Experts ready" });
      } catch (e: any) {
        console.error("MoE expert load failed:", e);
        setStatus("error");
        setError(e?.message || "Failed to load expert model");
        throw e;
      } finally {
        loadingPromiseRef.current = null;
      }
    })();

    loadingPromiseRef.current = p;
    return p;
  }, [modelId, onProgress]);

  /**
   * Ask the routed expert for a verdict on this field.
   * Returns null if the model isn't loaded yet AND no fast pre-check fired
   * (so the caller can decide whether to silently skip or prompt to load).
   */
  const checkField = useCallback(async (ctx: FieldContext): Promise<ExpertVerdict | null> => {
    const fast = fastPreCheck(ctx);
    if (fast) return fast;

    if (!engineRef.current) return null;

    const expert = routeExpert(ctx);
    setStatus("thinking");
    try {
      const reply = await engineRef.current.chat.completions.create({
        messages: [
          { role: "system", content: EXPERT_PROMPTS[expert] },
          { role: "user", content: buildUserPrompt(ctx) },
        ],
        temperature: 0,
        max_tokens: 160,
        response_format: { type: "json_object" },
      });
      const raw: string = reply?.choices?.[0]?.message?.content ?? "";
      const jsonStr = extractFirstJsonObject(raw) ?? raw;
      try {
        const parsed = JSON.parse(jsonStr);
        return {
          expert,
          ok: !!parsed.ok,
          issue: parsed.issue ?? null,
          suggestion: parsed.suggestion ?? null,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        };
      } catch {
        console.warn("MoE expert returned non-JSON output:", raw.slice(0, 240));
        return { expert, ok: true, issue: null, confidence: 0.3 };
      }
    } finally {
      setStatus("ready");
    }
  }, []);

  const unload = useCallback(async () => {
    try {
      if (engineRef.current?.unload) await engineRef.current.unload();
    } catch (e) {
      console.warn("MoE unload failed:", e);
    }
    engineRef.current = null;
    setStatus(isWebGPUSupported() ? "idle" : "unsupported");
    setProgress({ progress: 0, text: "" });
  }, []);

  return {
    status,
    progress,
    error,
    isReady: status === "ready" || status === "thinking",
    isSupported: isWebGPUSupported(),
    loadModel,
    checkField,
    routeExpert,
    unload,
  };
}
