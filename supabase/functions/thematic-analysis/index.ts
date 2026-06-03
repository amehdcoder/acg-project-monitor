import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Doc {
  id: string;
  label: string;
  text: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { documents, focus } = await req.json() as { documents: Doc[]; focus?: string };

    if (!Array.isArray(documents) || documents.length === 0) {
      return new Response(JSON.stringify({ error: "No documents provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "AI not configured", fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build corpus, cap size to stay within token budget.
    const corpus = documents
      .map((d, i) => `### Document ${i + 1} [${d.label}] (id:${d.id})\n${(d.text || "").slice(0, 4000)}`)
      .join("\n\n")
      .slice(0, 24000);

    const system =
      "You are a qualitative research analyst performing rigorous thematic analysis (Braun & Clarke style) on field data collection transcripts. Return only valid JSON.";

    const prompt = `Perform a thematic analysis across the following ${documents.length} transcribed media document(s).${
      focus ? ` Focus the analysis on: ${focus}.` : ""
    }

${corpus}

Return JSON with this exact shape:
{
  "overview": "2-3 sentence executive summary of the dataset",
  "sentiment": { "positive": <0-100>, "neutral": <0-100>, "negative": <0-100> },
  "themes": [
    {
      "name": "short theme name",
      "description": "what this theme captures",
      "prevalence": <number of documents featuring this theme>,
      "sentiment": "positive" | "neutral" | "negative" | "mixed",
      "keywords": ["k1","k2","k3"],
      "quotes": ["representative verbatim quote 1", "quote 2"]
    }
  ],
  "insights": ["actionable insight 1", "insight 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}
Identify 3-7 distinct themes. Quotes must be verbatim from the documents.`;

    const resp = await fetch(LOVABLE_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      const msg = status === 429 ? "Rate limit exceeded" : status === 402 ? "AI credits exhausted" : `AI error ${status}`;
      return new Response(JSON.stringify({ error: msg, status, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await resp.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { overview: content.slice(0, 400), themes: [], insights: [], recommendations: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
