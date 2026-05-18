// Returns whether the current user has a connected Google account, and the
// associated email. Also supports action=disconnect to revoke tokens.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? "status";

    if (action === "disconnect") {
      await supabase
        .from("user_google_oauth_tokens")
        .delete()
        .eq("user_id", userRes.user.id)
        .eq("provider", "google");
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("user_google_oauth_tokens")
      .select("google_email, expires_at, scope, updated_at")
      .eq("user_id", userRes.user.id)
      .eq("provider", "google")
      .maybeSingle();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        connected: !!data,
        google_email: data?.google_email ?? null,
        expires_at: data?.expires_at ?? null,
        scope: data?.scope ?? null,
        updated_at: data?.updated_at ?? null,
        oauth_configured: !!Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
