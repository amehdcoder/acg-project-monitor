import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, equations, parameters, initialValues, timeConfig, fittingData, compartments } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";
    let toolName = "model_results";
    let toolParams: any = {};

    if (action === "simulate") {
      systemPrompt = `You are an expert mathematical epidemiologist and dynamical systems modeler. Given a system of differential/difference equations with parameters and initial conditions, you must numerically solve them using an appropriate method (RK4 for ODEs, direct iteration for difference equations).

CRITICAL RULES:
- Use proper numerical integration (Runge-Kutta 4th order for differential equations)
- Ensure conservation laws are respected (e.g., total population N = S + I + R for SIR)
- Time series values must be non-negative
- Return enough time points for smooth curves (at least 100 points)
- All values must be mathematically consistent with the equations`;

      userPrompt = `System of equations:
${equations.join("\n")}

Parameters: ${JSON.stringify(parameters)}
Initial values: ${JSON.stringify(initialValues)}
Time range: t = ${timeConfig.start} to ${timeConfig.end}, step = ${timeConfig.step}
Compartments: ${JSON.stringify(compartments)}

Solve this system numerically and return the time series for each compartment.`;

      toolParams = {
        type: "object",
        properties: {
          time_series: {
            type: "object",
            description: "Keys are compartment names, values are arrays of {t, value} objects",
            additionalProperties: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  t: { type: "number" },
                  value: { type: "number" },
                },
                required: ["t", "value"],
              },
            },
          },
          equilibria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                values: { type: "object" },
                stability: { type: "string" },
              },
            },
          },
          summary: { type: "string" },
        },
        required: ["time_series", "summary"],
      };
    } else if (action === "r0_analysis") {
      systemPrompt = `You are an expert in mathematical epidemiology specializing in basic reproduction number (R0) analysis. Given a compartmental model, compute R0 using the Next Generation Matrix method or direct calculation. Provide both the analytical expression and numerical value.`;

      userPrompt = `Equations:\n${equations.join("\n")}\nParameters: ${JSON.stringify(parameters)}\n\nCompute R0 for this model. Provide the analytical formula, numerical value, and interpretation.`;
      toolName = "r0_results";
      toolParams = {
        type: "object",
        properties: {
          r0_formula: { type: "string" },
          r0_value: { type: "number" },
          interpretation: { type: "string" },
          disease_free_equilibrium: { type: "object" },
          endemic_equilibrium: { type: "object" },
          threshold_analysis: { type: "string" },
          parameter_thresholds: {
            type: "array",
            items: {
              type: "object",
              properties: {
                parameter: { type: "string" },
                threshold_value: { type: "number" },
                condition: { type: "string" },
              },
            },
          },
        },
        required: ["r0_formula", "r0_value", "interpretation"],
      };
    } else if (action === "sensitivity_analysis") {
      systemPrompt = `You are an expert in sensitivity analysis for dynamical systems. Perform a thorough sensitivity analysis by varying each parameter and computing the sensitivity index (elasticity) of key outputs (e.g., R0, peak infection, final size) with respect to each parameter.`;

      userPrompt = `Equations:\n${equations.join("\n")}\nParameters: ${JSON.stringify(parameters)}\nInitial values: ${JSON.stringify(initialValues)}\n\nPerform sensitivity analysis. For each parameter, compute normalized sensitivity indices for R0 and peak values.`;
      toolName = "sensitivity_results";
      toolParams = {
        type: "object",
        properties: {
          sensitivity_indices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                parameter: { type: "string" },
                sensitivity_to_r0: { type: "number" },
                sensitivity_to_peak: { type: "number" },
                sensitivity_to_final_size: { type: "number" },
                interpretation: { type: "string" },
              },
              required: ["parameter", "sensitivity_to_r0"],
            },
          },
          most_sensitive_parameter: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } },
          prcc_values: {
            type: "array",
            items: {
              type: "object",
              properties: {
                parameter: { type: "string" },
                prcc: { type: "number" },
                p_value: { type: "number" },
              },
            },
          },
          summary: { type: "string" },
        },
        required: ["sensitivity_indices", "most_sensitive_parameter", "summary"],
      };
    } else if (action === "scenario_analysis") {
      systemPrompt = `You are an expert in epidemic scenario planning. Given a compartmental model, simulate multiple scenarios (baseline, optimistic, pessimistic, intervention) by varying key parameters. Provide comparative analysis.`;

      userPrompt = `Equations:\n${equations.join("\n")}\nBaseline parameters: ${JSON.stringify(parameters)}\nInitial values: ${JSON.stringify(initialValues)}\nTime: ${timeConfig.start} to ${timeConfig.end}\nCompartments: ${JSON.stringify(compartments)}\n\nCreate 4 scenarios: Baseline, Optimistic (reduced transmission), Pessimistic (increased transmission), and Intervention (targeted parameter changes). Return time series for each.`;
      toolName = "scenario_results";
      toolParams = {
        type: "object",
        properties: {
          scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                parameters: { type: "object" },
                time_series: {
                  type: "object",
                  additionalProperties: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { t: { type: "number" }, value: { type: "number" } },
                      required: ["t", "value"],
                    },
                  },
                },
                peak_info: {
                  type: "object",
                  properties: {
                    compartment: { type: "string" },
                    peak_value: { type: "number" },
                    peak_time: { type: "number" },
                  },
                },
                r0: { type: "number" },
              },
              required: ["name", "description", "parameters", "time_series"],
            },
          },
          comparison_summary: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["scenarios", "comparison_summary"],
      };
    } else if (action === "fit_model") {
      systemPrompt = `You are an expert in parameter estimation and model calibration. Given a compartmental model, observed data, and target parameters to fit, use least squares optimization to find the best-fit parameter values. Return the fitted parameters, goodness-of-fit metrics, and fitted vs observed comparison.`;

      userPrompt = `Equations:\n${equations.join("\n")}\nFixed parameters: ${JSON.stringify(parameters)}\nInitial values: ${JSON.stringify(initialValues)}\nTarget parameters to fit: ${JSON.stringify(fittingData.targetParams)}\nObserved data:\n${JSON.stringify(fittingData.observedData)}\nData column mapping: ${JSON.stringify(fittingData.columnMapping)}\n\nFit the target parameters to minimize the sum of squared residuals between model output and observed data.`;
      toolName = "fitting_results";
      toolParams = {
        type: "object",
        properties: {
          fitted_parameters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                initial_value: { type: "number" },
                fitted_value: { type: "number" },
                confidence_interval: {
                  type: "object",
                  properties: { lower: { type: "number" }, upper: { type: "number" } },
                },
              },
              required: ["name", "fitted_value"],
            },
          },
          goodness_of_fit: {
            type: "object",
            properties: {
              r_squared: { type: "number" },
              rmse: { type: "number" },
              aic: { type: "number" },
              bic: { type: "number" },
              chi_squared: { type: "number" },
            },
          },
          fitted_curves: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: {
                type: "object",
                properties: { t: { type: "number" }, value: { type: "number" } },
                required: ["t", "value"],
              },
            },
          },
          residuals: {
            type: "array",
            items: {
              type: "object",
              properties: { t: { type: "number" }, residual: { type: "number" } },
            },
          },
          summary: { type: "string" },
        },
        required: ["fitted_parameters", "goodness_of_fit", "summary"],
      };
    }

    const tools = [
      {
        type: "function",
        function: {
          name: toolName,
          description: `Return ${action} results`,
          parameters: toolParams,
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
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
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
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const modelResults = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(modelResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No tool call in response");
  } catch (e) {
    console.error("math-model error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
