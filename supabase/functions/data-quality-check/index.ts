import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissions, action } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    const baseSystem = "You are a data quality analyst for a public health monitoring system in Nigeria. All text output must be plain text only - no markdown. Return ONLY valid JSON.";

    if (action === "detect_duplicates") {
      systemPrompt = `${baseSystem} Analyze form submissions and identify potential duplicates.`;
      userPrompt = `Analyze these form submissions for potential duplicates. Look for:
1. Same or very similar respondent names/identifiers
2. Submissions from the same location within a short time window
3. Nearly identical response patterns
4. Same enumerator submitting very similar data repeatedly

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 50), null, 2)}`;
    } else if (action === "detect_anomalies") {
      systemPrompt = `${baseSystem} Analyze form submissions and flag anomalies.`;
      userPrompt = `Analyze these form submissions for anomalies. Look for:
1. Impossible or out-of-range values
2. Suspicious timestamps
3. Statistical outliers
4. Inconsistent responses
5. Pattern anomalies suggesting fabricated data

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 50), null, 2)}`;
    } else if (action === "suggest_validations") {
      systemPrompt = `${baseSystem} Suggest validation rules to improve data quality.`;
      userPrompt = `Based on these historical submissions, suggest validation rules:

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 30), null, 2)}`;
    } else if (action === "full_analysis") {
      systemPrompt = `${baseSystem} Perform a comprehensive data quality analysis.`;
      userPrompt = `Perform comprehensive data quality analysis covering duplicates, anomalies, completeness, consistency, and validation suggestions.

Submissions data (JSON):
${JSON.stringify(submissions.slice(0, 50), null, 2)}`;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    userPrompt += `\n\nReturn JSON with this structure:
{"findings": [{"id": "string", "type": "string", "severity": "string", "title": "string", "description": "string", "affected_submissions": ["string"], "field_name": "string", "recommended_action": "string"}], "summary": {"total_issues": number, "critical_count": number, "warning_count": number, "data_quality_score": number, "recommendation": "string"}}`;

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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", fallback: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("OpenAI API error:", response.status, text);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const findings = JSON.parse(content);

    if (findings.findings) {
      findings.findings = findings.findings.map((f: any) => ({
        ...f,
        title: (f.title || "").replace(/[*#_`]/g, ""),
        description: (f.description || "").replace(/[*#_`]/g, ""),
        recommended_action: (f.recommended_action || "").replace(/[*#_`]/g, ""),
      }));
    }
    if (findings.summary?.recommendation) {
      findings.summary.recommendation = findings.summary.recommendation.replace(/[*#_`]/g, "");
    }

    return new Response(JSON.stringify(findings), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("data-quality-check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
