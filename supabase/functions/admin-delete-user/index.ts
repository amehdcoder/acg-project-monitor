// Permanently deletes a user account. OWNER ONLY.
//
// This is a hard, irreversible delete:
//   1. Verifies the caller is the Owner.
//   2. Refuses to delete the Owner account or the caller's own account.
//   3. Removes the user's profile + role rows (best-effort, in case FKs
//      are not all ON DELETE CASCADE).
//   4. Deletes the auth user via the service role. Once the auth user is
//      gone the person can no longer sign in or hold a session, and the
//      only way back into the app is a brand-new account (self sign-up or
//      Admin user creation).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "amehjoey1@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = userData.user;

    const admin = createClient(supabaseUrl, serviceKey);

    // --- Authorisation: OWNER ONLY ---
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_owner")
      .eq("user_id", caller.id)
      .maybeSingle();
    const isOwner = callerProfile?.is_owner === true || caller.email === OWNER_EMAIL;
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "Only the Owner can permanently delete accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string = String(body?.userId ?? "").trim();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetUserId === caller.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account here" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the target — never allow deleting an Owner account.
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_owner, email")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetProfile?.is_owner === true || targetProfile?.email === OWNER_EMAIL) {
      return new Response(JSON.stringify({ error: "The Owner account cannot be deleted" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Best-effort cleanup of user-owned rows that may not cascade.
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("user_id", targetUserId);

    // Hard delete the auth user. This invalidates all sessions and blocks
    // any future login until a fresh account is created for them.
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) {
      return new Response(JSON.stringify({ error: `Failed to delete account: ${delErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
