// Estimate household count from a satellite tile around a coordinate.
// Uses DSS Internal AI Gateway (Gemini 2.5 Flash) vision to count rooftops on
// Esri World Imagery (no API key required).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DSS_AI_GATEWAY_KEY = Deno.env.get("DSS_AI_GATEWAY_KEY")!;

// Convert lat/lng + zoom to Esri tile URL (we'll fetch a 640x640 mosaic of tiles).
function lon2tile(lon: number, z: number) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
function lat2tile(lat: number, z: number) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

async function fetchTileAsBase64(lat: number, lng: number, zoom: number): Promise<string> {
  const x = lon2tile(lng, zoom);
  const y = lat2tile(lat, zoom);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lat, lng, zoom = 18 } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat/lng required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageDataUrl = await fetchTileAsBase64(lat, lng, zoom);

    const aiRes = await fetch("https://api.internal-ai-gateway.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DSS_AI_GATEWAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a remote-sensing analyst. Count distinct building rooftops visible in the satellite tile and return STRICT JSON: {\"rooftop_count\": number, \"rooftop_low\": number, \"rooftop_high\": number, \"confidence\": \"low\"|\"medium\"|\"high\", \"notes\": string}. rooftop_low and rooftop_high are the lower and upper bounds of a 95% confidence interval around your count, accounting for occlusion (trees, shadows), tile resolution and ambiguous/connected compounds. Treat connected compounds as one household when they share a courtyard, otherwise count separately. No prose.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Center: ${lat.toFixed(5)}, ${lng.toFixed(5)} | zoom ${zoom}. Count rooftops as households.` },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway: ${aiRes.status} ${t}`);
    }
    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "{}";
    const m = content.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : { rooftop_count: 0, confidence: "low" };

    return new Response(
      JSON.stringify({
        estimated_households: Number(parsed.rooftop_count) || 0,
        confidence: parsed.confidence ?? "low",
        notes: parsed.notes ?? "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ces-rooftop-count error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
