import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Designation required for each protected group (matched by group name).
const PROTECTED_REQUIREMENTS: Record<string, string> = {
  "HANDS Staff - Official": "hands_staff",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    // Identify the caller from their JWT.
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const callerId = userData.user.id;

    const { chat_group_id, user_id } = await req.json();
    if (!chat_group_id || !user_id) return json({ error: "bad request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // Caller must be admin, owner, or an admin of this group.
    const [{ data: isAdmin }, { data: isOwner }, { data: isGroupAdmin }] =
      await Promise.all([
        admin.rpc("is_admin", { _user_id: callerId }),
        admin.rpc("is_owner", { _user_id: callerId }),
        admin.rpc("is_chat_group_admin", {
          _user_id: callerId,
          _chat_group_id: chat_group_id,
        }),
      ]);

    if (!isAdmin && !isOwner && !isGroupAdmin) {
      return json({ allowed: false, reason: "Not authorized to manage this group." }, 403);
    }

    const { data: group } = await admin
      .from("chat_groups")
      .select("id, name, is_protected")
      .eq("id", chat_group_id)
      .single();
    if (!group) return json({ error: "group not found" }, 404);

    const { data: profile } = await admin
      .from("profiles")
      .select("designation, first_name, last_name, email, is_active")
      .eq("user_id", user_id)
      .single();
    if (!profile) return json({ error: "user not found" }, 404);

    const required = group.is_protected
      ? PROTECTED_REQUIREMENTS[group.name] ?? null
      : null;

    // Verify designation for protected groups; block any mismatch.
    if (required && String(profile.designation) !== required) {
      return json(
        {
          allowed: false,
          reason: `Only members with the "${required}" designation can join "${group.name}". This user is "${profile.designation}".`,
        },
        403,
      );
    }

    if (profile.is_active === false) {
      return json({ allowed: false, reason: "User account is inactive." }, 403);
    }

    // Validated — add the member (idempotent).
    const { error: insertErr } = await admin
      .from("chat_group_members")
      .upsert(
        { chat_group_id, user_id, role: "member", added_by: callerId },
        { onConflict: "chat_group_id,user_id", ignoreDuplicates: true },
      );
    if (insertErr) {
      return json({ allowed: false, reason: insertErr.message }, 400);
    }

    return json({ allowed: true });
  } catch (err: any) {
    console.error("validate-protected-membership error", err?.message);
    return json({ error: err?.message ?? "error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
