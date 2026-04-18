// Snap to Form - Convert paper forms (images/PDFs) into structured digital forms
// Uses Lovable AI Gateway with Gemini vision + tool calling for structured output.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FORM_SCHEMA = {
  type: "object",
  properties: {
    formName: {
      type: "string",
      description:
        "A short, descriptive title for the entire form, inferred from the paper form's heading or purpose.",
    },
    formDescription: {
      type: "string",
      description:
        "A 1-2 sentence description of what this form collects. Inferred from instructions/subheadings on the paper.",
    },
    detectedLanguage: {
      type: "string",
      description: "ISO code or name of the dominant language detected (e.g. 'en', 'fr', 'ha').",
    },
    overallConfidence: {
      type: "number",
      description: "0-1 overall confidence in the extraction quality.",
    },
    groups: {
      type: "array",
      description:
        "Sections/groupings detected on the paper form. Use a single group named 'Main' if no sections are visible.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "snake_case identifier, e.g. 'patient_details'" },
          label: { type: "string", description: "Human label for the section, e.g. 'Patient Details'" },
          repeat: {
            type: "boolean",
            description:
              "True if the section visibly repeats per item (e.g. 'For each child:' or numbered rows of identical fields).",
          },
          relevant: {
            type: "string",
            description:
              "Optional XLSForm relevance expression like \"${has_symptoms} = 'yes'\" if the section is conditional. Empty string if none.",
          },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "snake_case unique identifier, e.g. 'first_name'",
                },
                label: { type: "string", description: "The question text exactly as it appears, cleaned." },
                hint: {
                  type: "string",
                  description: "Helper text under the field if any (instructions, units, format).",
                },
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
                  description:
                    "Map paper field types intelligently: 'Date: ___' -> date; 'Phone: ___' -> text with phone regex; single checkboxes -> select_one yes/no; multiple checkboxes -> select_multiple; 'Sign here' -> signature; 'Attach photo' -> image; GPS/coordinates -> geopoint; rating 1-5 -> range.",
                },
                required: {
                  type: "boolean",
                  description:
                    "True if marked with *, '(required)', or contextually mandatory (name, ID, date).",
                },
                options: {
                  type: "array",
                  description: "For select_one/select_multiple, the visible choices.",
                  items: {
                    type: "object",
                    properties: {
                      value: { type: "string", description: "snake_case value" },
                      label: { type: "string", description: "Display label" },
                    },
                    required: ["value", "label"],
                  },
                },
                validation: {
                  type: "object",
                  description:
                    "Inferred validation: numeric ranges (age 0-120), regex (phone, email), max length.",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" },
                    regex: { type: "string" },
                    message: { type: "string" },
                  },
                },
                relevant: {
                  type: "string",
                  description:
                    "Skip-logic expression if the field says 'If yes, ...' or 'Only if ...'. e.g. \"${pregnant} = 'yes'\". Empty string if none.",
                },
                aiUpgrade: {
                  type: "string",
                  description:
                    "If you intuitively upgraded the paper field (e.g. plain text -> date picker, added GPS, added photo evidence), describe the upgrade in 1 short sentence. Empty string if no upgrade.",
                },
                confidence: {
                  type: "number",
                  description: "0-1 confidence in this specific question's extraction.",
                },
                sourcePage: {
                  type: "number",
                  description: "1-based page index this field was found on.",
                },
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
      description:
        "Top-level intuitive enhancements that aren't on paper but would make the digital form better (e.g. 'Add GPS auto-capture for site visits', 'Add photo evidence for damaged items').",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
          appliedAsQuestionName: {
            type: "string",
            description:
              "If the upgrade was already added as a question, its name field. Empty string if it's only a suggestion.",
          },
        },
        required: ["title", "rationale"],
      },
    },
    warnings: {
      type: "array",
      description:
        "Anything that was unclear, illegible, or required guessing. Reviewer should double-check these.",
      items: { type: "string" },
    },
  },
  required: ["formName", "groups", "overallConfidence"],
};

const SYSTEM_PROMPT = `You are an expert forms architect and OCR specialist. You convert photographs and scans of paper forms, checklists, intake sheets, and registration forms into clean, structured digital form schemas.

Your job:
1. Read EVERY visible question, label, checkbox, blank, and instruction across all provided pages.
2. Infer the correct digital field type intuitively. Map paper conventions to modern UX:
   - "Date: __/__/____" -> type: date
   - "Phone: ___" -> type: text with regex validation
   - "Email: ___" -> type: text with email regex
   - "Sex:  [ ] M  [ ] F" -> type: select_one with those options
   - Multiple checkboxes (pick many) -> type: select_multiple
   - "Sign here" / signature line -> type: signature
   - "Attach photo" / "Photo evidence" -> type: image
   - "GPS coordinates" / "Location" / "Site coordinates" -> type: geopoint
   - "Rate 1-5" -> type: range with min/max
   - Long blank box -> type: text (multiline)
   - "Yes / No" -> type: select_one with yes/no options
3. Detect and group fields into logical sections (e.g. "Personal Info", "Medical History"). Use a single group named "Main" if no sections are visible.
4. Detect REPEAT GROUPS: phrases like "For each child:", "List up to 5 medications:", or numbered identical rows -> mark group.repeat = true.
5. Detect SKIP LOGIC: "If yes, go to Q5", "Only complete if pregnant", "Skip section B if N/A" -> express as XLSForm relevant expressions like "\${has_symptoms} = 'yes'".
6. Detect VALIDATION: "Age (0-120)", "Must be 18+", "Phone (10 digits)" -> populate validation.min/max/regex.
7. Mark required fields based on *, "(required)", "mandatory", or context (name, primary ID, date are typically required).
8. APPLY INTUITIVE UPGRADES that improve the digital form beyond paper:
   - If the form references a location/site/visit and has no location field, ADD a geopoint question.
   - If the form references evidence/condition/damage/proof and has no photo field, ADD an image question.
   - If the form requires sign-off/approval and has no signature line, ADD a signature question.
   - For each upgrade, fill aiUpgrade with a short note so the user sees what you added.
9. Assign confidence scores honestly. Lower confidence (< 0.6) for handwritten, faded, or ambiguous fields.
10. Generate snake_case 'name' for every question (use it as a stable identifier and for skip-logic refs).
11. Never invent fields that don't exist on the paper UNLESS marked as an aiUpgrade.
12. List warnings for illegible regions, cut-off edges, or guesses you had to make.

Return your output strictly through the extract_paper_form tool. Do not write prose.`;

interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

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
        JSON.stringify({ error: "Maximum 20 pages per scan. Split your form into smaller batches." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageParts: ImagePart[] = images.map((url: string) => ({
      type: "image_url",
      image_url: { url },
    }));

    const userContent: any[] = [
      {
        type: "text",
        text:
          `Extract the complete form schema from these ${images.length} page(s) of a paper form. ` +
          `Apply intuitive upgrades (smart field types, skip logic, validation rules, GPS/photo/signature additions, section grouping, repeat groups). ` +
          (extraInstructions ? `Extra context: ${extraInstructions}` : ""),
      },
      ...imageParts,
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
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

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({
          error: "AI credits exhausted. Add credits in Settings > Workspace > Usage.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(json).slice(0, 800));
      return new Response(
        JSON.stringify({
          error: "AI did not return a structured form. The image may be unclear — try a sharper photo.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments:", e);
      return new Response(JSON.stringify({ error: "AI returned malformed schema." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
