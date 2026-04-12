import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGemini(prompt: string, responseSchema: any, model = "gemini-2.0-flash") {
  const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!GOOGLE_GEMINI_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Gemini API error:", response.status, errorText);
    return { error: "RATE_LIMIT_EXCEEDED", fallback: true };
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

    const { submissions, analysisType, questions, groupingQuestion, formName } = body || {};

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
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "No questions selected for analysis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedSubmissions = submissions.slice(0, 150).map((s: any) => ({
      id: s.id, data: s.data, submitted_at: s.submitted_at, user_id: s.user_id,
    }));

    const questionLabels = questions.map((q: any) => `"${q.label}" (type: ${q.type}, id: ${q.id})`).join(", ");
    const groupLabel = groupingQuestion ? `"${groupingQuestion.label}" (type: ${groupingQuestion.type})` : "none";

    const analysisInstructions: Record<string, string> = {
      descriptive: "Calculate mean, median, mode, std dev, variance, skewness, kurtosis, min, max, Q1, Q3, IQR for each numeric question.",
      frequency: "Count occurrences and percentages for each response option.",
      cross_tabulation: "Build contingency table, compute Chi-square statistic, df, p-value, Cramers V.",
      t_test: "Compute group means, t-statistic, df, p-value, Cohens d, confidence interval.",
      paired_t_test: "Compute mean difference, t-statistic, df, p-value, confidence interval.",
      anova: "Compute group means, F-statistic, df, p-value, eta-squared, post-hoc pairwise comparisons.",
      correlation: "Compute Pearson r and Spearman rho, p-values, and scatterplot data.",
      regression_linear: "Compute R-squared, adjusted R-squared, coefficients, std errors, t-values, p-values, F-statistic.",
      logistic_regression: "Compute odds ratios, coefficients, Wald chi-square, p-values, classification accuracy.",
      mann_whitney: "Compute U statistic, z-score, p-value, rank-biserial correlation.",
      kruskal_wallis: "Compute H statistic, df, p-value, epsilon-squared.",
      chi_square_goodness: "Compute chi-square statistic, df, p-value, observed vs expected frequencies.",
      time_series: "Compute trend (linear regression on time), detect periodicity, provide forecast.",
      survival: "Compute survival probabilities at key time points, median survival time, log-rank test if groups exist.",
      factor_analysis: "Compute eigenvalues, variance explained, factor loadings, KMO, Bartletts test.",
      cluster_analysis: "Determine optimal k, compute cluster centroids, silhouette scores, cluster sizes.",
    };

    const prompt = `You are a professional biostatistician. Perform REAL, ACCURATE statistical analysis on the provided form submission data. All text output must be plain text only - no markdown.

CRITICAL RULES:
1. Perform the actual mathematical computations. Do NOT fabricate numbers.
2. Extract the actual values from submission data fields using the question IDs provided.
3. Report exact p-values, test statistics, degrees of freedom, effect sizes.
4. For charts, provide actual computed data points, not example data.
5. If data is insufficient, say so clearly.
6. Include sample size (n), missing data count, and assumptions checks.

Perform a "${analysisType}" analysis on form "${formName || "Unknown"}".

Questions to analyze: ${questionLabels}
Grouping variable: ${groupLabel}

Submission data (JSON, extract values using question IDs as keys in the "data" field):
${JSON.stringify(trimmedSubmissions, null, 2)}

Instructions: ${analysisInstructions[analysisType] || "Perform the requested statistical analysis with full rigor."}`;

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
              type: { type: "string" },
              title: { type: "string" },
              data: { type: "array", items: { type: "object" } },
              xKey: { type: "string" },
              bars: { type: "array", items: { type: "string" } },
              lines: { type: "array", items: { type: "string" } },
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
    };

    const parsed = await callGemini(prompt, responseSchema);
    if (parsed.summary) parsed.summary = parsed.summary.replace(/[*#_`]/g, "");
    if (parsed.interpretation) parsed.interpretation = parsed.interpretation.replace(/[*#_`]/g, "");
    if (parsed.recommendations) parsed.recommendations = parsed.recommendations.map((r: string) => r.replace(/[*#_`]/g, ""));

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("statistical-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
