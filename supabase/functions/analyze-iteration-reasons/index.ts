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

    let query = supabase
      .from("form_submissions")
      .select("id, form_id, data, submitted_at, user_id, forms!inner(id, name, project_id, projects!inner(id, name))")
      .neq("status", "draft");

    if (formId) {
      query = query.eq("form_id", formId);
    }

    const { data: submissions, error } = await query.order("submitted_at", { ascending: false }).limit(500);
    if (error) throw error;

    const reasonEntries: {
      projectId: string; projectName: string; formId: string; formName: string;
      groupId: string; reason: string; target: number; actual: number;
      submittedAt: string; userId: string;
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
            projectId: project.id, projectName: project.name,
            formId: form.id, formName: form.name, groupId: gId,
            reason: String(data[key]),
            target: Number(data[`_repeat_target_${gId}`] || 0),
            actual: Number(data[`_repeat_actual_${gId}`] || 0),
            submittedAt: sub.submitted_at || "", userId: sub.user_id,
          });
        }
      }
    }

    if (reasonEntries.length === 0) {
      return new Response(
        JSON.stringify({ analysis: null, message: "No incomplete iteration reasons found.", entries: [], summary: { totalReasons: 0, projects: [], forms: [] } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectMap = new Map<string, { name: string; count: number }>();
    const formMap = new Map<string, { name: string; projectName: string; count: number }>();
    for (const e of reasonEntries) {
      const pm = projectMap.get(e.projectId) || { name: e.projectName, count: 0 };
      pm.count++; projectMap.set(e.projectId, pm);
      const fm = formMap.get(e.formId) || { name: e.formName, projectName: e.projectName, count: 0 };
      fm.count++; formMap.set(e.formId, fm);
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    let analysis = null;

    if (GOOGLE_GEMINI_API_KEY && reasonEntries.length > 0) {
      const reasonTexts = reasonEntries.map(
        (e, i) => `${i + 1}. [${e.projectName} / ${e.formName}] Target: ${e.target}, Completed: ${e.actual}. Reason: "${e.reason}"`
      );

      const prompt = `You are a data quality analyst for a field data collection platform. Analyze the following reasons provided by data collectors for not completing all required repeat group iterations.

REASONS (${reasonEntries.length} total):
${reasonTexts.join("\n")}

Provide a structured thematic analysis with:
1. THEMES: Identify 3-8 recurring themes with counts and representative quotes.
2. KEY_FINDINGS: 3-5 bullet points summarizing the most important patterns.
3. RECOMMENDATIONS: 3-5 actionable recommendations.
4. SEVERITY: Rate overall severity as "low", "medium", "high", or "critical".`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: {
                    themes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" }, description: { type: "string" },
                          count: { type: "number" }, percentage: { type: "number" },
                          examples: { type: "array", items: { type: "string" } },
                        },
                        required: ["name", "description", "count", "percentage", "examples"],
                      },
                    },
                    keyFindings: { type: "array", items: { type: "string" } },
                    recommendations: { type: "array", items: { type: "string" } },
                    severity: { type: "string" },
                  },
                  required: ["themes", "keyFindings", "recommendations", "severity"],
                },
              },
            }),
          }
        );

        if (response.ok) {
          const aiData = await response.json();
          const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (content) analysis = JSON.parse(content);
        }
      } catch (aiErr) {
        console.error("AI analysis error:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({
        analysis, entries: reasonEntries,
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
