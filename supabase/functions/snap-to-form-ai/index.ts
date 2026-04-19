// Snap-to-Form AI Enhancer
//
// Takes the local heuristic parser's draft + per-page OCR text + low-res page
// thumbnails and asks Gemini Vision (via the Lovable AI Gateway) to:
//   - fix OCR typos and clean question labels
//   - infer correct types, options, validation, skip logic
//   - detect sections / repeat groups / tables
//   - handle handwriting & multilingual headings (Hausa/Yoruba/Igbo/Arabic/French)
//   - auto-add GPS / photo / signature / barcode where context implies them
//   - generate a concise form title + description
//
// Returns a strict ParsedForm shape via tool calling so the client never has
// to JSON-repair model output. Falls through 429/402 with structured errors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const QUESTION_TYPES = [
  "text",
  "number",
  "select_one",
  "select_multiple",
  "date",
  "time",
  "datetime",
  "geopoint",
  "geotrace",
  "geoshape",
  "image",
  "audio",
  "video",
  "file",
  "barcode",
  "calculate",
  "note",
  "range",
  "rank",
  "matrix",
  "signature",
  "acknowledge",
] as const;

const SYSTEM_PROMPT = `You are a world-class form-digitization expert that converts photographed paper forms into clean, structured digital surveys.

You will receive:
  1. Page thumbnails (look at them carefully — they reveal layout, checkboxes, handwriting, multi-column structure, tables)
  2. The raw OCR text per page (may contain typos and broken whitespace)
  3. A draft ParsedForm produced by a local heuristic parser
  4. Optional user context (language, audience, special rules)

Your job is to return a SIGNIFICANTLY improved ParsedForm by calling the "return_parsed_form" tool.

Critical rules:
- ONLY use these question types: ${QUESTION_TYPES.join(", ")}
- "select_one" requires 2+ options; "select_multiple" requires 2+ options.
- Detect skip logic ("If yes, …", "If no, skip to …") and write 'relevant' as XLSForm: ${prev_question_name} = 'yes'
- Detect repeat groups ("for each child", "list up to 5", "per household") and set group.repeat = true
- For numeric ranges in labels like "(0-120)", set validation.min/max
- For phone fields set validation.regex = "^[+0-9\\s()-]{7,}$"; for email set the email regex; for NIN set "^[0-9]{11}$"; for BVN set "^[0-9]{11}$"
- Use 'geopoint' for GPS/site/location fields; 'image' for photo/evidence; 'signature' for sign-off; 'barcode' for ID/QR scans
- Repair OCR typos in labels but keep the original intent
- Auto-generate a clean snake_case 'name' for every question (lowercase, ascii, underscores, max 60 chars)
- Detect sections and create one group per section; first group is "main" if no sections exist
- If the form is in Hausa/Yoruba/Igbo/Arabic/French/etc., set detectedLanguage and translate labels to clear English while preserving meaning. Add the original wording to 'hint' if useful.
- Add aiUpgrade text only when you genuinely upgraded a field (e.g., "Detected GPS field — using auto-capture")
- Confidence: 0.95 for crisp printed labels you saw clearly; 0.7 for ambiguous; 0.5 for guesses
- NEVER invent fields not visible in the OCR or images
- Generate a concise formName (≤ 60 chars) and a one-sentence formDescription
- For each section that mentions "evidence/proof/photo" but lacks a photo field, propose adding one as a suggestedUpgrade
- Output MUST be valid against the tool schema — no extra keys, no nulls in required fields`;

