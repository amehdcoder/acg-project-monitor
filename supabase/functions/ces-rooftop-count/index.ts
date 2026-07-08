// Estimate household count from a satellite crop.
// Two modes:
//  1) polygon mode — analyze the exact drawn perimeter crop (ArcGIS export of the
//     polygon bounding box) and count every distinct building rooftop STRICTLY
//     inside the perimeter, ignoring roads, cars, shadows and trees.
//  2) point mode (legacy) — count rooftops on a single Esri tile around lat/lng.
// Uses DSS Internal AI Gateway (Gemini 2.5 Flash) vision on Esri World Imagery
// (no API key required).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// Convert lat/lng + zoom to Esri tile URL (single tile fallback).
function lon2tile(lon: number, z: number) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
function lat2tile(lat: number, z: number) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

async function fetchTileAsBase64(lat: number, lng: number, zoom: number): Promise<string> {
  const x = lon2tile(lng, zoom);
  const y = lat2tile(lat, zoom);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
  return await fetchAsBase64(url);
}

// Fetch a single satellite image covering the polygon bounding box (with padding).
async function fetchPolygonCrop(
  polygon: { lat: number; lng: number }[],
): Promise<{ image: string; normPolygon: { x: number; y: number }[] }> {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of polygon) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  // Pad the bbox ~4% so no edge rooftops are clipped.
  const padLat = (maxLat - minLat) * 0.04 || 0.0005;
  const padLng = (maxLng - minLng) * 0.04 || 0.0005;
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;

  // Size the export to match aspect ratio, capped at 1280px.
  const midLat = (minLat + maxLat) / 2;
  const widthM = (maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const heightM = (maxLat - minLat) * 111_320;
  const maxPx = 1280;
  let w = maxPx, h = maxPx;
  if (widthM >= heightM) { h = Math.max(256, Math.round((heightM / widthM) * maxPx)); }
  else { w = Math.max(256, Math.round((widthM / heightM) * maxPx)); }

  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  const url =
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=jpg&f=image`;
  const image = await fetchAsBase64(url);

  // Normalize polygon vertices to 0..1 image coords (y is flipped: top = maxLat).
  const normPolygon = polygon.map((p) => ({
    x: +((p.lng - minLng) / (maxLng - minLng)).toFixed(4),
    y: +((maxLat - p.lat) / (maxLat - minLat)).toFixed(4),
  }));
  return { image, normPolygon };
}

async function callVision(systemPrompt: string, userContent: any[]): Promise<any> {
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (aiRes.status === 429) return { __status: 429 };
  if (aiRes.status === 402) return { __status: 402 };
  if (!aiRes.ok) throw new Error(`AI gateway: ${aiRes.status} ${await aiRes.text()}`);
  const aiJson = await aiRes.json();
  const content: string = aiJson?.choices?.[0]?.message?.content ?? "{}";
  const m = content.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { rooftop_count: 0, confidence: "low" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
  if (guard.response) return guard.response;

  try {
    const body = await req.json();
    const { lat, lng, zoom = 18, polygon } = body ?? {};

    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

    let parsed: any;

    if (Array.isArray(polygon) && polygon.length >= 3) {
      // ---- Polygon (drawn perimeter) mode ----
      const { image, normPolygon } = await fetchPolygonCrop(polygon);
      const systemPrompt =
        "You are a remote-sensing analyst counting building rooftops in a satellite image. " +
        "You are given a polygon perimeter as normalized image coordinates (x,y each in 0..1, " +
        "origin top-left). Count ONLY distinct building rooftops whose centre lies STRICTLY INSIDE " +
        "that polygon. Each distinct rooftop = one household. IGNORE roads, footpaths, vehicles/cars, " +
        "shadows, trees, vegetation, bare ground, water and open compounds with no roof. Treat a single " +
        "connected compound sharing one courtyard as one household; separate detached roofs count " +
        "separately. Return STRICT JSON only, no prose: " +
        '{"rooftop_count": number, "rooftop_low": number, "rooftop_high": number, ' +
        '"confidence": "low"|"medium"|"high", "notes": string}. rooftop_low/high are the 95% ' +
        "confidence bounds around the count accounting for occlusion and resolution.";
      const userContent = [
        {
          type: "text",
          text:
            `Perimeter polygon (normalized image coords, in order): ${JSON.stringify(normPolygon)}. ` +
            "Count every distinct building rooftop inside this perimeter.",
        },
        { type: "image_url", image_url: { url: image } },
      ];
      parsed = await callVision(systemPrompt, userContent);
    } else {
      // ---- Legacy point mode ----
      if (typeof lat !== "number" || typeof lng !== "number") {
        return new Response(JSON.stringify({ error: "lat/lng or polygon required" }), {
          status: 400, headers: jsonHeaders,
        });
      }
      const image = await fetchTileAsBase64(lat, lng, zoom);
      const systemPrompt =
        "You are a remote-sensing analyst. Count distinct building rooftops visible in the satellite " +
        "tile and return STRICT JSON: {\"rooftop_count\": number, \"rooftop_low\": number, " +
        "\"rooftop_high\": number, \"confidence\": \"low\"|\"medium\"|\"high\", \"notes\": string}. " +
        "IGNORE roads, cars, shadows and trees. Treat connected compounds sharing a courtyard as one " +
        "household. rooftop_low/high are 95% CI bounds. No prose.";
      const userContent = [
        { type: "text", text: `Center: ${lat.toFixed(5)}, ${lng.toFixed(5)} | zoom ${zoom}. Count rooftops as households.` },
        { type: "image_url", image_url: { url: image } },
      ];
      parsed = await callVision(systemPrompt, userContent);
    }

    if (parsed.__status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: jsonHeaders });
    }
    if (parsed.__status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: jsonHeaders });
    }

    const count = Number(parsed.rooftop_count) || 0;
    const confidence = parsed.confidence ?? "low";
    let ciLow = Number(parsed.rooftop_low);
    let ciHigh = Number(parsed.rooftop_high);
    if (!Number.isFinite(ciLow) || !Number.isFinite(ciHigh) || ciLow > ciHigh) {
      const pct = confidence === "high" ? 0.10 : confidence === "medium" ? 0.20 : 0.35;
      ciLow = Math.max(0, Math.round(count * (1 - pct)));
      ciHigh = Math.round(count * (1 + pct));
    }

    return new Response(
      JSON.stringify({
        estimated_households: count,
        ci_low: ciLow,
        ci_high: ciHigh,
        ci_level: 0.95,
        confidence,
        notes: parsed.notes ?? "",
      }),
      { headers: jsonHeaders },
    );
  } catch (e) {
    console.error("ces-rooftop-count error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
