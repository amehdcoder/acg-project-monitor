import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callOpenAI(systemPrompt: string, userPrompt: string) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    return { error: "RATE_LIMIT_EXCEEDED", fallback: true };
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "{}";
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

    const prompt = `Perform REAL, ACCURATE geospatial analysis. All text must be plain text - no markdown.

CRITICAL RULES:
1. Extract GPS coordinates from the submission data.
2. Perform actual mathematical computations - do NOT fabricate numbers.
3. Report exact test statistics, p-values, and spatial metrics.
4. If insufficient spatial data, say so clearly.

Perform "${analysisType}" spatial analysis on form "${formName || "Unknown"}".

GPS Questions: ${JSON.stringify(gpsQuestions || [])}

Submission data:
${JSON.stringify(trimmedSubmissions, null, 2)}

Instructions: ${analysisInstructions[analysisType] || "Perform the requested spatial analysis with full statistical rigor."}

Return JSON with: summary, statistics (array of objects), charts (array with type/title/data/xKey/bars/xLabel/yLabel), interpretation, recommendations (array of strings)`;

    const parsed = await callOpenAI("You are a GIS analyst and spatial statistician. Return only valid JSON.", prompt);
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
