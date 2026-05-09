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

    const DSS_AI_GATEWAY_KEY = Deno.env.get("DSS_AI_GATEWAY_KEY");
    if (!DSS_AI_GATEWAY_KEY) {
      return new Response(JSON.stringify({ error: "DSS_AI_GATEWAY_KEY not configured" }), {
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

    const response = await fetch("https://api.internal-ai-gateway.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DSS_AI_GATEWAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      return new Response(JSON.stringify({ error: "Image generation failed", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // The image generation model returns base64 image data
    if (content) {
      // Check if content contains image data
      const imageUrl = content.startsWith("data:") ? content : `data:image/png;base64,${content}`;
      return new Response(JSON.stringify({ imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "No image generated", fallback: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
