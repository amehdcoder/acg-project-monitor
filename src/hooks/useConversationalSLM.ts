/**
 * useConversationalSLM
 *
 * In-browser Small Language Model (Phi-3-mini ~2.4GB via WebLLM + WebGPU).
 *
 * Lets the user describe many fields in one sentence. The model returns a JSON
 * object mapping question `id -> value`, which the form engine then writes in
 * one pass. No AI credits, no network round-trip after the first download.
 *
 * Status flow:
 *   "idle" → "loading" (with progress) → "ready" → "extracting" → "ready"
 *                                       └─ "unsupported" / "error"
 *
 * The hook is lazy: nothing is downloaded until `loadModel()` is called.
 * Subsequent loads hit the WebLLM IndexedDB cache and complete in seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceQuestion } from "./useVoiceFormEngine";

export type SLMStatus = "idle" | "loading" | "ready" | "extracting" | "error" | "unsupported";

export interface SLMProgress {
  /** 0–1 download progress reported by WebLLM. */
  progress: number;
  /** Human-readable current step (e.g. "Fetching shard 3/5"). */
  text: string;
}

export interface ExtractedAnswer {
  questionId: string;
  value: any;
  confidence: number;
}

interface UseConversationalSLMOptions {
  /** Model id from the WebLLM prebuilt config. Phi-3-mini-4k q4f16 ~2.4GB. */
  modelId?: string;
  /** Called whenever loading progress updates. */
  onProgress?: (p: SLMProgress) => void;
}

const DEFAULT_MODEL = "Phi-3-mini-4k-instruct-q4f16_1-MLC";

/** WebGPU is required for fast inference. CPU fallback is impractical for 2B+ models. */
function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).gpu;
}

/** Strip HTML tags & collapse whitespace from a question label. */
function cleanLabel(label: string): string {
  return label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Build a compact schema description for the prompt. */
function buildSchemaPrompt(questions: VoiceQuestion[]): string {
  return questions
    .map((q, i) => {
      const label = cleanLabel(q.label);
      const opts =
        q.options && q.options.length
          ? ` [choices: ${q.options.map((o) => o.label).join(" | ")}]`
          : "";
      const range =
        q.min !== undefined || q.max !== undefined
          ? ` [range: ${q.min ?? "-∞"}..${q.max ?? "∞"}]`
          : "";
      const req = q.required ? " *required" : "";
      return `${i + 1}. id="${q.id}" type=${q.type}${req} — ${label}${opts}${range}`;
    })
    .join("\n");
}

/** Extract the first balanced JSON object substring from raw model output. */
function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

export function useConversationalSLM(opts: UseConversationalSLMOptions = {}) {
  const { modelId = DEFAULT_MODEL, onProgress } = opts;
  const [status, setStatus] = useState<SLMStatus>("idle");
  const [progress, setProgress] = useState<SLMProgress>({ progress: 0, text: "" });
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<any>(null);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  // Detect WebGPU on mount.
  useEffect(() => {
    if (!isWebGPUSupported()) setStatus("unsupported");
  }, []);

  /**
   * Lazily load the WebLLM engine + model weights. Safe to call multiple
   * times: in-flight loads share the same promise, completed loads no-op.
   */
  const loadModel = useCallback(async (): Promise<void> => {
    if (engineRef.current) return;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;
    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      throw new Error("WebGPU is not supported on this device.");
    }

    setStatus("loading");
    setError(null);
    setProgress({ progress: 0, text: "Initialising AI engine…" });

    const loadPromise = (async () => {
      try {
        const webllm = await import("@mlc-ai/web-llm");
        const engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (report: any) => {
            const next: SLMProgress = {
              progress: typeof report.progress === "number" ? report.progress : 0,
              text: report.text || "Loading model…",
            };
            setProgress(next);
            onProgress?.(next);
          },
        });
        engineRef.current = engine;
        setStatus("ready");
        setProgress({ progress: 1, text: "Model ready" });
      } catch (e: any) {
        console.error("WebLLM load failed:", e);
        setStatus("error");
        setError(e?.message || "Failed to load AI model");
        throw e;
      } finally {
        loadingPromiseRef.current = null;
      }
    })();

    loadingPromiseRef.current = loadPromise;
    return loadPromise;
  }, [modelId, onProgress]);

  /**
   * Extract structured answers from a free-form sentence.
   *
   * Returns one entry per question the model believes was answered. The form
   * engine should still validate values against question constraints.
   */
  const extractAnswers = useCallback(
    async (
      sentence: string,
      questions: VoiceQuestion[],
    ): Promise<ExtractedAnswer[]> => {
      if (!engineRef.current) throw new Error("Model not loaded. Call loadModel() first.");
      if (!sentence.trim() || questions.length === 0) return [];

      setStatus("extracting");
      try {
        const schema = buildSchemaPrompt(questions);
        const system = [
          "You extract structured form answers from natural-language sentences.",
          "Return ONLY a JSON object mapping question id to extracted value.",
          "Rules:",
          "- Use the exact id from the schema as the key.",
          "- Numbers as numbers, booleans as true/false, dates as YYYY-MM-DD.",
          "- For select_one: return one choice value/label.",
          "- For select_multiple: return an array of choice labels.",
          "- Omit any field the user did not answer (do not invent values).",
          "- Never include explanations, markdown, or extra keys.",
        ].join("\n");

        const user = [
          "FORM SCHEMA:",
          schema,
          "",
          "USER SENTENCE:",
          `"${sentence.trim()}"`,
          "",
          'Return JSON like: {"question_id_1": value, "question_id_2": value}',
        ].join("\n");

        const reply = await engineRef.current.chat.completions.create({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0,
          max_tokens: 800,
          response_format: { type: "json_object" },
        });

        const raw: string = reply?.choices?.[0]?.message?.content ?? "";
        const jsonStr = extractFirstJsonObject(raw) ?? raw;

        let parsed: Record<string, any>;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          console.warn("SLM returned non-JSON output:", raw.slice(0, 300));
          return [];
        }

        const results: ExtractedAnswer[] = [];
        for (const q of questions) {
          if (parsed[q.id] === undefined || parsed[q.id] === null || parsed[q.id] === "") continue;
          results.push({ questionId: q.id, value: parsed[q.id], confidence: 0.85 });
        }
        return results;
      } finally {
        setStatus("ready");
      }
    },
    [],
  );

  /** Free model weights from GPU memory. */
  const unload = useCallback(async () => {
    try {
      if (engineRef.current?.unload) await engineRef.current.unload();
    } catch (e) {
      console.warn("WebLLM unload failed:", e);
    }
    engineRef.current = null;
    setStatus(isWebGPUSupported() ? "idle" : "unsupported");
    setProgress({ progress: 0, text: "" });
  }, []);

  return {
    status,
    progress,
    error,
    isReady: status === "ready" || status === "extracting",
    isSupported: isWebGPUSupported(),
    loadModel,
    extractAnswers,
    unload,
  };
}
