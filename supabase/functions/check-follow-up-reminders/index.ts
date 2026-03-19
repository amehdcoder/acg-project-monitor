import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Find all open cases with a next_follow_up_date that is today or past
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
        JSON.stringify({ message: "No cases due for follow-up", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let created = 0;
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
      const title = isOverdue
        ? `Overdue: ${c.name}`
        : `Follow-up Due: ${c.name}`;
      const message = isOverdue
        ? `Case "${c.name}" (${caseType?.label || "Unknown"}) is overdue by ${daysPast} day${daysPast !== 1 ? "s" : ""}. Please complete the follow-up visit.`
        : `Case "${c.name}" (${caseType?.label || "Unknown"}) is due for a follow-up visit today.`;

      // Collect all users who should be notified:
      // 1. Case owner
      // 2. Users assigned to forms linked to this case type (follow-up forms)
      const recipientIds = new Set<string>();
      recipientIds.add(c.owner_id);

      // Find forms that have case management settings for this case type
      const { data: relatedForms } = await supabase
        .from("forms")
        .select("id")
        .eq("project_id", c.project_id);

      if (relatedForms) {
        const formIds = relatedForms.map((f: any) => f.id);
        if (formIds.length > 0) {
          // Get users assigned to these forms
          const { data: formAssignments } = await supabase
            .from("user_form_assignments")
            .select("user_id")
            .in("form_id", formIds);

          if (formAssignments) {
            for (const fa of formAssignments) {
              recipientIds.add(fa.user_id);
            }
          }
        }
      }

      // Also add project-assigned users
      const { data: projectAssignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", c.project_id);

      if (projectAssignments) {
        for (const pa of projectAssignments) {
          recipientIds.add(pa.user_id);
        }
      }

      for (const userId of recipientIds) {
        // Check if we already sent a notification for this case today
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
        } else {
          created++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${dueCases.length} due cases, created ${created} notifications`,
        created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-follow-up-reminders:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
