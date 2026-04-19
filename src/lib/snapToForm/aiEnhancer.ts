/**
 * Snap-to-Form In-App AI Enhancer
 *
 * 100% on-device, ZERO Lovable AI credits. Runs Phi-3.5-mini (or Llama-3.2)
 * inside the browser via @mlc-ai/web-llm + WebGPU. After the first ~2GB
 * weights download (cached forever in IndexedDB), subsequent enhancements
 * are fully offline and instantaneous.
 *
 * Pipeline:
 *   1. Local heuristic parser builds a draft from OCR text.
 *   2. We feed (draft + per-page OCR text + extra instructions) to the SLM
 *      with a strict JSON schema and tool-style instructions.
 *   3. The SLM returns a cleaned ParsedForm: better names, fixed types,
 *      richer options, regex/range validation, skip logic, repeat groups,
 *      multilingual labels translated to English.
 *
 * If WebGPU is missing, the model fails to load, or the model outputs
 * un-parseable JSON, this function THROWS — the dialog catches and falls
 * back to the local heuristic draft so the user is never blocked.
 */

import type { ParsedForm } from "./formParser";
import type { OcrPageResult } from "./ocrEngine";

export type AIEnhanceErrorCode =
  | "unsupported"
  | "load_failed"
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

/** WebLLM prebuilt model id. Phi-3.5-mini is small (~2.4GB) and structured-output friendly. */
const DEFAULT_MODEL_ID = "Phi-3.5-mini-instruct-q4f16_1-MLC";

/** Cached WebLLM engine — loads once per browser tab. */
let enginePromise: Promise<any> | null = null;
let loadedModelId: string | null = null;

function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).gpu;
}

export interface AIEnhanceInput {
  draft: ParsedForm;
  ocrPages: OcrPageResult[];
  /** Original full-size pages (kept for API compatibility — unused on-device). */
  pageDataUrls?: string[];
  extraInstructions?: string;
  /** Optional WebLLM model id override. */
  model?: string;
  /** Progress callback ("Loading on-device AI 23%…", "Refining structure…"). */
  onProgress?: (msg: string) => void;
}

export interface AIEnhanceResult {
  form: ParsedForm;
  model: string;
}

/** Lazy-load the WebLLM engine. Subsequent calls hit the IndexedDB cache. */
async function getEngine(modelId: string, onProgress?: (msg: string) => void) {
  if (!isWebGPUSupported()) {
    throw new AIEnhanceError(
      "On-device AI needs WebGPU (Chrome/Edge desktop or recent Android Chrome).",
      "unsupported",
    );
  }

  if (enginePromise && loadedModelId === modelId) return enginePromise;

  loadedModelId = modelId;
  enginePromise = (async () => {
    try {
      const webllm = await import("@mlc-ai/web-llm");
      onProgress?.("Initialising on-device AI…");
      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report: any) => {
          const pct = typeof report.progress === "number" ? Math.round(report.progress * 100) : 0;
          const text = report.text || "Loading model";
          onProgress?.(`On-device AI: ${text}${pct > 0 ? ` (${pct}%)` : ""}`);
        },
      });
      onProgress?.("On-device AI ready");
      return engine;
    } catch (e: any) {
      enginePromise = null;
      loadedModelId = null;
      throw new AIEnhanceError(
        e?.message || "Failed to load on-device AI model",
        "load_failed",
      );
    }
  })();

  return enginePromise;
}

const QUESTION_TYPES = [
  "text", "number", "select_one", "select_multiple", "date", "time", "datetime",
  "geopoint", "geotrace", "geoshape", "image", "audio", "video", "file",
  "barcode", "calculate", "note", "range", "rank", "matrix", "signature", "acknowledge",
] as const;

