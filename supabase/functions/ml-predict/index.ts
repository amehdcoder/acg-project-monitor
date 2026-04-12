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
    const { action, data, config } = await req.json();

    let prompt = "";

    if (action === "train_predict") {
      const healthConfig = config.regularization
        ? `\n- Regularization: ENABLED (strength: ${config.regularizationStrength || 0.5})`
        : `\n- Regularization: DISABLED`;
      const classBalanceConfig = config.classBalancing ? `\n- Class Balancing: ENABLED` : `\n- Class Balancing: DISABLED`;
      const earlyStopConfig = config.earlyStopping ? `\n- Early Stopping: ENABLED` : `\n- Early Stopping: DISABLED`;

      prompt = `YOUR TASKS:
1. Analyze the data thoroughly, checking for class imbalance, missing values, and feature quality
2. Apply the specified ML algorithm with the given model health controls
3. Evaluate overfitting vs underfitting by comparing train vs test performance
4. Return PRECISE numerical results

CRITICAL RULES:
- All metrics (accuracy, precision, recall, f1_score) must be between 0 and 1
- Feature importances must sum to approximately 1.0
- train_accuracy should be realistic relative to test_accuracy
- Provide cross-validation scores consistent with the number of folds specified

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
Feature statistics: ${JSON.stringify(data.featureStats)}

Return JSON with: metrics, feature_importances, predictions, coverage_analysis, model_health, insights, model_summary`;
    } else if (action === "analyze") {
      prompt = `Analyze these ML results and provide insights:\n${JSON.stringify(data)}\n\nReturn JSON with: metrics, feature_importances, predictions, coverage_analysis, model_health, insights, model_summary`;
    }

    const mlResults = await callOpenAI(
      "You are an expert machine learning scientist specializing in public health interventions, NTD programs, and survey data analysis. Return only valid JSON.",
      prompt
    );
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
