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
    const { action, data, config } = await req.json();

    let prompt = "";

    if (action === "train_predict") {
      const healthConfig = config.regularization
        ? `\n- Regularization: ENABLED (strength: ${config.regularizationStrength || 0.5})`
        : `\n- Regularization: DISABLED`;
      const classBalanceConfig = config.classBalancing
        ? `\n- Class Balancing: ENABLED`
        : `\n- Class Balancing: DISABLED`;
      const earlyStopConfig = config.earlyStopping
        ? `\n- Early Stopping: ENABLED`
        : `\n- Early Stopping: DISABLED`;

      prompt = `You are an expert machine learning scientist specializing in public health interventions, NTD programs, and survey data analysis.

YOUR TASKS:
1. Analyze the data thoroughly, checking for class imbalance, missing values, and feature quality
2. Apply the specified ML algorithm with the given model health controls
3. Evaluate overfitting vs underfitting by comparing train vs test performance
4. Return PRECISE numerical results

CRITICAL RULES:
- All metrics (accuracy, precision, recall, f1_score) must be between 0 and 1
- Feature importances must sum to approximately 1.0
- train_accuracy should be realistic relative to test_accuracy
- Provide cross-validation scores consistent with the number of folds specified

COVERAGE ANALYSIS: For each geographic area, calculate the most prevalent predicted outcome and its coverage percentage.

MODEL HEALTH ASSESSMENT:
- overfitting_risk: "low" if train-test gap < 5%, "medium" if 5-15%, "high" if > 15%
- underfitting_risk: "low" if test accuracy > 0.7, "medium" if 0.5-0.7, "high" if < 0.5

Dataset Summary:
- Total records: ${data.totalRecords}
- Features used: ${JSON.stringify(data.features)}
- Target variable: ${data.target}
- ML Method: ${config.method}
- Split ratio: Train ${config.trainRatio}% / Test ${config.testRatio}% / Validation ${config.valRatio}%
- Prediction level: ${config.predictionLevel}
- Cross-validation folds: ${config.crossValidationFolds || 5}
${healthConfig}${classBalanceConfig}${earlyStopConfig}

Sample data (first 50 rows):
${JSON.stringify(data.sampleData?.slice(0, 50))}

Unique target values: ${JSON.stringify(data.uniqueTargets)}
Feature statistics: ${JSON.stringify(data.featureStats)}`;
    } else if (action === "analyze") {
      prompt = `You are an expert data scientist. Analyze these ML results and provide insights:\n${JSON.stringify(data)}`;
    }

    const responseSchema = {
      type: "object",
      properties: {
        metrics: {
          type: "object",
          properties: {
            accuracy: { type: "number" }, precision: { type: "number" },
            recall: { type: "number" }, f1_score: { type: "number" },
            r2_score: { type: "number" }, rmse: { type: "number" },
            mae: { type: "number" }, cross_val_mean: { type: "number" },
            cross_val_std: { type: "number" }, train_accuracy: { type: "number" },
            test_accuracy: { type: "number" }, val_accuracy: { type: "number" },
          },
        },
        feature_importances: {
          type: "array",
          items: { type: "object", properties: { feature: { type: "string" }, importance: { type: "number" } }, required: ["feature", "importance"] },
        },
        predictions: {
          type: "array",
          items: { type: "object", properties: { area: { type: "string" }, predicted_value: { type: "string" }, confidence: { type: "number" }, sample_size: { type: "number" } }, required: ["area", "predicted_value", "confidence"] },
        },
        coverage_analysis: {
          type: "array",
          items: { type: "object", properties: { area: { type: "string" }, most_prevalent_outcome: { type: "string" }, coverage_percentage: { type: "number" }, outcome_distribution: { type: "object" }, total_observations: { type: "number" }, predicted_observations: { type: "number" } }, required: ["area", "most_prevalent_outcome", "coverage_percentage", "total_observations", "predicted_observations"] },
        },
        model_health: {
          type: "object",
          properties: { overfitting_risk: { type: "string" }, underfitting_risk: { type: "string" }, train_test_gap: { type: "number" }, bias_variance_assessment: { type: "string" }, class_balance_status: { type: "string" }, recommendations: { type: "array", items: { type: "string" } } },
          required: ["overfitting_risk", "underfitting_risk", "train_test_gap", "bias_variance_assessment", "class_balance_status", "recommendations"],
        },
        insights: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
        model_summary: { type: "string" },
      },
      required: ["metrics", "feature_importances", "predictions", "coverage_analysis", "model_health", "insights", "model_summary"],
    };

    const mlResults = await callGemini(prompt, responseSchema);
    return new Response(JSON.stringify(mlResults), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("ml-predict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
