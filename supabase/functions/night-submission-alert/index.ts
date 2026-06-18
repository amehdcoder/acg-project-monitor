// Emails admins to follow up on an after-hours (night) form submission anomaly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { anomaly_id } = await req.json();
    if (!anomaly_id) {
      return new Response(JSON.stringify({ error: "anomaly_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: anomaly, error: aErr } = await supabase
      .from("submission_anomalies")
      .select("*")
      .eq("id", anomaly_id)
      .single();
    if (aErr || !anomaly) throw aErr || new Error("Anomaly not found");

    // Collect admin recipients
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "systems_admin"]);
    const adminIds = [...new Set((adminRoles || []).map((r: any) => r.user_id))];

    let recipients: string[] = [];
    if (adminIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", adminIds);
      recipients = (profs || []).map((p: any) => p.email).filter(Boolean);
    }
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No admin recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const password = Deno.env.get("HOSTINGER_SMTP_PASSWORD");
    if (!password) throw new Error("HOSTINGER_SMTP_PASSWORD is not configured");
    const client = new SMTPClient({
      connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: true, auth: { username: SMTP_USER, password } },
    });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#4338ca,#7c3aed);padding:20px 24px;color:#fff">
          <h2 style="margin:0;font-size:18px">🌙 After-Hours Submission Flagged</h2>
          <p style="margin:6px 0 0;font-size:13px;opacity:.9">Data quality follow-up required</p>
        </div>
        <div style="padding:22px 24px;color:#1e293b;font-size:14px;line-height:1.6">
          <p>A form submission was recorded during night hours (6:59&nbsp;PM&ndash;6:59&nbsp;AM Nigerian time). Please follow up with the data collector to understand why.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px">
            <tr><td style="padding:6px 0;color:#64748b;width:130px">Project</td><td style="padding:6px 0;font-weight:600">${anomaly.project_name || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Form</td><td style="padding:6px 0;font-weight:600">${anomaly.form_name || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Collector</td><td style="padding:6px 0;font-weight:600">${anomaly.collector_name || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Submitted</td><td style="padding:6px 0;font-weight:600;color:#b91c1c">${anomaly.local_time || "—"} (WAT)</td></tr>
          </table>
          <p style="margin-top:18px">Open the <strong>Feedback</strong> page in the app to record the reason once you have followed up.</p>
        </div>
        <div style="background:#f8fafc;padding:14px 24px;color:#94a3b8;font-size:12px">Amehnities &middot; Automated data-quality alert</div>
      </div>`;

    let sent = 0;
    for (const to of recipients) {
      try {
        await client.send({
          from: `${FROM_NAME} <${SMTP_USER}>`,
          to,
          subject: `🌙 After-Hours Submission — ${anomaly.form_name || "Form"} (${anomaly.collector_name || "User"})`,
          content: `An after-hours submission was flagged for ${anomaly.collector_name} on ${anomaly.form_name}. Open the Feedback page to follow up.`,
          html,
        });
        sent++;
      } catch (e) {
        console.error("send failed for", to, e);
      }
    }
    await client.close().catch(() => {});

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("night-submission-alert error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
