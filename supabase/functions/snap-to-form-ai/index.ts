/**
 * Snap-to-Form AI Enhancer (Lovable AI Gateway)
 *
 * Takes the local OCR draft + raw OCR text and returns a cleaned, structured
 * ParsedForm. Uses the Lovable AI Gateway (default: google/gemini-3-flash-preview)
 * via tool calling for reliable structured output.
 */

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const QUESTION_TYPES = [
  "text", "number", "select_one", "select_multiple", "date", "time", "datetime",
  "geopoint", "geotrace", "geoshape", "image", "audio", "video", "file",
  "barcode", "calculate", "note", "range", "rank", "matrix", "signature", "acknowledge",
];

const SYSTEM_PROMPT = `You are a form-digitization expert. Convert raw OCR text from photographed paper forms into a clean, structured digital form.

Rules:
- Use ONLY these question types: ${QUESTION_TYPES.join(", ")}.
- "select_one" / "select_multiple" must have 2+ options.
- Detect skip logic ("If yes, …") → set relevant: \`prev_q = 'yes'\`.
- Detect repeat groups ("for each child", "list up to 5") → group.repeat = true.
- Numeric ranges in labels like "(0-120)" → validation.min/max.
- Phone fields → regex "^[+0-9\\s()-]{7,}$"; NIN/BVN → "^[0-9]{11}$".
- Use 'geopoint' for GPS/location; 'image' for photo/evidence; 'signature' for sign-off; 'barcode' for ID/QR.
- Repair OCR typos but keep original meaning.
- snake_case 'name' for every question (lowercase, ascii, underscores, ≤60 chars).
- Translate non-English labels to clear English; keep original in 'hint' if useful.
- Confidence: 0.95 = clearly read; 0.7 = ambiguous; 0.5 = guess.
- NEVER invent fields not in the OCR.`;

const TOOL = {
  type: "function",
  function: {
    name: "return_parsed_form",
    description: "Return the cleaned, structured form derived from OCR text and the local parser draft.",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string", description: "Form title (≤60 chars)" },
        formDescription: { type: "string" },
        detectedLanguage: { type: "string", description: "ISO 639-1 code, e.g. en, ha, yo, fr" },
        overallConfidence: { type: "number" },
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
                    type: { type: "string", enum: QUESTION_TYPES },
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
            },
            required: ["title", "rationale"],
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["formName", "groups", "overallConfidence"],
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const draft = body?.draft;
    const ocrPages: { text?: string }[] = Array.isArray(body?.ocrPages) ? body.ocrPages : [];
    const extraInstructions: string = (body?.extraInstructions || "").toString().slice(0, 1000);
    const model: string = body?.model || "google/gemini-3-flash-preview";

    if (!draft || ocrPages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing draft or ocrPages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap OCR text to keep prompt small
    const MAX_OCR_CHARS_PER_PAGE = 4500;
    const MAX_TOTAL_OCR = 22000;
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

    const draftJson = JSON.stringify(draft).slice(0, 8000);

    const userPrompt = [
      "Local parser draft (improve this):",
      draftJson,
      "",
      "Per-page OCR text:",
      ocrSummary,
      extraInstructions ? `\nUser context:\n${extraInstructions}` : "",
      "",
      "Call the return_parsed_form tool with the cleaned, structured form.",
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_parsed_form" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits to continue using AI Enhance." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr: string | undefined = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("No tool call in AI response:", JSON.stringify(data).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI returned no structured output" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("Failed to parse tool arguments:", argsStr.slice(0, 400));
      return new Response(
        JSON.stringify({ error: "AI returned malformed JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ form: parsed, model }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("snap-to-form-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
