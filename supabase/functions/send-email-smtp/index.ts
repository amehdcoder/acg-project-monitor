// Sends transactional emails from info@amehnities.org via Hostinger SMTP.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMTP_HOST = "smtp.hostinger.com";
const SMTP_PORT = 465;
const SMTP_USER = "info@amehnities.org";
const FROM_NAME = "The Amehnities Team";

let cachedClient: SMTPClient | null = null;
function getClient(): SMTPClient {
  if (cachedClient) return cachedClient;
  const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
  if (!password) throw new Error("HOSTINGER_SMTP_PASSWORD is not configured");
  cachedClient = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: true,
      auth: { username: SMTP_USER, password },
    },
  });
  return cachedClient;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { to, subject, html, text } = body ?? {};
    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html|text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const client = getClient();
    await client.send({
      from: `${FROM_NAME} <${SMTP_USER}>`,
      to,
      subject,
      content: text || "Please view this email in an HTML-capable client.",
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email-smtp error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
