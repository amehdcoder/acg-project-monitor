import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissions, analysisType, questions, groupingQuestion, formName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!submissions?.length || !analysisType || !questions?.length) {
      throw new Error("Missing required parameters");
    }

    const questionLabels = questions.map((q: any) => `"${q.label}" (type: ${q.type}, id: ${q.id})`).join(", ");
    const groupLabel = groupingQuestion ? `"${groupingQuestion.label}" (type: ${groupingQuestion.type})` : "none";

    const systemPrompt = `You are a professional biostatistician and data analyst. Perform REAL, ACCURATE statistical analysis on the provided form submission data. All text output must be plain text only - no markdown, no asterisks, no hashtags, no bold formatting.

CRITICAL RULES:
1. Perform the actual mathematical computations. Do NOT fabricate numbers.
2. Extract the actual values from submission data fields using the question IDs provided.
3. Report exact p-values, test statistics, degrees of freedom, effect sizes.
4. For charts, provide actual computed data points, not example data.
5. If data is insufficient for the requested analysis, say so clearly.
6. Include sample size (n), missing data count, and assumptions checks.`;

    const userPrompt = `Perform a "${analysisType}" analysis on form "${formName}".

Questions to analyze: ${questionLabels}
Grouping variable: ${groupLabel}

Submission data (JSON, extract values using question IDs as keys in the "data" field):
${JSON.stringify(submissions.slice(0, 200), null, 2)}

Instructions by analysis type:
- descriptive: Calculate mean, median, mode, std dev, variance, skewness, kurtosis, min, max, Q1, Q3, IQR for each numeric question.
- frequency: Count occurrences and percentages for each response option.
- cross_tabulation: Build contingency table, compute Chi-square statistic, df, p-value, Cramers V.
- t_test: Compute group means, t-statistic, df, p-value, Cohens d, confidence interval.
- paired_t_test: Compute mean difference, t-statistic, df, p-value, confidence interval.
- anova: Compute group means, F-statistic, df, p-value, eta-squared, post-hoc pairwise comparisons.
- correlation: Compute Pearson r and Spearman rho, p-values, and scatterplot data.
- regression_linear: Compute R-squared, adjusted R-squared, coefficients, std errors, t-values, p-values, F-statistic.
- logistic_regression: Compute odds ratios, coefficients, Wald chi-square, p-values, classification accuracy.
- mann_whitney: Compute U statistic, z-score, p-value, rank-biserial correlation.
- kruskal_wallis: Compute H statistic, df, p-value, epsilon-squared.
- chi_square_goodness: Compute chi-square statistic, df, p-value, observed vs expected frequencies.
- time_series: Compute trend (linear regression on time), detect periodicity, provide forecast.
- survival: Compute survival probabilities at key time points, median survival time, log-rank test if groups exist.
- factor_analysis: Compute eigenvalues, variance explained, factor loadings, KMO, Bartletts test.
- cluster_analysis: Determine optimal k, compute cluster centroids, silhouette scores, cluster sizes.`;

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
              name: "report_analysis",
              description: "Report statistical analysis results with charts",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Plain text summary of the analysis and key findings" },
                  statistics: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                    description: "Array of row objects for the statistics table"
                  },
                  charts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["bar", "pie", "scatter", "line", "area"] },
                        title: { type: "string" },
                        data: { type: "array", items: { type: "object", additionalProperties: true } },
                        xKey: { type: "string" },
                        bars: { type: "array", items: { type: "string" } },
                        lines: { type: "array", items: { type: "string" } },
                        xLabel: { type: "string" },
                        yLabel: { type: "string" },
                      },
                      required: ["type", "title", "data"],
                    },
                  },
                  interpretation: { type: "string", description: "Plain text AI interpretation of what the results mean in context" },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Actionable recommendations based on findings"
                  },
                },
                required: ["summary", "statistics", "charts", "interpretation", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      // Clean markdown from text fields
      if (parsed.summary) parsed.summary = parsed.summary.replace(/[*#_`]/g, "");
      if (parsed.interpretation) parsed.interpretation = parsed.interpretation.replace(/[*#_`]/g, "");
      if (parsed.recommendations) {
        parsed.recommendations = parsed.recommendations.map((r: string) => r.replace(/[*#_`]/g, ""));
      }
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      summary: "Analysis could not be completed. Please try with different parameters.",
      statistics: [],
      charts: [],
      interpretation: "",
      recommendations: [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("statistical-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
