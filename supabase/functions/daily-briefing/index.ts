import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { summaryData } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

    const prompt = `You are a field operations supervisor AI assistant for a data collection platform used in public health and development projects in Nigeria. Generate a concise, actionable daily briefing based on the following data.

IMPORTANT FORMATTING RULES:
- Do NOT use markdown syntax. No asterisks (*), no hashtags (#), no bold (**), no headers (##).
- Use plain text only.
- Use emoji at the start of section titles for visual separation.
- Use simple dashes (-) for bullet points.
- Use ALL CAPS for section titles.
- Keep it under 300 words.

Focus on:
1. Key highlights and wins
2. Areas requiring immediate attention  
3. Specific action recommendations

Data:
${JSON.stringify(summaryData, null, 2)}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: "You are a helpful field operations supervisor assistant. Write clear, actionable briefings.\n\n" + prompt }] },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Gemini API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const briefing = data.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate briefing.";

    return new Response(JSON.stringify({ briefing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
