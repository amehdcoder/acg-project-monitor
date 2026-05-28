import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/amehnitiesEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayStr = now.toISOString();

    const { data: dueCases, error: casesErr } = await supabase
      .from("cases")
      .select(
        "id, name, owner_id, next_follow_up_date, case_type_id, project_id, case_types(label, follow_up_schedule)"
      )
      .eq("status", "open")
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", todayStr);

    if (casesErr) {
      console.error("Error fetching due cases:", casesErr);
      return new Response(JSON.stringify({ error: casesErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueCases || dueCases.length === 0) {
      return new Response(
        JSON.stringify({ message: "No cases due for follow-up", created: 0, emailed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let created = 0;
    let emailed = 0;
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    for (const c of dueCases) {
      const caseType = c.case_types as any;
      const schedule = caseType?.follow_up_schedule as any;
      const graceDays = schedule?.gracePeriodDays ?? 0;

      const dueDate = new Date(c.next_follow_up_date!);
      const diffMs = now.getTime() - dueDate.getTime();
      const daysPast = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const isOverdue = daysPast > graceDays;

      const type = isOverdue ? "warning" : "info";
      const title = isOverdue ? `Overdue: ${c.name}` : `Follow-up Due: ${c.name}`;
      const message = isOverdue
        ? `Case "${c.name}" (${caseType?.label || "Unknown"}) is overdue by ${daysPast} day${daysPast !== 1 ? "s" : ""}. Please complete the follow-up visit.`
        : `Case "${c.name}" (${caseType?.label || "Unknown"}) is due for a follow-up visit today.`;

      const recipientIds = new Set<string>();
      if (c.owner_id) recipientIds.add(c.owner_id);

      const { data: relatedForms } = await supabase
        .from("forms")
        .select("id")
        .eq("project_id", c.project_id);

      if (relatedForms?.length) {
        const formIds = relatedForms.map((f: any) => f.id);
        const { data: formAssignments } = await supabase
          .from("user_form_assignments")
          .select("user_id")
          .in("form_id", formIds);
        for (const fa of formAssignments ?? []) recipientIds.add(fa.user_id);
      }

      const { data: projectAssignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", c.project_id);
      for (const pa of projectAssignments ?? []) recipientIds.add(pa.user_id);

      for (const userId of recipientIds) {
        // Skip duplicate notifications for the same case + day.
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("category", "follow_up_reminder")
          .eq("related_id", c.id)
          .gte("created_at", todayStart.toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: insertErr } = await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            type,
            title,
            message,
            category: "follow_up_reminder",
            related_id: c.id,
          });

        if (insertErr) {
          console.error(`Failed to create notification for case ${c.id}, user ${userId}:`, insertErr);
          continue;
        }
        created++;

        // Send branded reminder email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, notification_preferences")
          .eq("user_id", userId)
          .maybeSingle();

        const prefs = (profile?.notification_preferences ?? {}) as any;
        const emailOptIn = prefs?.email !== false; // default on
        if (!profile?.email || !emailOptIn) continue;

        const firstName = profile.first_name?.trim() || "there";
        const html = renderBrandEmail({
          heading: isOverdue
            ? `Reminder: "${c.name}" follow-up is overdue`
            : `Follow-up due today: "${c.name}"`,
          intro: `Hello ${firstName}, this is a friendly reminder from the Amehnities case-management system.`,
          body: `
            <p>${message}</p>
            <p><b>Case:</b> ${c.name}<br/>
               <b>Type:</b> ${caseType?.label || "Case"}<br/>
               <b>Scheduled date:</b> ${new Date(c.next_follow_up_date!).toLocaleDateString()}</p>
            <p>Please open Amehnities and complete the follow-up form linked to this case as soon as possible. Timely follow-ups protect the people who depend on our work.</p>
          `,
          ctaLabel: "Open Amehnities",
          ctaUrl: "https://www.amehnities.org",
          closing:
            "Thank you for the diligence and care you bring to every visit.",
        });

        try {
          await supabase.functions.invoke("send-email-smtp", {
            body: {
              to: profile.email,
              subject: isOverdue ? `Overdue follow-up: ${c.name}` : `Follow-up due today: ${c.name}`,
              html,
            },
          });
          emailed++;
        } catch (e) {
          console.error("Failed to email reminder:", e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${dueCases.length} due cases, created ${created} notifications, emailed ${emailed}`,
        created,
        emailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-follow-up-reminders:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
