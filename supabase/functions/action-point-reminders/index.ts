// Scheduled function: scans meeting action points and raises notifications
// as the due date approaches, on the due date, and once it is past due.
// Designed to be invoked daily by a cron schedule.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUE_SOON_THRESHOLD = 3;

function daysUntil(due: string): number {
  const d = new Date(due + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function stageFor(days: number): "approaching" | "due" | "overdue" | "none" {
  if (days < 0) return "overdue";
  if (days === 0) return "due";
  if (days <= DUE_SOON_THRESHOLD) return "approaching";
  return "none";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await supabase
      .from("meeting_action_points")
      .select("*")
      .not("status", "in", "(completed,deferred)");
    if (error) throw error;

    let notified = 0;
    for (const r of rows ?? []) {
      const days = daysUntil(r.due_date);
      const stage = stageFor(days);
      if (stage === "none") continue;
      if (r.last_reminder_stage === stage) continue; // already alerted for this stage

      let title = "";
      let message = "";
      let type = "info";
      if (stage === "approaching") {
        title = "⏳ Action point due soon";
        message = `"${r.action_point}" (${r.meeting_title}) is due on ${r.due_date} — ${days} day${days === 1 ? "" : "s"} remaining. Owner: ${r.responsible_person}.`;
        type = "warning";
      } else if (stage === "due") {
        title = "📌 Action point due today";
        message = `"${r.action_point}" (${r.meeting_title}) is due today (${r.due_date}). Owner: ${r.responsible_person}. Please confirm implementation.`;
        type = "warning";
      } else {
        title = "🚨 Action point overdue";
        message = `"${r.action_point}" (${r.meeting_title}) was due on ${r.due_date} and is now overdue. A documented reason for non-implementation is required. Owner: ${r.responsible_person}.`;
        type = "error";
      }

      const recipients = new Set<string>();
      if (r.created_by) recipients.add(r.created_by);
      if (r.responsible_user_id) recipients.add(r.responsible_user_id);

      for (const uid of recipients) {
        await supabase.from("notifications").insert({
          user_id: uid,
          title,
          message,
          type,
          category: "action_point",
        });
        notified++;
      }

      await supabase
        .from("meeting_action_points")
        .update({ last_reminder_stage: stage })
        .eq("id", r.id);
    }

    return new Response(JSON.stringify({ ok: true, scanned: rows?.length ?? 0, notified }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
