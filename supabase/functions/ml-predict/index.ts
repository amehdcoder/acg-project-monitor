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
      systemPrompt = `You are an expert machine learning scientist specializing in public health interventions, NTD programs, and survey data analysis. You will receive a dataset with features and a target variable, along with the ML method to use and model health configuration.

YOUR TASKS:
1. Analyze the data thoroughly, checking for class imbalance, missing values, and feature quality
2. Apply the specified ML algorithm with the given model health controls (regularization, class balancing, cross-validation, etc.)
3. Evaluate overfitting vs underfitting by comparing train vs test performance
4. Return PRECISE numerical results via the tool call

CRITICAL RULES:
- All metrics (accuracy, precision, recall, f1_score) must be between 0 and 1
- Feature importances must sum to approximately 1.0
- train_accuracy should be realistic relative to test_accuracy (small gap = good generalization, large gap = overfitting)
- If class balancing is enabled, adjust for imbalanced classes using SMOTE or class weighting
- If regularization is enabled, apply L1/L2 penalty based on strength parameter
- Provide cross-validation scores consistent with the number of folds specified

COVERAGE ANALYSIS (CRITICAL):
For each geographic area (based on prediction level), you MUST calculate:
- The most prevalent (majority) predicted outcome for that area
- The coverage percentage: (count of most prevalent outcome / total predictions in that area) * 100
- The distribution of ALL outcomes as percentages
- This simulates how monitoring teams can generalize from sampled communities to the whole area

Example: If in LGA "Kano Municipal", out of 20 communities visited, 14 are "Completed", 3 are "Ongoing", 2 are "Not Started", 1 is "Halted":
  - most_prevalent_outcome: "Completed"
  - coverage_percentage: 70.0
  - outcome_distribution: {"Completed": 70.0, "Ongoing": 15.0, "Not Started": 10.0, "Halted": 5.0}

MODEL HEALTH ASSESSMENT:
- overfitting_risk: "low" if train-test gap < 5%, "medium" if 5-15%, "high" if > 15%
- underfitting_risk: "low" if test accuracy > 0.7, "medium" if 0.5-0.7, "high" if < 0.5
- Provide actionable recommendations based on the assessment`;

      const healthConfig = config.regularization
        ? `\n- Regularization: ENABLED (strength: ${config.regularizationStrength || 0.5})`
        : `\n- Regularization: DISABLED`;
      const classBalanceConfig = config.classBalancing
        ? `\n- Class Balancing: ENABLED (use SMOTE or class weights to handle imbalance)`
        : `\n- Class Balancing: DISABLED`;
      const earlyStopConfig = config.earlyStopping
        ? `\n- Early Stopping: ENABLED (stop when validation loss increases)`
        : `\n- Early Stopping: DISABLED`;

      userPrompt = `Dataset Summary:
- Total records: ${data.totalRecords}
- Features used: ${JSON.stringify(data.features)}
- Target variable: ${data.target}
- ML Method: ${config.method}
- Split ratio: Train ${config.trainRatio}% / Test ${config.testRatio}% / Validation ${config.valRatio}%
- Prediction level: ${config.predictionLevel}
- Cross-validation folds: ${config.crossValidationFolds || 5}
- Max tree depth: ${config.maxDepth || 10}
- Min samples per leaf: ${config.minSamplesLeaf || 5}
${healthConfig}${classBalanceConfig}${earlyStopConfig}

Sample data (first 50 rows):
${JSON.stringify(data.sampleData?.slice(0, 50))}

Unique target values: ${JSON.stringify(data.uniqueTargets)}
Feature statistics: ${JSON.stringify(data.featureStats)}

INSTRUCTIONS:
1. Train the ${config.method} model with the specified health controls
2. Evaluate for overfitting (compare train vs test accuracy) and underfitting (is test accuracy acceptable?)
3. Generate predictions for each ${config.predictionLevel} area found in the data
4. For EACH area, compute the coverage_analysis: identify the most prevalent predicted outcome and its coverage percentage
5. Provide model_health assessment with overfitting_risk, underfitting_risk, train_test_gap, and recommendations
6. Include confusion matrix for classification tasks`;
    } else if (action === "analyze") {
      systemPrompt = `You are an expert data scientist. Analyze the provided ML results and give actionable insights. Return results via the tool call.`;
      userPrompt = `Analyze these ML results and provide insights:\n${JSON.stringify(data)}`;
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "ml_results",
          description: "Return machine learning results including model health assessment and intervention coverage analysis",
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
              coverage_analysis: {
                type: "array",
                description: "Coverage analysis per geographic area showing the most prevalent predicted outcome and its coverage percentage",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string", description: "Geographic area name (e.g., LGA name)" },
                    most_prevalent_outcome: { type: "string", description: "The most common predicted outcome in this area (e.g., Completed, Not Started, Ongoing, Halted)" },
                    coverage_percentage: { type: "number", description: "Percentage of observations with the most prevalent outcome (0-100)" },
                    outcome_distribution: {
                      type: "object",
                      description: "Distribution of all predicted outcomes as percentages summing to 100",
                      additionalProperties: { type: "number" },
                    },
                    total_observations: { type: "number", description: "Total number of observations/communities in this area" },
                    predicted_observations: { type: "number", description: "Number of observations with the most prevalent outcome" },
                  },
                  required: ["area", "most_prevalent_outcome", "coverage_percentage", "outcome_distribution", "total_observations", "predicted_observations"],
                },
              },
              model_health: {
                type: "object",
                description: "Assessment of model health including overfitting and underfitting risks",
                properties: {
                  overfitting_risk: { type: "string", enum: ["low", "medium", "high"], description: "Risk level based on train-test accuracy gap" },
                  underfitting_risk: { type: "string", enum: ["low", "medium", "high"], description: "Risk level based on absolute test accuracy" },
                  train_test_gap: { type: "number", description: "Absolute difference between train and test accuracy (0-1)" },
                  bias_variance_assessment: { type: "string", description: "Human-readable assessment of bias-variance tradeoff" },
                  class_balance_status: { type: "string", description: "Whether classes are balanced or imbalanced and what was done" },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Actionable recommendations to improve model performance",
                  },
                },
                required: ["overfitting_risk", "underfitting_risk", "train_test_gap", "bias_variance_assessment", "class_balance_status", "recommendations"],
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
            required: ["metrics", "feature_importances", "predictions", "coverage_analysis", "model_health", "insights", "model_summary"],
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
