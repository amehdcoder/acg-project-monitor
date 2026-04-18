// Snap to Form - Convert paper forms (images/PDFs) into structured digital forms
// Uses Google Gemini API directly (via GOOGLE_GEMINI_API_KEY) for AI vision extraction.
// This avoids the Lovable AI credit pool entirely.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Gemini-compatible JSON schema (no $schema/additionalProperties keywords).
const FORM_SCHEMA = {
  type: "object",
  properties: {
    formName: { type: "string" },
    formDescription: { type: "string" },
    detectedLanguage: { type: "string" },
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
                type: {
                  type: "string",
                  enum: [
                    "text",
                    "number",
                    "select_one",
                    "select_multiple",
                    "date",
                    "time",
                    "datetime",
                    "geopoint",
                    "image",
                    "audio",
                    "video",
                    "barcode",
                    "signature",
                    "acknowledge",
                    "note",
                    "range",
                    "matrix",
                  ],
                },
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
  required: ["formName", "groups", "overallConfidence"],
};

const SYSTEM_PROMPT = `You are an expert forms architect and OCR specialist. Convert photographs and scans of paper forms, checklists, intake sheets and registration forms into clean, structured digital form schemas.

Be EXHAUSTIVE — read EVERY visible question, label, checkbox, blank, table cell, header and instruction across ALL provided pages. Do not skip rows in tables. Do not collapse multi-part questions.

Map paper conventions to digital types intuitively:
- "Date: __/__/____" -> date
- "Time: __:__" -> time
- "Phone: ___" -> text + phone regex (^[+0-9 ()-]{7,20}$)
- "Email: ___" -> text + email regex
- "Sex: [ ] M [ ] F" or "[ ] Male [ ] Female" -> select_one with those options
- Multiple checkboxes ("tick all that apply") -> select_multiple
- "Sign here" / signature line -> signature
- "Attach photo" / "Photo evidence" -> image
- "GPS / coordinates / Lat / Long / Site location" -> geopoint
- "Rate 1-5" / Likert scales -> range with min/max OR select_one with the labelled scale points
- Long blank box / "Comments" -> text
- "Yes / No" -> select_one with yes/no
- Numeric blanks with units (kg, cm, °C, mmHg, bpm, ml) -> number; put unit in hint
- Age fields -> number with min 0 max 120
- Numbered identical rows ("Child 1, Child 2, Child 3" or "Dose 1, Dose 2") -> repeat group
- Tables with row headers as questions and column headers as response options -> matrix OR a group of select_one questions

Detect SECTIONS from headings (ALL CAPS, "Section A:", "Part 1:", coloured bands). Use snake_case names. Use a single group named "main" only if no sections exist.

Detect REPEAT GROUPS from "For each child:", "List up to 5 medications:", "Per dose:", or visibly repeating numbered blocks. Set group.repeat = true.

Detect SKIP LOGIC: "If yes, go to Q5", "Only complete if pregnant", "Skip if N/A", arrows pointing to other questions. Express as XLSForm relevance like "\${has_symptoms} = 'yes'".

Detect VALIDATION: numeric ranges in parentheses ("(0-120)", "must be 18+"), digit counts ("phone 10 digits"), required formats. Populate validation.min/max/regex/message.

Mark required fields based on *, †, "(required)", "(mandatory)", or context (full name, primary ID, date of visit are typically required).

APPLY INTUITIVE UPGRADES (set aiUpgrade on the question):
- Form references a site/visit/location and has no GPS field -> add a geopoint.
- Form references condition/damage/evidence/proof and has no photo field -> add an image.
- Form requires sign-off/approval and has no signature line -> add a signature.

Assign confidence honestly. < 0.6 for handwritten, faded, ambiguous, or partially cut-off fields. Generate snake_case unique names. Never invent fields that aren't on paper unless aiUpgrade is set. List warnings for illegible regions.

Return ONLY a JSON object matching the requested schema. No prose, no markdown.`;

const dataUrlToInlineData = (
  dataUrl: string,
): { inline_data: { mime_type: string; data: string } } | null => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { images, model, extraInstructions } = await req.json();

    if (!Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide an 'images' array with at least one base64 data URL." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (images.length > 20) {
      return new Response(
        JSON.stringify({ error: "Maximum 20 pages per scan. Split into smaller batches." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!LOVABLE_API_KEY && !GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No AI provider configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userText =
      `Extract the COMPLETE form schema from these ${images.length} page(s) of a paper form. ` +
      `Be exhaustive — every question, every checkbox, every table row. Apply intuitive upgrades (smart field types, skip logic, validation, GPS/photo/signature additions, section grouping, repeat groups). ` +
      (extraInstructions ? `Extra context from the user: ${extraInstructions}` : "");

    // Try Lovable AI Gateway first (separate credit pool, more reliable)
    if (LOVABLE_API_KEY) {
      const lovableModel = model === "fast" ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: lovableModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                ...images.map((url: string) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_paper_form",
                description: "Return the structured form schema extracted from the paper form images.",
                parameters: FORM_SCHEMA,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_paper_form" } },
        }),
      });

      if (aiResp.ok) {
        const json = await aiResp.json();
        const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } catch (e) {
            console.error("Failed to parse Lovable AI tool args:", e);
          }
        }
        console.error("Lovable AI returned no tool call, falling through to Gemini direct.");
      } else {
        const errText = await aiResp.text();
        console.warn("Lovable AI gateway error:", aiResp.status, errText.slice(0, 400));
        // Surface 402 immediately so user knows credits are exhausted
        if (aiResp.status === 402 && !GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({
              error: "AI credits exhausted. Add credits in Settings > Workspace > Usage.",
            }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Otherwise fall through to direct Gemini
      }
    }

    // Fallback: direct Google Gemini API
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "AI credits exhausted. Add credits in Settings > Workspace > Usage.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const imageParts = images
      .map((url: string) => dataUrlToInlineData(url))
      .filter(Boolean) as { inline_data: { mime_type: string; data: string } }[];

    const modelName = model === "fast" ? "gemini-2.5-flash" : "gemini-2.5-pro";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

    const aiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }, ...imageParts] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: FORM_SCHEMA,
          maxOutputTokens: 16384,
        },
      }),
    });


    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Gemini error:", aiResp.status, errText.slice(0, 800));
      let userMsg = "AI extraction failed. Please try again.";
      if (aiResp.status === 429) userMsg = "Rate limit reached. Wait a moment and retry.";
      if (aiResp.status === 400) userMsg = "Image rejected by AI. Try a sharper photo or smaller batch.";
      if (aiResp.status === 403) userMsg = "Gemini API key invalid or quota exhausted.";
      return new Response(JSON.stringify({ error: userMsg }), {
        status: aiResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("No text in Gemini response:", JSON.stringify(json).slice(0, 800));
      return new Response(
        JSON.stringify({
          error: "AI did not return a structured form. The image may be unclear — try a sharper photo.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Strip code fences just in case
      const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        console.error("Failed to parse AI JSON:", e2, text.slice(0, 400));
        return new Response(JSON.stringify({ error: "AI returned malformed schema." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("snap-to-form error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
