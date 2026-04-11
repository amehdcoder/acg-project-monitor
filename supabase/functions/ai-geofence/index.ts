import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { locationDescription } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

    if (!locationDescription?.trim()) throw new Error("Location description is required");

    const prompt = `You are an expert GIS analyst with comprehensive knowledge of Nigerian administrative boundaries, health facilities, schools, communities, and geographic features.

When given a location description (State, LGA, Area Council for FCT-Abuja, Ward, Health Facility, Community, or any landmark), you must:
1. Identify the exact geographic area being described
2. Generate an accurate geofence polygon (GeoJSON coordinates)
3. Use your knowledge of Nigerian administrative boundaries
4. For FCT-Abuja, use Area Councils instead of LGAs
5. Provide the coordinates in [longitude, latitude] format (GeoJSON standard)
6. Make the polygon detailed enough (minimum 8 vertices for irregularly shaped areas)
7. Include a confidence score and data source attribution

Generate a geofence polygon for: "${locationDescription}"

For small locations (communities, health facilities), create a reasonable buffer polygon (500m-2km radius).`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
                locationType: { type: "string" },
                center: {
                  type: "object",
                  properties: { latitude: { type: "number" }, longitude: { type: "number" } },
                  required: ["latitude", "longitude"],
                },
                polygon: {
                  type: "array",
                  items: { type: "array", items: { type: "number" } },
                },
                radiusMeters: { type: "number" },
                confidence: { type: "number" },
                dataSources: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "locationType", "center", "polygon", "confidence", "dataSources", "notes"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errorText = await response.text();
      console.error("Google Gemini API error:", response.status, errorText);
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(content);

    if (parsed.notes) parsed.notes = parsed.notes.replace(/[*#_`]/g, "");
    if (parsed.dataSources) parsed.dataSources = parsed.dataSources.replace(/[*#_`]/g, "");

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-geofence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
