import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chatMessages, callType, groupName, hostName, duration, participants } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a professional meeting assistant. Given in-call chat messages and meeting details, produce a well-formatted meeting summary. 

CRITICAL FORMATTING RULES:
- Do NOT use hashtags (#) for headers. Use plain text headers followed by a colon or with capitalization.
- Do NOT use asterisks (*) for bold or emphasis. Use plain text.
- Use numbered lists (1. 2. 3.) for key points.
- Use bullet points (- ) for sub-items.
- Use clear section separators with blank lines.
- Keep headers as plain capitalized text like "MEETING SUMMARY" or "Key Discussion Points:"
- Write in a professional, clear, concise style.

Structure the summary with these sections:
- MEETING SUMMARY (brief overview)
- KEY DISCUSSION POINTS (numbered list of main topics discussed)
- ACTION ITEMS (if any were mentioned)
- DECISIONS MADE (if any)
- NOTES (any other relevant observations)`;

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

Please produce a professional meeting summary based on the above information.`;

    const tools = [{
      type: "function",
      function: {
        name: "meeting_summary",
        description: "Return formatted meeting summary",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "The full formatted meeting summary text" },
            key_points: { type: "array", items: { type: "string" } },
            action_items: { type: "array", items: { type: "string" } },
          },
          required: ["summary"],
        },
      },
    }];

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
        tools,
        tool_choice: { type: "function", function: { name: "meeting_summary" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
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
      const summaryResults = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(summaryResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No tool call in response");
  } catch (e) {
    console.error("meeting-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
