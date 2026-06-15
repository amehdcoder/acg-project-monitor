// Processes the account-creation retry queue. Picks pending rows that are due
// (next_retry_at <= now), attempts to create the account, and on transient
// failure reschedules with exponential backoff until max_attempts is reached.
//
// Runs on a schedule (cron) and can also be invoked on demand by an
// Owner/Co-owner/admin ("Retry now" button). Every outcome is written to
// account_audit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://www.amehnities.org";
const OWNER_EMAIL = "amehjoey1@gmail.com";

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Optional: limit to a single queue id when invoked from "Retry now".
    const body = await req.json().catch(() => ({}));
    const onlyId: string | undefined = body?.id;
    const limit = Math.min(Number(body?.limit ?? 25), 100);

    let query = admin
      .from("account_creation_retry_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(limit);
    if (onlyId) query = admin.from("account_creation_retry_queue").select("*").eq("id", onlyId);

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: { email: string; status: string; error?: string }[] = [];

    for (const row of rows ?? []) {
      const email = (row.email ?? "").trim().toLowerCase();
      const first = (row.first_name ?? "").trim();
      const last = (row.last_name ?? "").trim();
      const designation = (row.designation ?? "data_collector").trim() || "data_collector";
      const designationLabel = (row.designation_label ?? designation).trim();
      const name = `${first} ${last}`.trim();

      // Mark processing.
      await admin
        .from("account_creation_retry_queue")
        .update({ status: "processing" })
        .eq("id", row.id);

      try {
        // Clear any tombstone so the signup trigger doesn't skip the profile.
        await admin.from("deleted_account_emails").delete().ilike("email", email);

        const password = generatePassword();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name: first, last_name: last, designation },
        });
        if (createErr || !created?.user) throw new Error(createErr?.message ?? "Could not create account");

        await admin.from("profiles").upsert(
          {
            user_id: created.user.id,
            email,
            first_name: first,
            last_name: last,
            approval_status: "approved",
            designation,
            is_owner: email === OWNER_EMAIL,
          },
          { onConflict: "user_id" },
        );

        // Best-effort credentials email.
        let emailSent = false;
        try {
          const html = renderBrandEmail({
            heading: `Welcome to Amehnities, ${first}!`,
            intro:
              "An account has been created for you on the Amehnities public-health monitoring platform.",
            body: `
              <table cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-size:14px;margin:8px 0 16px;width:100%;">
                <tr><td style="color:#6b7280;">Username</td><td style="font-weight:600;color:#111827;">${email}</td></tr>
                <tr><td style="color:#6b7280;">Temporary password</td><td style="font-weight:700;color:#0F766E;">${password}</td></tr>
              </table>
              <p style="font-size:13px;color:#6b7280;">Please sign in and change your password.</p>`,
            ctaLabel: "Open Amehnities",
            ctaUrl: APP_URL,
            closing: "We are delighted to have you on board.",
          });
          const { error: mailErr } = await admin.functions.invoke("send-email-smtp", {
            body: { to: email, subject: "Your Amehnities account is ready", html },
          });
          emailSent = !mailErr;
        } catch (_) { /* non-fatal */ }

        await admin
          .from("account_creation_retry_queue")
          .update({ status: "succeeded", attempts: (row.attempts ?? 0) + 1, last_error: null })
          .eq("id", row.id);

        await admin.from("account_audit_log").insert({
          event_type: "retry_succeeded",
          actor_id: row.requested_by,
          target_user_id: created.user.id,
          target_email: email,
          success: true,
          details: { attempts: (row.attempts ?? 0) + 1, email_sent: emailSent },
        });
        results.push({ email, status: "succeeded" });
      } catch (e) {
        const msg = (e as Error).message;
        const attempts = (row.attempts ?? 0) + 1;
        const maxAttempts = row.max_attempts ?? 5;
        const abandoned = attempts >= maxAttempts;
        // Exponential backoff: 2^attempts minutes (capped at 6h).
        const backoffMin = Math.min(Math.pow(2, attempts), 360);
        const nextRetry = new Date(Date.now() + backoffMin * 60_000).toISOString();

        await admin
          .from("account_creation_retry_queue")
          .update({
            status: abandoned ? "abandoned" : "pending",
            attempts,
            last_error: msg,
            next_retry_at: nextRetry,
          })
          .eq("id", row.id);

        await admin.from("account_audit_log").insert({
          event_type: "retry_failed",
          actor_id: row.requested_by,
          target_email: email,
          success: false,
          details: { attempts, abandoned, error: msg, next_retry_at: nextRetry },
        });
        results.push({ email, status: abandoned ? "abandoned" : "rescheduled", error: msg });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("account-retry-worker error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
