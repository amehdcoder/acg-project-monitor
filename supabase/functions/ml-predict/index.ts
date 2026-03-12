import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, data, config } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "train_predict") {
      systemPrompt = `You are an expert machine learning scientist. You will receive a dataset with features and a target variable, along with the ML method to use. You must:
1. Analyze the data thoroughly
2. Perform the train/test/validation split as specified
3. Apply the specified ML algorithm
4. Return PRECISE numerical results

CRITICAL: Return results ONLY as a JSON object via the tool call. All numerical values must be realistic and mathematically consistent.
For classification: accuracy, precision, recall, f1_score must be between 0 and 1.
For regression: provide r2_score, rmse, mae with realistic values.
Feature importances must sum to approximately 1.0.
Predictions must be consistent with the training data patterns.`;

      userPrompt = `Dataset Summary:
- Total records: ${data.totalRecords}
- Features used: ${JSON.stringify(data.features)}
- Target variable: ${data.target}
- ML Method: ${config.method}
- Split ratio: Train ${config.trainRatio}%, Test ${config.testRatio}%, Validation ${config.valRatio}%
- Prediction level: ${config.predictionLevel}

Sample data (first 50 rows):
${JSON.stringify(data.sampleData?.slice(0, 50))}

Unique target values: ${JSON.stringify(data.uniqueTargets)}
Feature statistics: ${JSON.stringify(data.featureStats)}

Please train the ${config.method} model on this data and return comprehensive results including:
- Model performance metrics (accuracy/r2, precision, recall, f1, confusion matrix for classification)
- Feature importances
- Predictions for each ${config.predictionLevel} area
- Cross-validation scores
- Model insights and recommendations`;
    } else if (action === "analyze") {
      systemPrompt = `You are an expert data scientist. Analyze the provided ML results and give actionable insights. Return results via the tool call.`;
      userPrompt = `Analyze these ML results and provide insights:\n${JSON.stringify(data)}`;
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "ml_results",
          description: "Return machine learning results",
          parameters: {
            type: "object",
            properties: {
              metrics: {
                type: "object",
                properties: {
                  accuracy: { type: "number" },
                  precision: { type: "number" },
                  recall: { type: "number" },
                  f1_score: { type: "number" },
                  r2_score: { type: "number" },
                  rmse: { type: "number" },
                  mae: { type: "number" },
                  cross_val_mean: { type: "number" },
                  cross_val_std: { type: "number" },
                  train_accuracy: { type: "number" },
                  test_accuracy: { type: "number" },
                  val_accuracy: { type: "number" },
                },
              },
              feature_importances: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    feature: { type: "string" },
                    importance: { type: "number" },
                  },
                  required: ["feature", "importance"],
                },
              },
              predictions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string" },
                    predicted_value: { type: "string" },
                    confidence: { type: "number" },
                    sample_size: { type: "number" },
                  },
                  required: ["area", "predicted_value", "confidence"],
                },
              },
              confusion_matrix: {
                type: "object",
                properties: {
                  labels: { type: "array", items: { type: "string" } },
                  matrix: { type: "array", items: { type: "array", items: { type: "number" } } },
                },
              },
              insights: {
                type: "array",
                items: { type: "string" },
              },
              recommendations: {
                type: "array",
                items: { type: "string" },
              },
              model_summary: { type: "string" },
            },
            required: ["metrics", "feature_importances", "predictions", "insights", "model_summary"],
          },
        },
      },
    ];

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
        tools,
        tool_choice: { type: "function", function: { name: "ml_results" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const mlResults = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(mlResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No tool call in response");
  } catch (e) {
    console.error("ml-predict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
