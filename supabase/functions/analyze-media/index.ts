import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Convert a data URL or base64 string into a Blob for the ElevenLabs upload. */
function base64ToBlob(input: string, fallbackMime: string): { blob: Blob; mime: string } {
  let mime = fallbackMime;
  let b64 = input;
  const match = input.match(/^data:([^;]+);base64,(.*)$/s);
  if (match) {
    mime = match[1];
    b64 = match[2];
  } else if (input.includes(",")) {
    b64 = input.split(",")[1];
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

/** Transcribe audio/video bytes with ElevenLabs Scribe. Returns "" on failure. */
async function transcribeWithScribe(
  mediaData: string,
  fallbackMime: string,
): Promise<{ text: string; error?: string }> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return { text: "", error: "ELEVENLABS_API_KEY not configured" };

  try {
    const { blob } = base64ToBlob(mediaData, fallbackMime);
    const up = new FormData();
    up.append("file", blob, "media");
    up.append("model_id", "scribe_v2");
    up.append("tag_audio_events", "true");
    up.append("diarize", "true");

    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: up,
    });
    if (!r.ok) {
      const t = await r.text();
      return { text: "", error: `Scribe ${r.status}: ${t.slice(0, 200)}` };
    }
    const data = await r.json();
    return { text: data?.text || "" };
  } catch (e) {
    return { text: "", error: String(e instanceof Error ? e.message : e) };
  }
}

/** Call Lovable AI gateway for JSON analysis. */
async function gatewayJson(messages: any[], model = "google/gemini-2.5-flash"): Promise<any | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const resp = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429 || resp.status === 402) {
      throw new Response(JSON.stringify({ error: "rate_limited", status: resp.status, fallback: true }), { status: 200 });
    }
    return null;
  }
  const aiData = await resp.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content.slice(0, 400), extractedData: {}, qualityFlags: [], confidence: 0.6 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mediaData, mediaType, fileName, mimeType } = await req.json();

    if (!mediaData || !mediaType) {
      return new Response(JSON.stringify({ error: "Missing mediaData or mediaType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let transcript = "";
    let transcriptError: string | undefined;

    // 1. TRANSCRIPTION — audio & video
    if (mediaType === "audio" || mediaType === "video") {
      const fallbackMime = mimeType || (mediaType === "audio" ? "audio/webm" : "video/mp4");
      const res = await transcribeWithScribe(mediaData, fallbackMime);
      transcript = res.text;
      transcriptError = res.error;
    }

    // 2. ANALYSIS via Lovable AI
    let analysis: any = null;

    if (mediaType === "image") {
      const base64Content = mediaData.includes(",") ? mediaData.split(",")[1] : mediaData;
      const actualMime = mimeType || "image/jpeg";
      const prompt = `You analyze field data-collection images. Return JSON with keys:
- "transcript": all visible text, signage, numbers transcribed verbatim (empty string if none)
- "extractedData": object of key-value pairs (names, dates, GPS, labels, context)
- "qualityFlags": array of {label, severity:"ok"|"warning"|"error"}
- "summary": concise analysis
- "confidence": number 0-1`;
      analysis = await gatewayJson([
        { role: "system", content: "You are a field data quality analyst. Return only valid JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${actualMime};base64,${base64Content}` } },
          ],
        },
      ]);
      if (analysis?.transcript) transcript = analysis.transcript;
    } else if (transcript) {
      // Audio/video: analyse the transcript text
      const prompt = `You analyze transcripts of field data-collection interviews/recordings.
TRANSCRIPT:
"""${transcript.slice(0, 8000)}"""

Return JSON with keys:
- "extractedData": object {speakerCount, languages, keyTopics, namesMentioned, durationNote}
- "qualityFlags": array of {label, severity:"ok"|"warning"|"error"} (flag coaching, script-reading, silence, off-topic)
- "summary": concise summary of what was said
- "confidence": number 0-1`;
      analysis = await gatewayJson([
        { role: "system", content: "You are a field data quality analyst. Return only valid JSON." },
        { role: "user", content: prompt },
      ]);
    }

    const result = {
      transcript,
      transcriptError,
      extractedData: analysis?.extractedData || {},
      qualityFlags: analysis?.qualityFlags || (transcriptError
        ? [{ label: `Transcription issue: ${transcriptError}`, severity: "warning" }]
        : []),
      summary: analysis?.summary || (transcript ? "Transcription complete." : "Analysis complete."),
      confidence: typeof analysis?.confidence === "number" ? analysis.confidence : (transcript ? 0.8 : 0.6),
      fallback: !analysis && !transcript,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) {
      const body = await err.text();
      return new Response(body, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: String(err), fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
