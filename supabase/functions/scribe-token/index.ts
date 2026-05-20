// Mints a short-lived (≤15 min) realtime token for ElevenLabs Scribe v2 realtime.
// Client uses it with @elevenlabs/react `useScribe.connect({ token })` — the
// API key never leaves the server. Returns { token, expires_in }.
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

    const r = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      { method: "POST", headers: { "xi-api-key": apiKey } },
    );

    if (!r.ok) {
      const errText = await r.text();
      return new Response(
        JSON.stringify({ error: `ElevenLabs ${r.status}: ${errText}` }),
        { status: r.status === 429 || r.status === 402 ? r.status : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await r.json();
    return new Response(
      JSON.stringify({ token: data?.token, expires_in: 900 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
