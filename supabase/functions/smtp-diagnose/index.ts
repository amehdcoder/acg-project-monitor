// TEMPORARY diagnostic: attempts an SMTP send via the raw client and returns the real error.
import { sendMailRaw } from "../_shared/rawSmtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
  if (!password) {
    return new Response(JSON.stringify({ error: "no password secret" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let result: Record<string, unknown>;
  try {
    await sendMailRaw(
      { hostname: "smtp.hostinger.com", port: 465, username: "info@amehnities.org", password },
      {
        from: "The Amehnities Team <info@amehnities.org>",
        fromAddress: "info@amehnities.org",
        to: "diagnostic@amehnities.org",
        subject: "Amehnities raw SMTP diagnostic ✓",
        html: "<p>diag</p>",
        text: "diag",
      },
    );
    result = { ok: true };
  } catch (e) {
    result = { ok: false, error: (e as Error).message, name: (e as Error).name };
  }
  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
