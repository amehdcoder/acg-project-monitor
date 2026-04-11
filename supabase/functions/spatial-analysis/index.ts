import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGemini(prompt: string, responseSchema: any) {
  const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_GEMINI_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Gemini API error:", response.status, errorText);
    if (response.status === 429) throw { status: 429, message: "Rate limit exceeded." };
    throw new Error(`Google Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { submissions, analysisType, gpsQuestions, formName } = body || {};

    if (!submissions || !Array.isArray(submissions) || submissions.length === 0) {
      return new Response(JSON.stringify({ error: "No submissions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!analysisType) {
      return new Response(JSON.stringify({ error: "No analysis type specified" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedSubmissions = submissions.slice(0, 200).map((s: any) => ({
      id: s.id, data: s.data, location: s.location, submitted_at: s.submitted_at, user_id: s.user_id,
    }));

    const analysisInstructions: Record<string, string> = {
      hotspot: "Compute Getis-Ord Gi* z-scores. Identify statistically significant hot spots and cold spots.",
      spatial_autocorrelation: "Compute Global Morans I statistic, expected I, variance, z-score, and p-value.",
      dbscan_clustering: "Apply DBSCAN algorithm. Report: number of clusters, noise points, cluster sizes, centroids, silhouette score.",
      kernel_density: "Estimate kernel density at a grid of points. Report: peak density location, contour levels.",
      buffer_analysis: "Create buffers at 1km, 5km, 10km, 25km radii. Count submissions within each buffer zone.",
      suitability_mapping: "Evaluate each location against criteria. Assign weighted suitability scores (0-100).",
      interpolation: "Apply Inverse Distance Weighting (IDW) with p=2. Report: estimated range, cross-validation RMSE, MAE.",
      nearest_neighbor: "Compute Average Nearest Neighbor statistic (R ratio). Report: observed mean distance, expected mean distance, R ratio, z-score, p-value.",
    };

    const prompt = `You are a GIS analyst and spatial statistician. Perform REAL, ACCURATE geospatial analysis. All text must be plain text - no markdown.

CRITICAL RULES:
1. Extract GPS coordinates from the submission data.
2. Perform actual mathematical computations - do NOT fabricate numbers.
3. Report exact test statistics, p-values, and spatial metrics.
4. If insufficient spatial data, say so clearly.

Perform "${analysisType}" spatial analysis on form "${formName || "Unknown"}".

GPS Questions: ${JSON.stringify(gpsQuestions || [])}

Submission data:
${JSON.stringify(trimmedSubmissions, null, 2)}

Instructions: ${analysisInstructions[analysisType] || "Perform the requested spatial analysis with full statistical rigor."}`;

    const responseSchema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        statistics: { type: "array", items: { type: "object" } },
        charts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" }, title: { type: "string" },
              data: { type: "array", items: { type: "object" } },
              xKey: { type: "string" }, bars: { type: "array", items: { type: "string" } },
              xLabel: { type: "string" }, yLabel: { type: "string" },
            },
            required: ["type", "title", "data"],
          },
        },
        interpretation: { type: "string" },
        recommendations: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "statistics", "charts", "interpretation", "recommendations"],
    };

    const parsed = await callGemini(prompt, responseSchema);
    if (parsed.summary) parsed.summary = parsed.summary.replace(/[*#_`]/g, "");
    if (parsed.interpretation) parsed.interpretation = parsed.interpretation.replace(/[*#_`]/g, "");
    if (parsed.recommendations) parsed.recommendations = parsed.recommendations.map((r: string) => r.replace(/[*#_`]/g, ""));

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("spatial-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
