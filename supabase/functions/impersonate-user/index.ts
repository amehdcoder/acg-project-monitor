import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the calling user's JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller using the anon client
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is a super_admin using the service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the target user_id from request body
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Don't allow impersonating yourself
    if (target_user_id === caller.id) {
      return new Response(
        JSON.stringify({ error: "Cannot impersonate yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetError } =
      await adminClient.auth.admin.getUserById(target_user_id);

    if (targetError || !targetUser?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user's profile for audit log
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", target_user_id)
      .maybeSingle();

    const { data: adminProfile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", caller.id)
      .maybeSingle();

    // Log the impersonation action in audit_logs
    await adminClient.from("audit_logs").insert({
      admin_user_id: caller.id,
      target_user_id: target_user_id,
      action: "impersonate_user",
      metadata: {
        admin_email: adminProfile?.email || caller.email,
        admin_name: adminProfile ? `${adminProfile.first_name} ${adminProfile.last_name}` : caller.email,
        target_email: targetProfile?.email || targetUser.user.email,
        target_name: targetProfile ? `${targetProfile.first_name} ${targetProfile.last_name}` : targetUser.user.email,
        timestamp: new Date().toISOString(),
      },
    });

    // Generate a magic link for the target user (creates a session)
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: targetUser.user.email!,
      });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({ error: "Failed to generate impersonation link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token hash from the generated link properties
    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      return new Response(
        JSON.stringify({ error: "Failed to generate session token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the OTP to get a real session
    const verifyClient = createClient(supabaseUrl, anonKey);
    const { data: sessionData, error: sessionError } =
      await verifyClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });

    if (sessionError || !sessionData.session) {
      return new Response(
        JSON.stringify({ error: "Failed to create impersonation session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        },
        user: {
          id: targetUser.user.id,
          email: targetUser.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Impersonation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