const PARSED_FORM_TOOL = {
  type: "function",
  function: {
    name: "return_parsed_form",
    description: "Return the cleaned, structured ParsedForm.",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string", description: "Concise form title, max 60 chars" },
        formDescription: { type: "string", description: "One-sentence description" },
        detectedLanguage: { type: "string", description: "ISO 639-1 code, e.g. 'en', 'ha', 'yo', 'fr'" },
        overallConfidence: { type: "number", description: "0–1 overall extraction confidence" },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              label: { type: "string" },
              repeat: { type: "boolean" },
              relevant: { type: "string" },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    label: { type: "string" },
                    hint: { type: "string" },
                    type: { type: "string", enum: QUESTION_TYPES as unknown as string[] },
                    required: { type: "boolean" },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          value: { type: "string" },
                          label: { type: "string" },
                        },
                        required: ["value", "label"],
                      },
                    },
                    validation: {
                      type: "object",
                      properties: {
                        min: { type: "number" },
                        max: { type: "number" },
                        regex: { type: "string" },
                        message: { type: "string" },
                      },
                    },
                    relevant: { type: "string" },
                    aiUpgrade: { type: "string" },
                    confidence: { type: "number" },
                    sourcePage: { type: "number" },
                  },
                  required: ["name", "label", "type", "required", "confidence"],
                },
              },
            },
            required: ["name", "label", "questions"],
          },
        },
        suggestedUpgrades: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              rationale: { type: "string" },
              appliedAsQuestionName: { type: "string" },
            },
            required: ["title", "rationale"],
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["formName", "overallConfidence", "groups"],
    },
  },
};

interface RequestBody {
  draft: any;
  pages: { ocrText: string; thumbnailDataUrl: string }[];
  extraInstructions?: string;
  model?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.draft || !Array.isArray(body?.pages) || body.pages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing draft or pages in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap inputs to keep token usage sane.
    const MAX_PAGES = 8;
    const MAX_OCR_CHARS = 6000;
    const trimmedPages = body.pages.slice(0, MAX_PAGES);

    // Build user message: draft JSON + per-page OCR + image parts
    const ocrSummary = trimmedPages
      .map(
        (p, i) =>
          `--- Page ${i + 1} OCR ---\n${(p.ocrText || "").slice(0, MAX_OCR_CHARS)}`,
      )
      .join("\n\n");

    const userText = [
      "Local parser draft (improve this):",
      "```json",
      JSON.stringify(body.draft, null, 2).slice(0, 12000),
      "```",
      "",
      "Per-page OCR text:",
      ocrSummary,
      body.extraInstructions
        ? `\nUser context:\n${body.extraInstructions.slice(0, 1000)}`
        : "",
      "",
      "Now look at the page images and call return_parsed_form with the corrected, structured form.",
    ].join("\n");

    const imageParts = trimmedPages.map((p) => ({
      type: "image_url",
      image_url: { url: p.thumbnailDataUrl },
    }));

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [{ type: "text", text: userText }, ...imageParts],
      },
    ];

    const model = body.model || "google/gemini-2.5-flash";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        tools: [PARSED_FORM_TOOL],
        tool_choice: { type: "function", function: { name: "return_parsed_form" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Lovable AI error", aiResponse.status, errText.slice(0, 500));
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit reached. Please wait a moment and try again.",
            code: "rate_limited",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.",
            code: "no_credits",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "AI gateway error", details: errText.slice(0, 200) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResponse.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("AI did not return a tool call", JSON.stringify(aiJson).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI did not return a structured form" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Tool args JSON parse failed", e);
      return new Response(
        JSON.stringify({ error: "AI returned malformed JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Defensive normalization: ensure required nested fields exist.
    parsed.groups = (parsed.groups || []).map((g: any) => ({
      name: g.name || "main",
      label: g.label || g.name || "Main",
      repeat: !!g.repeat,
      relevant: g.relevant,
      questions: (g.questions || []).map((q: any) => ({
        name: q.name,
        label: q.label,
        hint: q.hint,
        type: QUESTION_TYPES.includes(q.type) ? q.type : "text",
        required: !!q.required,
        options: Array.isArray(q.options) ? q.options : undefined,
        validation: q.validation,
        relevant: q.relevant,
        aiUpgrade: q.aiUpgrade,
        confidence: typeof q.confidence === "number" ? q.confidence : 0.7,
        sourcePage: q.sourcePage,
      })),
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        form: parsed,
        model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("snap-to-form-ai error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
