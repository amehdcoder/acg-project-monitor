// Per-user Google OAuth callback: Google redirects the browser here with
// ?code=&state=. We exchange the code for tokens, persist them in
// user_google_oauth_tokens, and return an HTML page that closes the popup
// (or redirects the user) so the SPA can refresh its connection status.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function htmlPage(status: "ok" | "error", message: string, returnTo: string) {
  const safeMsg = message.replace(/</g, "&lt;");
  const safeReturn = returnTo.replace(/"/g, "&quot;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Google connection</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b1220;color:#e5e7eb}
    .card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:24px 28px;max-width:420px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.4)}
    .ok{color:#34d399}.err{color:#f87171}
    button{margin-top:16px;background:#0d9488;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;font-weight:600}
  </style></head><body>
  <div class="card">
    <h2 class="${status === "ok" ? "ok" : "err"}">${status === "ok" ? "Google account connected" : "Connection failed"}</h2>
    <p>${safeMsg}</p>
    <button onclick="window.opener && window.opener.postMessage({type:'google-oauth',status:'${status}'},'*'); window.close(); if(${safeReturn ? "true" : "false"}) location.href='${safeReturn}';">Done</button>
  </div>
  <script>
    try { window.opener && window.opener.postMessage({type:'google-oauth',status:'${status}'},'*'); } catch(e){}
    setTimeout(function(){ try{ window.close(); }catch(e){} }, 1500);
  </script>
  </body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  let returnTo = "";
  let userId = "";
  try {
    if (state) {
      const decoded = atob(state);
      const [uid, _nonce, ret] = decoded.split("|");
      userId = uid;
      returnTo = ret ?? "";
    }
  } catch {}

  if (errorParam) {
    return new Response(htmlPage("error", `Google returned: ${errorParam}`, returnTo), {
      headers: { "Content-Type": "text/html" },
    });
  }
  if (!code || !userId) {
    return new Response(htmlPage("error", "Missing code or state.", returnTo), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!clientId || !clientSecret) {
    return new Response(
      htmlPage("error", "Google OAuth credentials are not configured on the server.", returnTo),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return new Response(
        htmlPage("error", `Token exchange failed: ${tokenData.error_description || tokenData.error || tokenRes.status}`, returnTo),
        { headers: { "Content-Type": "text/html" } },
      );
    }

    // Fetch user email
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userInfoRes.ok) {
        const info = await userInfoRes.json();
        googleEmail = info.email ?? null;
      }
    } catch {}

    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

    // Upsert via service role (callback can't carry user JWT)
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: upsertErr } = await admin
      .from("user_google_oauth_tokens")
      .upsert(
        {
          user_id: userId,
          provider: "google",
          access_token: tokenData.access_token,
          // Google only returns refresh_token on first consent — preserve old one on re-auth
          refresh_token: tokenData.refresh_token ?? undefined,
          scope: tokenData.scope ?? null,
          token_type: tokenData.token_type ?? "Bearer",
          expires_at: expiresAt,
          google_email: googleEmail,
        },
        { onConflict: "user_id,provider" },
      );

    if (upsertErr) {
      return new Response(htmlPage("error", `Could not save tokens: ${upsertErr.message}`, returnTo), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response(
      htmlPage("ok", googleEmail ? `Signed in as ${googleEmail}. You may close this window.` : "You may close this window.", returnTo),
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(htmlPage("error", msg, returnTo), {
      headers: { "Content-Type": "text/html" },
    });
  }
});
