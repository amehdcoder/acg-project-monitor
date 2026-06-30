// TEMPORARY diagnostic: attempts an SMTP send and returns the real error.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

async function tryConfig(label: string, cfg: any, password: string) {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.hostinger.com",
      port: cfg.port,
      tls: cfg.tls,
      auth: { username: "info@amehnities.org", password },
    },
  });
  try {
    await client.send({
      from: "The Amehnities Team <info@amehnities.org>",
      to: "diagnostic@amehnities.org",
      subject: "diag",
      content: "diag",
      html: "<p>diag</p>",
    });
    await client.close();
    return { label, ok: true };
  } catch (e) {
    try { await client.close(); } catch (_) { /* ignore */ }
    return { label, ok: false, error: (e as Error).message, name: (e as Error).name };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
  if (!password) {
    return new Response(JSON.stringify({ error: "no password secret" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const results = [];
  results.push(await tryConfig("465-implicit-tls", { port: 465, tls: true }, password));
  results.push(await tryConfig("587-starttls", { port: 587, tls: false }, password));
  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
