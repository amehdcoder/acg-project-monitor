// Pre-authentication helpers. These used to be anonymous-callable SECURITY
// DEFINER RPCs; they now run here with the service role so no signed-out
// database execute privilege is required.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = str(body.action, 40);
  const email = str(body.email, 254)?.toLowerCase() ?? null;

  if (action === "is_email_deleted") {
    if (!email) return json({ deleted: false });
    const { data, error } = await admin.rpc("is_email_deleted", { _email: email });
    if (error) return json({ deleted: false });
    return json({ deleted: Boolean(data) });
  }

  if (action === "record_inactive_login_attempt") {
    if (!email) return json({ ok: true });
    const attemptedUserId = str(body.attempted_user_id, 64);
    const { error } = await admin.rpc("record_inactive_login_attempt", {
      _email: email,
      _reason: str(body.reason, 200),
      _mode: str(body.mode, 40),
      _attempted_user_id: attemptedUserId,
      _user_agent: str(body.user_agent, 400),
      _metadata: (body.metadata && typeof body.metadata === "object" ? body.metadata : {}) as Record<string, unknown>,
      ...(str(body.created_at, 40) ? { _created_at: str(body.created_at, 40) } : {}),
    } as Record<string, unknown>);
    if (error) return json({ ok: false, error: "Could not record attempt" }, 200);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
