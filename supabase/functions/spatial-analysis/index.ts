import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { submissions, analysisType, gpsQuestions, formName } = body || {};
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // Reduce payload - only send location-relevant data, limit to 200
    const trimmedSubmissions = submissions.slice(0, 200).map((s: any) => ({
      id: s.id,
      data: s.data,
      location: s.location,
      submitted_at: s.submitted_at,
      user_id: s.user_id,
    }));

    const systemPrompt = `You are a GIS analyst and spatial statistician. Perform REAL, ACCURATE geospatial analysis on the provided point data extracted from form submissions. All text must be plain text - no markdown formatting.

CRITICAL RULES:
1. Extract GPS coordinates from the submission data. GPS data is stored either in the "location" field (as {latitude, longitude} or {lat, lng}) or within the "data" field using GPS question IDs.
2. Perform actual mathematical computations - do NOT fabricate numbers.
3. Report exact test statistics, p-values, and spatial metrics.
4. For charts, provide actual computed data points.
5. If insufficient spatial data, say so clearly.
6. All coordinates should be in WGS84 (EPSG:4326).
7. Consider the Nigerian geographic context when interpreting results.`;

    const analysisInstructions: Record<string, string> = {
      hotspot: "Compute Getis-Ord Gi* z-scores for each point. Identify statistically significant hot spots and cold spots. Report the number at 90%, 95%, 99% confidence levels. Provide a chart showing the distribution of z-scores.",
      spatial_autocorrelation: "Compute Global Morans I statistic, expected I, variance, z-score, and p-value. Interpret whether the pattern is clustered, dispersed, or random. Also compute Local Morans I (LISA) for each point.",
      dbscan_clustering: "Apply DBSCAN algorithm. Report: number of clusters, noise points, cluster sizes, centroids, silhouette score. Provide scatter plot colored by cluster.",
      kernel_density: "Estimate kernel density at a grid of points. Report: peak density location, contour levels, total area covered. Provide density values for visualization.",
      buffer_analysis: "Create buffers at 1km, 5km, 10km, 25km radii. Count submissions within each buffer zone. Identify coverage gaps. Report accessibility metrics.",
      suitability_mapping: "Evaluate each location against criteria: submission density, temporal coverage, geographic coverage. Assign weighted suitability scores (0-100). Rank locations.",
      interpolation: "Apply Inverse Distance Weighting (IDW) with p=2. Estimate values at a regular grid. Report: estimated range, cross-validation RMSE, MAE. Provide interpolated surface data.",
      nearest_neighbor: "Compute Average Nearest Neighbor statistic (R ratio). Report: observed mean distance, expected mean distance, R ratio, z-score, p-value. Interpret: R < 1 = clustered, R = 1 = random, R > 1 = dispersed.",
    };

    const userPrompt = `Perform "${analysisType}" spatial analysis on form "${formName || "Unknown"}".

GPS Questions: ${JSON.stringify(gpsQuestions || [])}

Submission data (extract coordinates from "location" field or GPS question IDs in "data"):
${JSON.stringify(trimmedSubmissions, null, 2)}

Analysis Instructions:
${analysisInstructions[analysisType] || "Perform the requested spatial analysis with full statistical rigor."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_spatial_analysis",
              description: "Report geospatial analysis results",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  statistics: { type: "array", items: { type: "object", additionalProperties: true } },
                  charts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["bar", "scatter", "pie"] },
                        title: { type: "string" },
                        data: { type: "array", items: { type: "object", additionalProperties: true } },
                        xKey: { type: "string" },
                        bars: { type: "array", items: { type: "string" } },
                        xLabel: { type: "string" },
                        yLabel: { type: "string" },
                      },
                      required: ["type", "title", "data"],
                    },
                  },
                  interpretation: { type: "string" },
                  recommendations: { type: "array", items: { type: "string" } },
                },
                required: ["summary", "statistics", "charts", "interpretation", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_spatial_analysis" } },
      }),
    });

    if (!response.ok) {
      const statusCode = response.status;
      const errorText = await response.text();
      console.error("AI gateway error:", statusCode, errorText);

      if (statusCode === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (statusCode === 402) {
        return new Response(JSON.stringify({ error: "AI usage credits exhausted. Please add credits in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${statusCode}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed.summary) parsed.summary = parsed.summary.replace(/[*#_`]/g, "");
      if (parsed.interpretation) parsed.interpretation = parsed.interpretation.replace(/[*#_`]/g, "");
      if (parsed.recommendations) parsed.recommendations = parsed.recommendations.map((r: string) => r.replace(/[*#_`]/g, ""));
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ summary: "Analysis could not be completed.", statistics: [], charts: [], interpretation: "", recommendations: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spatial-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
