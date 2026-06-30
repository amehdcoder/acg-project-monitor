// Sends transactional emails from info@amehnities.org via Hostinger SMTP.
//
// Reliability hardening:
//   - A fresh SMTP connection is opened per send and always closed afterwards.
//     (A cached/singleton client becomes unusable once a connection drops or a
//     send errors, which silently failed every subsequent email in a batch.)
//   - Each send is retried up to 3 times with exponential backoff to absorb
//     transient SMTP/network hiccups.
//   - A hard timeout prevents a stuck connection from hanging the request.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMTP_HOST = "smtp.hostinger.com";
const SMTP_PORT = 465;
const SMTP_USER = "info@amehnities.org";
const FROM_NAME = "The Amehnities Team";
const SEND_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`SMTP send timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function sendOnce(
  password: string,
  msg: { to: string; subject: string; html?: string; text?: string },
): Promise<void> {
  // Fresh client every attempt so a dropped connection never poisons the next send.
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: true,
      auth: { username: SMTP_USER, password },
    },
  });
  try {
    await withTimeout(
      client.send({
        from: `${FROM_NAME} <${SMTP_USER}>`,
        to: msg.to,
        subject: msg.subject,
        content: msg.text || "Please view this email in an HTML-capable client.",
        html: msg.html,
      }),
      SEND_TIMEOUT_MS,
    );
  } finally {
    try { await client.close(); } catch (_) { /* ignore close errors */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: true });
  if (guard.response) return guard.response;
  try {
    const body = await req.json();
    const { to, subject, html, text } = body ?? {};
    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html|text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recipient = String(to).trim();
    if (!EMAIL_RE.test(recipient)) {
      return new Response(
        JSON.stringify({ error: `Invalid recipient email address: ${recipient}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
    if (!password) throw new Error("HOSTINGER_SMTP_PASSWORD is not configured");

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await sendOnce(password, { to: recipient, subject, html, text });
        return new Response(JSON.stringify({ success: true, attempts: attempt }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        lastError = e;
        console.error(`send-email-smtp attempt ${attempt}/${MAX_ATTEMPTS} failed:`, (e as Error).message);
        if (attempt < MAX_ATTEMPTS) {
          // Exponential backoff: 0.8s, 1.6s.
          await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
        }
      }
    }

    throw new Error(
      `Email delivery failed after ${MAX_ATTEMPTS} attempts: ${(lastError as Error)?.message ?? "unknown error"}`,
    );
  } catch (err) {
    console.error("send-email-smtp error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
