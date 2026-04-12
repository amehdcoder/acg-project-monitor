import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userLocation, targets } = await req.json();

    if (!targets || targets.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 targets" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (OPENAI_API_KEY) {
      try {
        const prompt = `You are a logistics route optimizer. Given these collection points, compute the optimal visiting order using the Travelling Salesman Problem nearest-neighbor heuristic with improvements.

${userLocation ? `Start location: [${userLocation[0]}, ${userLocation[1]}]` : "No start location provided."}

Targets:
${targets.map((t: any, i: number) => `${i}: ${t.name} at [${t.center[0]}, ${t.center[1]}]`).join("\n")}

Return ONLY valid JSON with this exact structure:
{"optimizedOrder": [array of target indices in optimal visit order], "estimatedTime": "estimated driving time string", "totalDistance": "estimated total distance string", "stops": [{"order": 1, "name": "target name"}], "tips": "brief route optimization tips"}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are a GIS route optimization expert. Return only valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          const content = aiData.choices?.[0]?.message?.content || "{}";
          const result = JSON.parse(content);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (aiError) {
        console.error("AI route optimization failed, falling back:", aiError);
      }
    }

    // Fallback: nearest-neighbor heuristic
    const haversine = (a: number[], b: number[]) => {
      const R = 6371;
      const dLat = (b[0] - a[0]) * Math.PI / 180;
      const dLon = (b[1] - a[1]) * Math.PI / 180;
      const x = Math.sin(dLat / 2) ** 2 +
        Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const order: number[] = [];
    const visited = new Set<number>();
    let current = userLocation || targets[0].center;
    let totalDist = 0;

    for (let i = 0; i < targets.length; i++) {
      let bestDist = Infinity, bestIdx = 0;
      targets.forEach((t: any, idx: number) => {
        if (visited.has(idx)) return;
        const d = haversine(current, t.center);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      order.push(bestIdx);
      visited.add(bestIdx);
      totalDist += bestDist;
      current = targets[bestIdx].center;
    }

    const result = {
      optimizedOrder: order,
      estimatedTime: `~${Math.round(totalDist / 40 * 60)} min`,
      totalDistance: `${totalDist.toFixed(1)} km`,
      stops: order.map((idx, i) => ({ order: i + 1, name: targets[idx].name })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Route optimizer error:", e);
    return new Response(JSON.stringify({ error: e.message, fallback: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
