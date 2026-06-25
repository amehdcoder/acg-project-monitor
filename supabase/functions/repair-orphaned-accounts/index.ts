// Scans auth users for accounts that are missing a public.profiles row
// (orphans) and repairs them by creating an approved profile + default role.
// Anything that cannot be repaired is flagged in the audit log.
//
// Designed to run on a schedule (cron) AND to be callable on-demand by an
// Owner/Co-owner/admin from the UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "amehjoey1@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
  if (guard.response) return guard.response;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Page through every auth user.
    const authUsers: { id: string; email: string | null; user_metadata: any }[] = [];
    let page = 1;
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const batch = data?.users ?? [];
      authUsers.push(
        ...batch.map((u) => ({ id: u.id, email: u.email ?? null, user_metadata: u.user_metadata })),
      );
      if (batch.length < 1000) break;
      page += 1;
    }

    // Which of those have a profile?
    const { data: profiles } = await admin.from("profiles").select("user_id");
    const haveProfile = new Set((profiles ?? []).map((p: any) => p.user_id));

    const orphans = authUsers.filter((u) => !haveProfile.has(u.id));

    const repaired: string[] = [];
    const flagged: { email: string | null; error: string }[] = [];

    for (const u of orphans) {
      const email = (u.email ?? "").toLowerCase();
      const meta = u.user_metadata ?? {};
      const first = (meta.first_name ?? meta.given_name ?? "").toString().trim();
      const last = (meta.last_name ?? meta.family_name ?? "").toString().trim();
      const designation = (meta.designation ?? "data_collector").toString().trim() || "data_collector";

      // Skip if the email was intentionally deleted (tombstoned).
      const { data: tomb } = await admin
        .from("deleted_account_emails")
        .select("email")
        .ilike("email", email)
        .maybeSingle();
      if (tomb) continue;

      try {
        const { error: upErr } = await admin.from("profiles").upsert(
          {
            user_id: u.id,
            email,
            first_name: first,
            last_name: last,
            approval_status: "approved",
            designation,
            is_owner: email === OWNER_EMAIL,
          },
          { onConflict: "user_id" },
        );
        if (upErr) throw upErr;

        // Ensure a base role exists.
        await admin
          .from("user_roles")
          .upsert(
            { user_id: u.id, role: email === OWNER_EMAIL ? "super_admin" : "user" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );

        repaired.push(email);
        await admin.from("account_audit_log").insert({
          event_type: "orphan_repaired",
          target_user_id: u.id,
          target_email: email,
          success: true,
          details: { source: "repair-orphaned-accounts" },
        });
      } catch (e) {
        const msg = (e as Error).message;
        flagged.push({ email: u.email, error: msg });
        await admin.from("account_audit_log").insert({
          event_type: "orphan_flagged",
          target_user_id: u.id,
          target_email: email,
          success: false,
          details: { error: msg },
        });
      }
    }

    return new Response(
      JSON.stringify({
        scanned: authUsers.length,
        orphans: orphans.length,
        repaired: repaired.length,
        flagged: flagged.length,
        repaired_emails: repaired,
        flagged_emails: flagged,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("repair-orphaned-accounts error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
