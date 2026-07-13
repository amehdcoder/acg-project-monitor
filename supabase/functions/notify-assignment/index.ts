// Sends a professional notification email to a user when they are assigned
// to a new project or form(s). Delegates actual delivery to send-email-smtp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardRequest } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Escapes user-supplied strings before interpolating into the HTML email body
// to prevent HTML/content injection.
function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PRIMARY = "#0F766E";
const ACCENT = "#B45309";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const SITE_URL = "https://www.amehnities.org";

// Notifications only apply to assignments made on/after this date.
const START_DATE = new Date("2026-06-22T00:00:00Z");

function renderEmail(opts: {
  firstName?: string;
  kind: "project" | "form";
  items: string[];
}): { subject: string; html: string } {
  const { firstName, kind, items } = opts;
  const greeting = firstName ? `Dear ${escapeHtml(firstName)},` : "Hello,";
  const label = kind === "project" ? "project" : "form";
  const plural = items.length > 1 ? `${label}s` : label;
  const heading =
    kind === "project"
      ? `You've been assigned to a new ${plural}`
      : `New ${plural} assigned to you`;
  const list = items
    .map(
      (i) =>
        `<li style="margin:0 0 6px;padding:0;font-size:15px;color:${TEXT};">${escapeHtml(i)}</li>`,
    )
    .join("");

  const intro =
    kind === "project"
      ? `You now have access to the following ${plural} on the Amehnities platform. You can begin working with the associated forms and activities right away.`
      : `The following ${plural} ${items.length > 1 ? "have" : "has"} been assigned to you on the Amehnities platform and ${items.length > 1 ? "are" : "is"} now available in your account.`;

  const subject =
    kind === "project"
      ? `You've been assigned to a new project on Amehnities`
      : `New form assignment on Amehnities`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg, ${PRIMARY}, ${ACCENT});padding:18px 24px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">Amehnities</div>
          <div style="font-size:12px;opacity:.9;">Public Health Monitoring &amp; Field Intelligence</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 8px;font-size:21px;color:${TEXT};">${heading}</h1>
          <p style="margin:0 0 14px;font-size:15px;color:${MUTED};line-height:1.5;">${greeting}</p>
          <p style="margin:0 0 14px;font-size:15px;color:${TEXT};line-height:1.6;">${intro}</p>
          <ul style="margin:0 0 16px;padding:0 0 0 20px;">${list}</ul>
          <p style="margin:0 0 8px;font-size:15px;color:${TEXT};line-height:1.6;">
            Please sign in to your account to get started.
          </p>
        </td></tr>
        <tr><td align="left" style="padding:4px 28px 24px;">
          <a href="${SITE_URL}" style="background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;">Open Amehnities</a>
        </td></tr>
        <tr><td style="padding:4px 28px 20px;font-size:14px;color:${TEXT};line-height:1.6;">
          Thank you for the important work you do.<br/>
          <span style="color:${MUTED};">— The Amehnities Team</span>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 24px;font-size:11px;color:${MUTED};text-align:center;border-top:1px solid #e5e7eb;">
          &copy; ${new Date().getFullYear()} Amehnities &middot; <a href="${SITE_URL}" style="color:${MUTED};">${SITE_URL.replace("https://", "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { email, firstName, kind, items } = body ?? {};

    if (!email || !kind || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, kind, items[]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (kind !== "project" && kind !== "form") {
      return new Response(
        JSON.stringify({ error: "kind must be 'project' or 'form'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Only notify for assignments from the launch date onward.
    if (Date.now() < START_DATE.getTime()) {
      return new Response(JSON.stringify({ skipped: "before_start_date" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, html } = renderEmail({ firstName, kind, items });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.functions.invoke("send-email-smtp", {
      body: { to: email, subject, html, text: `${subject}: ${items.join(", ")}` },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-assignment error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