const SYSTEM_PROMPT = `You are a form-digitization expert. You convert raw OCR text from photographed paper forms into a clean, structured digital form.

You will receive:
  1. Per-page OCR text (may contain typos & broken whitespace)
  2. A draft ParsedForm from a local heuristic parser
  3. Optional user context

Return ONLY a single JSON object with this exact shape:
{
  "formName": "string (≤60 chars)",
  "formDescription": "string (one sentence)",
  "detectedLanguage": "ISO 639-1 code, e.g. en, ha, yo, fr",
  "overallConfidence": 0.0-1.0,
  "groups": [
    {
      "name": "snake_case",
      "label": "Human label",
      "repeat": false,
      "relevant": "optional XLSForm expression",
      "questions": [
        {
          "name": "snake_case (≤60 chars)",
          "label": "Clean question text",
          "hint": "optional",
          "type": "one of: ${QUESTION_TYPES.join(", ")}",
          "required": true|false,
          "options": [{"value": "yes", "label": "Yes"}],
          "validation": {"min": 0, "max": 120, "regex": "...", "message": "..."},
          "relevant": "optional skip-logic XLSForm expression",
          "aiUpgrade": "optional one-line note about an upgrade you applied",
          "confidence": 0.0-1.0,
          "sourcePage": 1
        }
      ]
    }
  ],
  "suggestedUpgrades": [{"title": "...", "rationale": "..."}],
  "warnings": ["..."]
}

Rules:
- ONLY use the listed question types.
- "select_one" / "select_multiple" need 2+ options.
- Detect skip logic ("If yes, …") → relevant: \`\${prev_q} = 'yes'\`
- Detect repeat groups ("for each child", "list up to 5") → group.repeat = true
- Numeric ranges in labels like "(0-120)" → validation.min/max
- Phone fields → regex "^[+0-9\\s()-]{7,}$"; NIN/BVN → "^[0-9]{11}$"
- 'geopoint' for GPS/location; 'image' for photo/evidence; 'signature' for sign-off; 'barcode' for ID/QR
- Repair OCR typos in labels but keep original meaning
- snake_case 'name' for every question (lowercase, ascii, underscores)
- Translate non-English labels to clear English; keep original in 'hint' if useful
- Confidence: 0.95 = clearly read; 0.7 = ambiguous; 0.5 = guess
- NEVER invent fields not in the OCR
- OUTPUT MUST BE VALID JSON. No markdown, no commentary, no trailing commas.`;

/** Extract first balanced JSON object from raw model output. */
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
  const { draft, ocrPages, extraInstructions, model = DEFAULT_MODEL_ID, onProgress } = input;

  if (!ocrPages.length) {
    throw new AIEnhanceError("No OCR pages to enhance", "disabled");
  }

  const engine = await getEngine(model, onProgress);

  // Build user prompt
  const MAX_OCR_CHARS_PER_PAGE = 4500;
  const MAX_TOTAL_OCR = 20000;
  let totalChars = 0;
  const ocrSummary = ocrPages
    .map((p, i) => {
      const remaining = MAX_TOTAL_OCR - totalChars;
      if (remaining <= 0) return null;
      const slice = (p.text || "").slice(0, Math.min(MAX_OCR_CHARS_PER_PAGE, remaining));
      totalChars += slice.length;
      return `--- Page ${i + 1} OCR ---\n${slice}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const draftJson = JSON.stringify(draft, null, 2).slice(0, 8000);

  const userPrompt = [
    "Local parser draft (improve this):",
    "```json",
    draftJson,
    "```",
    "",
    "Per-page OCR text:",
    ocrSummary,
    extraInstructions ? `\nUser context:\n${extraInstructions.slice(0, 1000)}` : "",
    "",
    "Return ONE valid JSON object with the cleaned, structured form. No markdown, no commentary.",
  ].join("\n");

  onProgress?.("On-device AI: refining form structure…");

  let raw = "";
  try {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 3500,
      response_format: { type: "json_object" },
    });
    raw = reply?.choices?.[0]?.message?.content ?? "";
  } catch (e: any) {
    throw new AIEnhanceError(e?.message || "On-device AI inference failed", "unknown");
  }

  const jsonStr = extractFirstJsonObject(raw) ?? raw;
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn("On-device AI returned non-JSON output:", raw.slice(0, 400));
    throw new AIEnhanceError("On-device AI returned malformed JSON", "malformed");
  }

  if (!parsed?.groups || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
    throw new AIEnhanceError("On-device AI returned empty form", "malformed");
  }

  const form = normalize(parsed);
  return { form, model };
}

/** Optionally pre-warm the model (e.g. when the dialog opens) so the first run is fast. */
export async function prewarmAI(modelId: string = DEFAULT_MODEL_ID, onProgress?: (msg: string) => void) {
  if (!isWebGPUSupported()) return;
  try {
    await getEngine(modelId, onProgress);
  } catch {
    /* swallow — dialog will surface error if user actually triggers AI */
  }
}

export function isOnDeviceAISupported(): boolean {
  return isWebGPUSupported();
}
