import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chatMessages, callType, groupName, hostName, duration, participants } = await req.json();
    const DSS_AI_GATEWAY_KEY = Deno.env.get("DSS_AI_GATEWAY_KEY");
    if (!DSS_AI_GATEWAY_KEY) throw new Error("DSS_AI_GATEWAY_KEY is not configured");

    const chatTranscript = chatMessages && chatMessages.length > 0
      ? chatMessages.map((m: any) => `${m.fromName}: ${m.content}`).join("\n")
      : "No chat messages were exchanged during this meeting.";

    const participantList = participants && participants.length > 0
      ? participants.map((p: any) => `- ${p.name} (joined for ${p.duration})`).join("\n")
      : "No participant data available.";

    const userPrompt = `Meeting Details:
- Group: ${groupName}
- Type: ${callType === "video" ? "Video Call" : "Voice Call"}
- Host: ${hostName}
- Duration: ${duration}
- Participants:\n${participantList}

In-Call Chat Transcript:
${chatTranscript}

Please produce a professional meeting summary. Return ONLY valid JSON with: {"summary": "text", "key_points": ["point1"], "action_items": ["item1"]}`;

    const response = await fetch("https://api.internal-ai-gateway.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DSS_AI_GATEWAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional meeting assistant. Produce well-formatted meeting summaries. No markdown formatting. Return valid JSON only." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", fallback: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("OpenAI API error:", response.status, t);
      return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";

    try {
      const summaryResults = JSON.parse(content);
      return new Response(JSON.stringify(summaryResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ summary: content, key_points: [], action_items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("meeting-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", fallback: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
