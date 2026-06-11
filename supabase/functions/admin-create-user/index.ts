// Allows the Owner or an admin (super_admin / systems_admin) to create user
// accounts directly. For each account we:
//   1. Verify the caller is authorised.
//   2. Create the auth user (email pre-confirmed) with a generated password.
//   3. Approve the profile and set the chosen designation.
//   4. Email the new user their credentials, app link and Owner contact.
//   5. Report back per-account status incl. whether the email was delivered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://www.amehnities.org";
const OWNER_EMAIL = "amehjoey1@gmail.com";

interface NewUser {
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
  designation_label?: string;
}

interface RowResult {
  email: string;
  name: string;
  status: "created" | "failed";
  account_created: boolean;
  email_sent: boolean;
  password?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Authenticate the caller ---
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

    // --- Authorisation: Owner OR super_admin / systems_admin ---
    const [{ data: profile }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("is_owner").eq("user_id", caller.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", caller.id),
    ]);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const authorised =
      profile?.is_owner === true || roleSet.has("super_admin") || roleSet.has("systems_admin");
    if (!authorised) {
      return new Response(JSON.stringify({ error: "Not authorised to create accounts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const users: NewUser[] = Array.isArray(body?.users) ? body.users : [];
    if (users.length === 0) {
      return new Response(JSON.stringify({ error: "No users provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (users.length > 500) {
      return new Response(JSON.stringify({ error: "Too many rows (max 500)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: RowResult[] = [];

    for (const u of users) {
      const first = (u.first_name ?? "").trim();
      const last = (u.last_name ?? "").trim();
      const email = (u.email ?? "").trim().toLowerCase();
      const designation = (u.designation ?? "").trim() || "data_collector";
      const designationLabel = (u.designation_label ?? designation).trim();
      const name = `${first} ${last}`.trim();

      if (!first || !email || !EMAIL_RE.test(email)) {
        results.push({
          email, name, status: "failed", account_created: false, email_sent: false,
          error: !EMAIL_RE.test(email) ? "Invalid email address" : "First name is required",
        });
        continue;
      }

      const password = generatePassword();

      // Create the auth user (email pre-confirmed so they can log in immediately).
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: first,
          last_name: last,
          designation,
        },
      });

      if (createErr || !created?.user) {
        results.push({
          email, name, status: "failed", account_created: false, email_sent: false,
          error: createErr?.message ?? "Could not create account",
        });
        continue;
      }

      // Approve the profile (the signup trigger created it as pending).
      await admin
        .from("profiles")
        .update({ approval_status: "approved", designation })
        .eq("user_id", created.user.id);

      // Build and send the credentials email.
      let emailSent = false;
      let emailError: string | undefined;
      let emailHtml = "";
      const emailSubject = "Your Amehnities account is ready";
      try {
        const html = renderBrandEmail({
          heading: `Welcome to Amehnities, ${first}!`,
          intro:
            "An account has been created for you on the Amehnities public-health monitoring platform. You can sign in right away using the credentials below.",
          body: `
            <table cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-size:14px;margin:8px 0 16px;width:100%;">
              <tr><td style="color:#6b7280;width:40%;">Name</td><td style="font-weight:600;color:#111827;">${name}</td></tr>
              <tr><td style="color:#6b7280;">Designation</td><td style="font-weight:600;color:#111827;">${designationLabel}</td></tr>
              <tr><td style="color:#6b7280;">Username</td><td style="font-weight:600;color:#111827;">${email}</td></tr>
              <tr><td style="color:#6b7280;">Temporary password</td><td style="font-weight:700;color:#0F766E;letter-spacing:.5px;">${password}</td></tr>
            </table>
            <p style="font-size:13px;color:#6b7280;">For your security, please sign in and change your password at your earliest convenience.</p>
            <p style="margin-top:16px;">If you have any questions, you can reach the Owner directly:</p>
            <table cellpadding="6" cellspacing="0" style="font-size:14px;margin:4px 0 8px;">
              <tr><td style="color:#6b7280;">Owner</td><td style="font-weight:600;color:#111827;">Ameh Ojoh Joseph</td></tr>
              <tr><td style="color:#6b7280;">Email</td><td><a href="mailto:${OWNER_EMAIL}" style="color:#0F766E;font-weight:600;">${OWNER_EMAIL}</a></td></tr>
            </table>
          `,
          ctaLabel: "Open Amehnities",
          ctaUrl: APP_URL,
          closing:
            "We are delighted to have you on board. Together, we are building healthier, better-served communities.",
        });

        const { error: mailErr } = await admin.functions.invoke("send-email-smtp", {
          body: { to: email, subject: "Your Amehnities account is ready", html },
        });
        if (mailErr) throw mailErr;
        emailSent = true;
      } catch (e) {
        emailError = (e as Error).message;
      }

      results.push({
        email, name, status: "created", account_created: true,
        email_sent: emailSent, password,
        error: emailError ? `Account created, but email failed: ${emailError}` : undefined,
      });
    }

    // Notify the creator of the overall outcome.
    const okCount = results.filter((r) => r.account_created).length;
    const mailCount = results.filter((r) => r.email_sent).length;
    const failCount = results.length - okCount;
    try {
      await admin.from("notifications").insert({
        user_id: caller.id,
        title: "👥 Account creation report",
        message:
          `${okCount} account(s) created (${mailCount} email(s) delivered)` +
          (failCount > 0 ? `, ${failCount} failed.` : "."),
        type: failCount > 0 ? "warning" : "success",
        category: "registration",
      });
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
