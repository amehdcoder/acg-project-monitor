// Compiles a professional monthly summary of all platform activity and emails
// it to the owner (amehjoey1@gmail.com). Triggered by a monthly cron job.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY = "#0F766E";
const ACCENT = "#B45309";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const SITE_URL = "https://www.amehnities.org";
const OWNER_EMAIL = "amehjoey1@gmail.com";

async function countSince(
  supabase: any,
  table: string,
  column: string,
  sinceIso: string,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(column, sinceIso);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Aggregate platform-wide activity over the last 30 days.
    const [
      submissions,
      newUsers,
      newProjects,
      newForms,
      projectAssignments,
      formAssignments,
      cases,
      notifications,
      chatMessages,
      attendance,
      activeUsers,
    ] = await Promise.all([
      countSince(supabase, "form_submissions", "created_at", sinceIso),
      countSince(supabase, "profiles", "created_at", sinceIso),
      countSince(supabase, "projects", "created_at", sinceIso),
      countSince(supabase, "forms", "created_at", sinceIso),
      countSince(supabase, "user_project_assignments", "assigned_at", sinceIso),
      countSince(supabase, "user_form_assignments", "assigned_at", sinceIso),
      countSince(supabase, "cases", "created_at", sinceIso),
      countSince(supabase, "notifications", "created_at", sinceIso),
      countSince(supabase, "chat_messages", "created_at", sinceIso),
      countSince(supabase, "attendance_records", "created_at", sinceIso),
      countSince(supabase, "app_usage_tracking", "created_at", sinceIso),
    ]);

    // Total registered users (all time) for context.
    let totalUsers: number | null = null;
    try {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      totalUsers = count ?? 0;
    } catch {
      totalUsers = null;
    }

    const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());
    const monthLabel = since.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) +
      " to " + now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const rows: { label: string; value: number | null }[] = [
      { label: "Form submissions", value: submissions },
      { label: "New users registered", value: newUsers },
      { label: "Total registered users", value: totalUsers },
      { label: "New projects created", value: newProjects },
      { label: "New forms created", value: newForms },
      { label: "Project assignments", value: projectAssignments },
      { label: "Form assignments", value: formAssignments },
      { label: "Cases logged", value: cases },
      { label: "Attendance records", value: attendance },
      { label: "Chat messages", value: chatMessages },
      { label: "Notifications sent", value: notifications },
      { label: "App usage events", value: activeUsers },
    ];

    const tableRows = rows
      .map(
        (r, i) => `<tr style="background:${i % 2 ? "#f9fafb" : "#ffffff"};">
          <td style="padding:10px 16px;font-size:14px;color:${TEXT};border-bottom:1px solid #eef2f5;">${r.label}</td>
          <td style="padding:10px 16px;font-size:15px;font-weight:700;color:${PRIMARY};text-align:right;border-bottom:1px solid #eef2f5;">${fmt(r.value)}</td>
        </tr>`,
      )
      .join("");

    const subject = `Amehnities — Monthly Activity Summary (${now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`;

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(90deg, ${PRIMARY}, ${ACCENT});padding:20px 24px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">Amehnities</div>
          <div style="font-size:12px;opacity:.9;">Monthly Activity Summary</div>
        </td></tr>
        <tr><td style="padding:26px 28px 6px;">
          <h1 style="margin:0 0 6px;font-size:21px;color:${TEXT};">Platform activity report</h1>
          <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.5;">Reporting period: ${monthLabel}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef2f5;border-radius:10px;overflow:hidden;">
            ${tableRows}
          </table>
        </td></tr>
        <tr><td align="left" style="padding:18px 28px 24px;">
          <a href="${SITE_URL}" style="background:${PRIMARY};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;">View full dashboard</a>
        </td></tr>
        <tr><td style="padding:0 28px 20px;font-size:13px;color:${MUTED};line-height:1.6;">
          This automated summary covers all activity recorded across the platform over the last 30 days.
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 24px;font-size:11px;color:${MUTED};text-align:center;border-top:1px solid #e5e7eb;">
          &copy; ${now.getFullYear()} Amehnities &middot; <a href="${SITE_URL}" style="color:${MUTED};">${SITE_URL.replace("https://", "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const { error } = await supabase.functions.invoke("send-email-smtp", {
      body: { to: OWNER_EMAIL, subject, html, text: subject },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("monthly-activity-summary error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
