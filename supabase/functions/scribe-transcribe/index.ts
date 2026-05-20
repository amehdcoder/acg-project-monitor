// ElevenLabs Scribe v2 batch transcription proxy.
// Accepts multipart/form-data with `audio` file + optional `language` (ISO 639-3).
// Returns { text, confidence, words? }.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: "missing audio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const language = (form.get("language") as string | null) || "eng";
    const diarize = (form.get("diarize") as string | null) === "true";

    const up = new FormData();
    up.append("file", audio, "chunk.webm");
    up.append("model_id", "scribe_v2");
    up.append("language_code", language);
    if (diarize) up.append("diarize", "true");

    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: up,
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(
        JSON.stringify({ error: `ElevenLabs ${r.status}: ${errText}` }),
        { status: r.status === 429 || r.status === 402 ? r.status : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await r.json();
    // Estimate confidence from word-level scores when available.
    let conf = 0.85;
    if (Array.isArray(data?.words) && data.words.length) {
      const scores = data.words
        .map((w: any) => typeof w.confidence === "number" ? w.confidence : (typeof w.logprob === "number" ? Math.exp(w.logprob) : null))
        .filter((x: any) => typeof x === "number");
      if (scores.length) conf = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    }

    return new Response(
      JSON.stringify({ text: data?.text || "", confidence: conf, words: data?.words }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
