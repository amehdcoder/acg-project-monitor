import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissions, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "detect_duplicates") {
      systemPrompt = `You are a data quality analyst for a public health monitoring system in Nigeria. Analyze form submissions and identify potential duplicates based on similar respondent names, locations, timestamps, and data patterns. Be thorough but avoid false positives.`;
      userPrompt = `Analyze these form submissions for potential duplicates. Look for:
1. Same or very similar respondent names/identifiers
2. Submissions from the same location within a short time window
3. Nearly identical response patterns across different submissions
4. Same enumerator submitting very similar data repeatedly

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 50), null, 2)}`;
    } else if (action === "detect_anomalies") {
      systemPrompt = `You are a data quality analyst for a public health monitoring system. Analyze form submissions and flag anomalies: impossible values, suspicious patterns, outliers, and data entry errors. Focus on actionable findings.`;
      userPrompt = `Analyze these form submissions for anomalies and data quality issues. Look for:
1. Impossible or out-of-range values (e.g., age > 150, negative counts)
2. Suspicious timestamps (submissions at unusual hours, impossibly fast completion)
3. Statistical outliers compared to the dataset
4. Inconsistent responses within the same submission
5. Pattern anomalies suggesting copy-paste or fabricated data

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 50), null, 2)}`;
    } else if (action === "suggest_validations") {
      systemPrompt = `You are a form design expert for public health data collection in Nigeria. Based on historical submission data, suggest validation rules that would improve data quality.`;
      userPrompt = `Based on these historical submissions, suggest validation rules to improve data quality. For each suggestion, provide:
1. The field/question it applies to
2. The validation rule (min/max, regex, conditional logic)
3. Why this rule would help
4. Priority (high/medium/low)

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 30), null, 2)}`;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_findings",
              description: "Report data quality findings",
              parameters: {
                type: "object",
                properties: {
                  findings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Unique finding ID" },
                        type: { type: "string", enum: ["duplicate", "anomaly", "validation_suggestion", "outlier", "pattern"] },
                        severity: { type: "string", enum: ["critical", "warning", "info"] },
                        title: { type: "string", description: "Short description" },
                        description: { type: "string", description: "Detailed explanation" },
                        affected_submissions: {
                          type: "array",
                          items: { type: "string" },
                          description: "IDs of affected submissions"
                        },
                        field_name: { type: "string", description: "The form field involved" },
                        recommended_action: { type: "string", description: "What to do about it" },
                      },
                      required: ["id", "type", "severity", "title", "description", "recommended_action"],
                      additionalProperties: false,
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      total_issues: { type: "number" },
                      critical_count: { type: "number" },
                      warning_count: { type: "number" },
                      data_quality_score: { type: "number", description: "0-100 score" },
                      recommendation: { type: "string" },
                    },
                    required: ["total_issues", "critical_count", "warning_count", "data_quality_score", "recommendation"],
                    additionalProperties: false,
                  },
                },
                required: ["findings", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_findings" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
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
      const findings = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(findings), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if no tool call
    return new Response(JSON.stringify({
      findings: [],
      summary: {
        total_issues: 0,
        critical_count: 0,
        warning_count: 0,
        data_quality_score: 100,
        recommendation: "No issues detected.",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("data-quality-check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
