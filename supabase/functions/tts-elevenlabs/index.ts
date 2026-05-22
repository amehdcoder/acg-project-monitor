// ElevenLabs TTS streaming proxy.
// POST { text, voiceId?, modelId?, languageCode? } -> audio/mpeg stream
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah
// Multilingual model — works for English + low-resource languages (Hausa,
// Yoruba, Igbo, Arabic, Hebrew, French, Spanish, Russian, Indonesian).
const DEFAULT_MODEL = "eleven_multilingual_v2";
const TURBO_MODEL = "eleven_turbo_v2_5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const text = String(body?.text || "").trim();
    if (!text) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (text.length > 5000) {
      return new Response(
        JSON.stringify({ error: "text exceeds 5000 chars" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voiceId = String(body?.voiceId || DEFAULT_VOICE);
    // For English we can use turbo (lower latency); for other locales use multilingual.
    const langCode = String(body?.languageCode || "en").toLowerCase().slice(0, 2);
    const modelId = String(body?.modelId || (langCode === "en" ? TURBO_MODEL : DEFAULT_MODEL));
    // Output format: default to 64 kbps MP3 (~50% smaller than 128 kbps, still
    // intelligible for speech). Caller may request opus_48000_64 etc.
    const allowedFormats = new Set([
      "mp3_44100_64", "mp3_44100_128", "mp3_22050_32",
      "opus_48000_32", "opus_48000_64", "opus_48000_96",
      "pcm_16000", "pcm_22050", "pcm_24000",
    ]);
    const requestedFormat = String(body?.format || "mp3_44100_64");
    const outputFormat = allowedFormats.has(requestedFormat) ? requestedFormat : "mp3_44100_64";
    // Allow SSML-lite passthrough (ElevenLabs honours <break time="…"/>).
    const enableSsmlParsing = body?.ssml === true;

    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const acceptHeader = outputFormat.startsWith("opus")
      ? "audio/ogg"
      : outputFormat.startsWith("pcm")
        ? "audio/wave"
        : "audio/mpeg";
    const responseMime = outputFormat.startsWith("opus")
      ? "audio/ogg; codecs=opus"
      : outputFormat.startsWith("pcm")
        ? "audio/wave"
        : "audio/mpeg";

    const elevenRes = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: acceptHeader,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        enable_ssml_parsing: enableSsmlParsing,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
          speed: 1.0,
        },
      }),
    });

    if (!elevenRes.ok || !elevenRes.body) {
      const errText = await elevenRes.text().catch(() => "");
      const longCool = elevenRes.status === 401 || elevenRes.status === 402 ||
                       elevenRes.status === 403 || elevenRes.status === 429;
      return new Response(
        JSON.stringify({
          fallback: true,
          upstreamStatus: elevenRes.status,
          cooldownMs: longCool ? 30 * 60 * 1000 : 60 * 1000,
          reason: `ElevenLabs ${elevenRes.status}: ${errText.slice(0, 300)}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(elevenRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": responseMime,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
