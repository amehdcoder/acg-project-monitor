// Sends a branded welcome email to a newly signed-up user via Hostinger SMTP.
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
    const { email, firstName, designationLabel } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const name = (firstName ?? "").trim() || "there";
    const role = designationLabel ? ` as <b>${designationLabel}</b>` : "";
    const html = renderBrandEmail({
      heading: `Welcome to Amehnities, ${name}!`,
      intro:
        "Thank you for joining the Amehnities community of public-health monitors, supervisors and researchers.",
      body: `
        <p>Your account has been created${role}. Our administrators are reviewing your registration and you will be notified the moment access is approved.</p>
        <p>Amehnities is built to make every household visit, every form, and every follow-up count — turning frontline observations into decisions that improve lives.</p>
        <p>While you wait for approval, you can already explore our public resources and our mission at <a href="https://www.amehnities.org" style="color:#0F766E;">amehnities.org</a>.</p>
        <p>If you ever need help, simply reply to this email — we read every message personally.</p>
      `,
      ctaLabel: "Visit Amehnities",
      ctaUrl: "https://www.amehnities.org",
      closing:
        "We are honoured to have you with us. Together, we are building healthier, better-served communities.",
    });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase.functions.invoke("send-email-smtp", {
      body: {
        to: email,
        subject: "Welcome to Amehnities",
        html,
      },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-welcome-email error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
