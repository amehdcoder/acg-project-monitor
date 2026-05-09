/**
 * Snap-to-Form AI Enhancer (DSS Internal AI Gateway, vision-first)
 *
 * Two-pass extraction for 100% paper→digital fidelity:
 *  Pass 1 (vision): Send page IMAGES + OCR text + heuristic draft to a strong
 *    multimodal model. The model SEES the actual paper (checkboxes, ruled lines,
 *    multi-column layout, table grids, handwriting cues) instead of guessing
 *    from lossy OCR text. Returns a strict ParsedForm via tool calling.
 *  Pass 2 (audit): Same model is shown the page images + the Pass-1 form and
 *    asked to list every paper field that is MISSING from the form. Missing
 *    fields are appended so nothing is dropped.
 *
 * Default model: google/gemini-2.5-pro (best vision + reasoning).
 */

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const QUESTION_TYPES = [
  "text", "number", "select_one", "select_multiple", "date", "time", "datetime",
  "geopoint", "geotrace", "geoshape", "image", "audio", "video", "file",
  "barcode", "calculate", "note", "range", "rank", "matrix", "signature", "acknowledge",
];

const SYSTEM_PROMPT = `You are a world-class paper-form digitization expert. You are looking at PHOTOS of a paper form. Your job is to reproduce the form EXACTLY as it appears on paper — every section, every question, every option, every line, every checkbox — into a clean structured digital form.

NON-NEGOTIABLE RULES (paper fidelity is everything):
- Reproduce EVERY question that exists on the paper. Do not skip, merge, or summarize fields.
- Preserve the original ORDER of sections and questions exactly as on the paper.
- Preserve original section headings as group labels.
- For checkboxes (☐ ☑ □ ■) — every visible option becomes a select_one or select_multiple option, with both value and label.
  • Two options that read like Yes/No → select_one with options yes/no.
  • Two checkboxes that aren't yes/no → select_one.
  • Three or more checkboxes → select_multiple unless the form clearly says "tick one".
- "If yes, ..." / "If no, go to ..." → set relevant: \${prev_q} = 'yes'.
- "For each child" / "list up to 5" → group.repeat = true.
- Numeric ranges in the label like "(0–120)" → validation.min/max.
- Phone fields → regex "^[+0-9\\s()-]{7,}$"; NIN/BVN → "^[0-9]{11}$".
- Use 'geopoint' for GPS/location/coordinates; 'image' for photo/evidence; 'signature' for sign-off; 'barcode' for scannable IDs/QRs; 'date' for date fields; 'time' for time fields.
- Use ONLY these question types: ${QUESTION_TYPES.join(", ")}.
- snake_case for every question 'name' (lowercase ascii, underscores, ≤60 chars, unique).
- Repair OCR typos using the IMAGE as ground truth, but keep the original meaning.
- Translate non-English labels (Hausa/Yoruba/Igbo/Pidgin/French/Arabic) to clean English; keep original in 'hint'.
- Confidence: 0.95 = clearly read from image; 0.7 = inferred; 0.5 = guessed.
- NEVER invent fields that are not on the paper.
- NEVER drop fields that ARE on the paper.`;

const AUDIT_SYSTEM_PROMPT = `You are auditing a digital form against the original paper photos to find MISSING fields. List ONLY fields that are clearly visible on the paper but absent from the digital form. Do not flag stylistic differences. Use the same strict types and rules as the extractor.`;

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "return_parsed_form",
    description: "Return the cleaned, structured form derived directly from the paper images.",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string", description: "Form title exactly as printed on the paper (≤80 chars)" },
        formDescription: { type: "string" },
        detectedLanguage: { type: "string", description: "ISO 639-1 code, e.g. en, ha, yo, fr, ar" },
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

const AUDIT_TOOL = {
  type: "function",
  function: {
    name: "report_missing_fields",
    description: "Report every paper field that is missing from the digital form.",
    parameters: {
      type: "object",
      properties: {
        missing: {
          type: "array",
          description: "Fields visible on paper but absent from the digital form. Empty array if nothing is missing.",
          items: {
            type: "object",
            properties: {
              groupLabel: { type: "string", description: "Section/group the field belongs to (must match an existing group label, or a new one)" },
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
              sourcePage: { type: "number" },
              confidence: { type: "number" },
            },
            required: ["groupLabel", "name", "label", "type", "required", "confidence"],
          },
        },
      },
      required: ["missing"],
    },
  },
} as const;

