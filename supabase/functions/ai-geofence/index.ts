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

    const systemPrompt = `You are an expert GIS analyst with comprehensive knowledge of Nigerian administrative boundaries, health facilities, schools, communities, and geographic features. You have access to all available GIS and remote sensing knowledge.

When given a location description (State, LGA, Area Council for FCT-Abuja, Ward, Health Facility, Community, or any landmark), you must:
1. Identify the exact geographic area being described
2. Generate an accurate geofence polygon (GeoJSON coordinates) that encompasses the described area
3. Use your knowledge of Nigerian administrative boundaries from sources like GADM, OpenStreetMap, GRID3, and other GIS datasets
4. For FCT-Abuja, use Area Councils instead of LGAs
5. Provide the coordinates in [longitude, latitude] format (GeoJSON standard)
6. Make the polygon detailed enough to accurately represent the boundary (minimum 8 vertices for irregularly shaped areas)
7. Include a confidence score and data source attribution

All text must be plain text - no markdown formatting.`;

    const userPrompt = `Generate a geofence polygon for the following location in Nigeria: "${locationDescription}"

Identify the exact boundaries and return an accurate polygon. If this is a State, provide the state boundary. If it's an LGA/Area Council, provide that boundary. If it's a Ward, Health Facility, or Community, provide an appropriate boundary polygon around that location.

For small locations (communities, health facilities), create a reasonable buffer polygon (e.g., 500m-2km radius depending on the type).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_geofence",
              description: "Create a geofence polygon for the described location",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Name of the identified location" },
                  locationType: { type: "string", enum: ["state", "lga", "area_council", "ward", "health_facility", "community", "landmark", "custom"] },
                  center: {
                    type: "object",
                    properties: {
                      latitude: { type: "number" },
                      longitude: { type: "number" },
                    },
                    required: ["latitude", "longitude"],
                  },
                  polygon: {
                    type: "array",
                    items: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2,
                    },
                    description: "Array of [longitude, latitude] coordinate pairs forming the polygon boundary. The polygon must be closed (first and last points identical).",
                  },
                  radiusMeters: { type: "number", description: "Approximate radius in meters for reference" },
                  confidence: { type: "number", description: "Confidence score 0-100 in the accuracy of the boundary" },
                  dataSources: { type: "string", description: "Sources used for boundary data" },
                  notes: { type: "string", description: "Additional notes about the geofence" },
                },
                required: ["name", "locationType", "center", "polygon", "confidence", "dataSources", "notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_geofence" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed.notes) parsed.notes = parsed.notes.replace(/[*#_`]/g, "");
      if (parsed.dataSources) parsed.dataSources = parsed.dataSources.replace(/[*#_`]/g, "");
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Failed to generate geofence");
  } catch (e) {
    console.error("ai-geofence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
