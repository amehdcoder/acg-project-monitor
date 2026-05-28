// Sends a branded password-reset email from info@amehnities.org via Hostinger SMTP.
// Uses Supabase admin API to generate a recovery link, then dispatches via SMTP.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { email, redirectTo } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Generate a recovery link without sending Supabase's default email.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectTo || "https://www.amehnities.org/reset-password" },
    });

    if (error) {
      // Don't leak whether the email exists — respond success either way.
      console.error("generateLink error:", error.message);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = renderBrandEmail({
      heading: "Reset your Amehnities password",
      intro:
        "We received a request to reset the password associated with this email address.",
      body: `
        <p>To set a new password, please click the secure button below. This link will expire shortly for your protection.</p>
        <p style="font-size:13px;color:#6b7280;">If you did not request a password reset, you can safely ignore this email — your account will remain unchanged.</p>
      `,
      ctaLabel: "Reset My Password",
      ctaUrl: actionLink,
      closing:
        "If the button does not work, copy and paste this link into your browser:<br/><span style=\"word-break:break-all;color:#0F766E;font-size:12px;\">" + actionLink + "</span>",
    });

    const { error: sendError } = await admin.functions.invoke("send-email-smtp", {
      body: {
        to: email,
        subject: "Reset your Amehnities password",
        html,
      },
    });
    if (sendError) throw sendError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-password-reset error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
