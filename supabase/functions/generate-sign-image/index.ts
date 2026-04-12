import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phrase, signLanguage, signDescription, category } = await req.json();

    if (!phrase || !signLanguage) {
      return new Response(JSON.stringify({ error: "phrase and signLanguage required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryContext = category === "greetings"
      ? "greeting or introduction"
      : category === "consent"
      ? "informed consent and permission"
      : "health survey or data collection question";

    const prompt = `Create a clear, professional sign language instruction illustration showing how to sign: "${phrase}"

Sign description: ${signDescription}
Sign language: ${signLanguage}
Context: ${categoryContext}

Requirements:
- Show a person (diverse, professional appearance) demonstrating the hand sign clearly
- Clean white/light background with soft gradient
- The person should be shown from waist up, facing the viewer
- Hands and fingers must be clearly visible and anatomically correct
- Use warm, inclusive, professional style similar to medical/health communication materials
- Add subtle visual arrows or motion lines showing hand movement direction
- Style: modern vector-like illustration, clean lines, accessible design
- NO text or labels in the image
- The sign should be the universal/standard recognized gesture for this concept`;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(JSON.stringify({ error: "Image generation failed", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const b64 = data.data?.[0]?.b64_json;

    if (!b64) {
      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = `data:image/png;base64,${b64}`;

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