async function callGateway(apiKey: string, payload: any) {
  return await fetch("https://api.internal-ai-gateway.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function gatewayError(status: number, errText: string) {
  console.error("AI gateway error:", status, errText);
  if (status === 429) {
    return new Response(
      JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (status === 402) {
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || `field_${Math.random().toString(36).slice(2, 7)}`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DSS_AI_GATEWAY_KEY = Deno.env.get("DSS_AI_GATEWAY_KEY");
    if (!DSS_AI_GATEWAY_KEY) {
      return new Response(
        JSON.stringify({ error: "DSS_AI_GATEWAY_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const draft = body?.draft;
    const ocrPages: { text?: string }[] = Array.isArray(body?.ocrPages) ? body.ocrPages : [];
    const pageImages: string[] = Array.isArray(body?.pageImages) ? body.pageImages : [];
    const extraInstructions: string = (body?.extraInstructions || "").toString().slice(0, 1000);
    // Default to gemini-2.5-pro for best vision fidelity. Falls back to flash if requested.
    const model: string = body?.model || "google/gemini-2.5-pro";
    const skipAudit: boolean = !!body?.skipAudit;

    if (!draft || (ocrPages.length === 0 && pageImages.length === 0)) {
      return new Response(
        JSON.stringify({ error: "Missing draft or ocrPages/pageImages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap OCR text — generous because Pro has a huge context window.
    const MAX_OCR_CHARS_PER_PAGE = 12000;
    const MAX_TOTAL_OCR = 80000;
    let totalChars = 0;
    const ocrSummary = ocrPages
      .map((p, i) => {
        const remaining = MAX_TOTAL_OCR - totalChars;
        if (remaining <= 0) return null;
        const slice = (p.text || "").slice(0, Math.min(MAX_OCR_CHARS_PER_PAGE, remaining));
        totalChars += slice.length;
        return `--- Page ${i + 1} OCR (hint only — trust the IMAGE first) ---\n${slice}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const draftJson = JSON.stringify(draft).slice(0, 16000);

    // Build the multimodal user message: every page image + OCR hint + draft.
    const userContent: any[] = [];
    pageImages.forEach((dataUrl, i) => {
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
        userContent.push({
          type: "image_url",
          image_url: { url: dataUrl },
        });
        userContent.push({ type: "text", text: `↑ Page ${i + 1} of the paper form.` });
      }
    });
    userContent.push({
      type: "text",
      text: [
        "Here is the OCR text extracted from those pages (use as a hint for spelling — the IMAGE is ground truth):",
        ocrSummary || "(no OCR available)",
        "",
        "Here is a heuristic local-parser draft (use as inspiration only — fix anything wrong, fill anything missing):",
        draftJson,
        extraInstructions ? `\nUser context for this form:\n${extraInstructions}` : "",
        "",
        "Now call return_parsed_form with the COMPLETE, FAITHFUL digital form. Every paper question must be present, in order, with correct type and options.",
      ].join("\n"),
    });

    // ----- Pass 1: vision extraction -----
    const extractResp = await callGateway(DSS_AI_GATEWAY_KEY, {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "function", function: { name: "return_parsed_form" } },
    });

    if (!extractResp.ok) {
      const errText = await extractResp.text();
      return gatewayError(extractResp.status, errText);
    }

    const extractData = await extractResp.json();
    const extractCall = extractData?.choices?.[0]?.message?.tool_calls?.[0];
    const extractArgs: string | undefined = extractCall?.function?.arguments;
    if (!extractArgs) {
      console.error("No tool call in extract response:", JSON.stringify(extractData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI returned no structured output" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(extractArgs);
    } catch {
      console.error("Failed to parse tool arguments:", extractArgs.slice(0, 400));
      return new Response(
        JSON.stringify({ error: "AI returned malformed JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ----- Pass 2: audit for missing fields -----
    let auditAddedCount = 0;
    if (!skipAudit && pageImages.length > 0) {
      try {
        const auditUserContent: any[] = [];
        pageImages.forEach((dataUrl, i) => {
          if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
            auditUserContent.push({ type: "image_url", image_url: { url: dataUrl } });
            auditUserContent.push({ type: "text", text: `↑ Page ${i + 1}.` });
          }
        });
        auditUserContent.push({
          type: "text",
          text: [
            "Here is the digital form built so far:",
            JSON.stringify(parsed).slice(0, 16000),
            "",
            "List every field that is clearly on the paper but MISSING from this digital form. If nothing is missing, return an empty array.",
          ].join("\n"),
        });

        const auditResp = await callGateway(DSS_AI_GATEWAY_KEY, {
          model,
          messages: [
            { role: "system", content: AUDIT_SYSTEM_PROMPT },
            { role: "user", content: auditUserContent },
          ],
          tools: [AUDIT_TOOL],
          tool_choice: { type: "function", function: { name: "report_missing_fields" } },
        });

        if (auditResp.ok) {
          const auditData = await auditResp.json();
          const auditArgs = auditData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (auditArgs) {
            const auditParsed = JSON.parse(auditArgs);
            const missing: any[] = Array.isArray(auditParsed?.missing) ? auditParsed.missing : [];
            const existingNames = new Set<string>();
            (parsed.groups || []).forEach((g: any) =>
              (g.questions || []).forEach((q: any) => existingNames.add((q.name || "").toLowerCase())),
            );
            for (const m of missing) {
              const name = slugify(m.name || m.label || "field");
              if (existingNames.has(name)) continue;
              existingNames.add(name);
              // Find or create the group
              const groupLabel = (m.groupLabel || "Additional").toString();
              let target = (parsed.groups || []).find(
                (g: any) => (g.label || "").toLowerCase().trim() === groupLabel.toLowerCase().trim(),
              );
              if (!target) {
                target = { name: slugify(groupLabel), label: groupLabel, questions: [] };
                parsed.groups = parsed.groups || [];
                parsed.groups.push(target);
              }
              target.questions = target.questions || [];
              target.questions.push({
                name,
                label: m.label || name,
                hint: m.hint,
                type: QUESTION_TYPES.includes(m.type) ? m.type : "text",
                required: !!m.required,
                options: Array.isArray(m.options) ? m.options : undefined,
                confidence: typeof m.confidence === "number" ? m.confidence : 0.7,
                sourcePage: m.sourcePage,
                aiUpgrade: "Recovered by completeness audit",
              });
              auditAddedCount++;
            }
          }
        } else {
          // Audit failure is non-fatal — keep the Pass-1 form.
          console.warn("Audit pass failed:", auditResp.status, await auditResp.text().catch(() => ""));
        }
      } catch (e) {
        console.warn("Audit pass exception (non-fatal):", e);
      }
    }

    return new Response(
      JSON.stringify({
        form: parsed,
        model,
        auditAddedCount,
        pagesUsed: pageImages.length,
      }),
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
