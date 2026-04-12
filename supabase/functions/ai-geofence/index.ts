import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { locationDescription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

For small locations (communities, health facilities), create a reasonable buffer polygon (500m-2km radius).

Return ONLY valid JSON with this structure:
{"name": "string", "locationType": "string", "center": {"latitude": number, "longitude": number}, "polygon": [[lon, lat], ...], "radiusMeters": number, "confidence": number, "dataSources": "string", "notes": "string"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert GIS analyst. Return only valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", fallback: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    if (parsed.notes) parsed.notes = parsed.notes.replace(/[*#_`]/g, "");
    if (parsed.dataSources) parsed.dataSources = parsed.dataSources.replace(/[*#_`]/g, "");

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-geofence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", fallback: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
