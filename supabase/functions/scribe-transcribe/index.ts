// ElevenLabs Scribe v2 batch transcription proxy.
// Accepts multipart/form-data:
//   - audio          (File) — required
//   - language       (string, ISO 639-3) — default "eng"
//   - diarize        ("true"|"false") — default false
//   - biased_keywords (string, comma-separated) — Scribe keyword biasing
//   - numeric_only   ("true"|"false") — if true, post-process to digits only
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
    const numericOnly = (form.get("numeric_only") as string | null) === "true";
    const biasedRaw = (form.get("biased_keywords") as string | null) || "";
    const biasedKeywords = biasedRaw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 64); // Scribe v2 hard cap

    const up = new FormData();
    up.append("file", audio, "chunk.webm");
    up.append("model_id", "scribe_v2");
    up.append("language_code", language);
    if (diarize) up.append("diarize", "true");
    if (biasedKeywords.length) {
      // Scribe v2 expects a JSON-encoded array on the `biased_keywords` field.
      up.append("biased_keywords", JSON.stringify(biasedKeywords));
    }

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
    let text: string = data?.text || "";

    // Numeric-only post-process: keep digits, decimal point, leading minus.
    // Improves integer/decimal field accuracy where Scribe sometimes returns
    // "twenty five" instead of "25" even with biasing.
    if (numericOnly && text) {
      const m = text.replace(/[, ]/g, "").match(/-?\d+(?:\.\d+)?/);
      if (m) text = m[0];
    }

    // Estimate confidence from word-level scores when available.
    let conf = 0.85;
    if (Array.isArray(data?.words) && data.words.length) {
      const scores = data.words
        .map((w: any) => typeof w.confidence === "number" ? w.confidence : (typeof w.logprob === "number" ? Math.exp(w.logprob) : null))
        .filter((x: any) => typeof x === "number");
      if (scores.length) conf = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    }

    return new Response(
      JSON.stringify({ text, confidence: conf, words: data?.words }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
