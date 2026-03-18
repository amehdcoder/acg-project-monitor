import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projectId, formId } = await req.json();

    // Build query for submissions that have repeat reason fields
    let query = supabase
      .from("form_submissions")
      .select("id, form_id, data, submitted_at, user_id, forms!inner(id, name, project_id, projects!inner(id, name))")
      .neq("status", "draft");

    if (formId) {
      query = query.eq("form_id", formId);
    }

    const { data: submissions, error } = await query.order("submitted_at", { ascending: false }).limit(500);
    if (error) throw error;

    // Filter to submissions that have _repeat_reason_ keys and optionally match projectId
    const reasonEntries: {
      projectId: string;
      projectName: string;
      formId: string;
      formName: string;
      groupId: string;
      reason: string;
      target: number;
      actual: number;
      submittedAt: string;
      userId: string;
    }[] = [];

    for (const sub of submissions || []) {
      const form = sub.forms as any;
      if (!form) continue;
      const project = form.projects as any;
      if (!project) continue;
      if (projectId && project.id !== projectId) continue;

      const data = sub.data as Record<string, any>;
      if (!data || typeof data !== "object") continue;

      for (const key of Object.keys(data)) {
        if (key.startsWith("_repeat_reason_") && data[key]) {
          const gId = key.replace("_repeat_reason_", "");
          reasonEntries.push({
            projectId: project.id,
            projectName: project.name,
            formId: form.id,
            formName: form.name,
            groupId: gId,
            reason: String(data[key]),
            target: Number(data[`_repeat_target_${gId}`] || 0),
            actual: Number(data[`_repeat_actual_${gId}`] || 0),
            submittedAt: sub.submitted_at || "",
            userId: sub.user_id,
          });
        }
      }
    }

    if (reasonEntries.length === 0) {
      return new Response(
        JSON.stringify({
          analysis: null,
          message: "No incomplete iteration reasons found.",
          entries: [],
          summary: { totalReasons: 0, projects: [], forms: [] },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build summary
    const projectMap = new Map<string, { name: string; count: number }>();
    const formMap = new Map<string, { name: string; projectName: string; count: number }>();
    for (const e of reasonEntries) {
      const pm = projectMap.get(e.projectId) || { name: e.projectName, count: 0 };
      pm.count++;
      projectMap.set(e.projectId, pm);
      const fm = formMap.get(e.formId) || { name: e.formName, projectName: e.projectName, count: 0 };
      fm.count++;
      formMap.set(e.formId, fm);
    }

    // Call AI for thematic analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let analysis = null;

    if (LOVABLE_API_KEY && reasonEntries.length > 0) {
      const reasonTexts = reasonEntries.map(
        (e, i) =>
          `${i + 1}. [${e.projectName} / ${e.formName}] Target: ${e.target}, Completed: ${e.actual}. Reason: "${e.reason}"`
      );

      const prompt = `You are a data quality analyst for a field data collection platform. Analyze the following reasons provided by data collectors for not completing all required repeat group iterations during form filling.

REASONS (${reasonEntries.length} total):
${reasonTexts.join("\n")}

Provide a structured thematic analysis with:
1. THEMES: Identify 3-8 recurring themes/categories with counts and representative quotes. Each theme should have: name, description, count, percentage, example quotes (2-3).
2. KEY_FINDINGS: 3-5 bullet points summarizing the most important patterns.
3. RECOMMENDATIONS: 3-5 actionable recommendations to address the identified issues.
4. SEVERITY: Rate overall severity as "low", "medium", "high", or "critical".

Format your response as clean text without markdown artifacts (no asterisks, hashtags, underscores for formatting). Use plain numbered lists and clear headings.`;

      try {
        const aiResponse = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You are a field data collection quality analyst. Provide clean, professional analysis without markdown formatting artifacts." },
                { role: "user", content: prompt },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "thematic_analysis",
                    description: "Return structured thematic analysis of incomplete iteration reasons",
                    parameters: {
                      type: "object",
                      properties: {
                        themes: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              description: { type: "string" },
                              count: { type: "number" },
                              percentage: { type: "number" },
                              examples: { type: "array", items: { type: "string" } },
                            },
                            required: ["name", "description", "count", "percentage", "examples"],
                          },
                        },
                        keyFindings: { type: "array", items: { type: "string" } },
                        recommendations: { type: "array", items: { type: "string" } },
                        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      },
                      required: ["themes", "keyFindings", "recommendations", "severity"],
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "thematic_analysis" } },
            }),
          }
        );

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            analysis = JSON.parse(toolCall.function.arguments);
          }
        } else if (aiResponse.status === 429) {
          console.error("AI rate limited");
        } else if (aiResponse.status === 402) {
          console.error("AI credits exhausted");
        }
      } catch (aiErr) {
        console.error("AI analysis error:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({
        analysis,
        entries: reasonEntries,
        summary: {
          totalReasons: reasonEntries.length,
          projects: Array.from(projectMap.entries()).map(([id, v]) => ({ id, ...v })),
          forms: Array.from(formMap.entries()).map(([id, v]) => ({ id, ...v })),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
