// Sends transactional emails from info@amehnities.org via Hostinger SMTP.
//
// Reliability hardening:
//   - Uses a hand-rolled SMTP-over-TLS client (../_shared/rawSmtp.ts) instead of
//     denomailer. On the Supabase edge runtime denomailer 1.6.0 throws an
//     UNCATCHABLE event-loop error during DATA mode ("invalid cmd" /
//     "connection not recoverable") that crashes the isolate, so every failure
//     surfaced to callers as an opaque non-2xx with no diagnosable reason.
//     The raw client turns every failure into a clear, catchable Error
//     (e.g. the exact SMTP reply such as "554 5.7.1 Disabled by user from hPanel").
//   - A fresh connection is opened per send and always closed afterwards.
//   - Each send is retried up to 3 times with exponential backoff to absorb
//     transient SMTP/network hiccups. Permanent SMTP rejections (5xx replies)
//     are NOT retried, since retrying cannot help and only delays the response.
import { sendMailRaw } from "../_shared/rawSmtp.ts";
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
const SEND_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A permanent SMTP rejection (5xx) won't be cured by retrying.
function isPermanent(msg: string): boolean {
  return /got: 5\d{2}\b/.test(msg) || /Disabled by user/i.test(msg);
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
        await sendMailRaw(
          { hostname: SMTP_HOST, port: SMTP_PORT, username: SMTP_USER, password, timeoutMs: SEND_TIMEOUT_MS },
          {
            from: `${FROM_NAME} <${SMTP_USER}>`,
            fromAddress: SMTP_USER,
            to: recipient,
            subject: String(subject),
            html: html ? String(html) : undefined,
            text: text ? String(text) : (html ? undefined : "Please view this email in an HTML-capable client."),
          },
        );
        return new Response(JSON.stringify({ success: true, attempts: attempt }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        lastError = e;
        const m = (e as Error).message;
        console.error(`send-email-smtp attempt ${attempt}/${MAX_ATTEMPTS} failed:`, m);
        if (isPermanent(m)) break; // don't retry a permanent rejection
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
        }
      }
    }

    throw new Error(
      `Email delivery failed: ${(lastError as Error)?.message ?? "unknown error"}`,
    );
  } catch (err) {
    console.error("send-email-smtp error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
