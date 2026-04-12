import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chatMessages, callType, groupName, hostName, duration, participants } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) throw new Error("GOOGLE_GEMINI_API_KEY is not configured");

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
- NOTES (any other relevant observations)

IMPORTANT: Return your response as valid JSON with this exact structure:
{"summary": "the full formatted summary text", "key_points": ["point1", "point2"], "action_items": ["item1", "item2"]}`;

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

Please produce a professional meeting summary based on the above information. Return ONLY valid JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", fallback: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Google Gemini API error:", response.status, t);
      return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    try {
      const summaryResults = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
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
