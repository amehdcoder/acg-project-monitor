import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active targets
    const { data: targets, error: targetsErr } = await supabase
      .from("form_daily_targets")
      .select("user_id, form_id, daily_target")
      .eq("is_active", true);

    if (targetsErr) throw targetsErr;
    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ message: "No active targets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get today's date boundaries (WAT = UTC+1)
    const now = new Date();
    const watOffset = 1; // Nigeria is UTC+1
    const watNow = new Date(now.getTime() + watOffset * 60 * 60 * 1000);
    const todayStr = watNow.toISOString().split("T")[0];
    const todayStart = `${todayStr}T00:00:00+01:00`;
    const todayEnd = `${todayStr}T23:59:59+01:00`;

    // Get unique user-form pairs
    const userFormPairs = targets.map((t: any) => ({
      userId: t.user_id,
      formId: t.form_id,
      dailyTarget: t.daily_target,
    }));

    // Get all form IDs and user IDs
    const formIds = [...new Set(userFormPairs.map((p: any) => p.formId))];
    const userIds = [...new Set(userFormPairs.map((p: any) => p.userId))];

    // Get today's submissions for these users and forms
    const { data: submissions } = await supabase
      .from("form_submissions")
      .select("user_id, form_id")
      .in("user_id", userIds)
      .in("form_id", formIds)
      .eq("status", "sent")
      .gte("submitted_at", todayStart)
      .lte("submitted_at", todayEnd);

    // Count submissions per user-form
    const countMap: Record<string, number> = {};
    (submissions || []).forEach((s: any) => {
      const key = `${s.user_id}:${s.form_id}`;
      countMap[key] = (countMap[key] || 0) + 1;
    });

    // Get form names
    const { data: forms } = await supabase
      .from("forms")
      .select("id, name")
      .in("id", formIds);

    const formNameMap: Record<string, string> = {};
    (forms || []).forEach((f: any) => {
      formNameMap[f.id] = f.name;
    });

    // Find users below 50% and create notifications
    const notifications: any[] = [];
    const notifiedUsers = new Set<string>();

    for (const pair of userFormPairs) {
      const key = `${pair.userId}:${pair.formId}`;
      const count = countMap[key] || 0;
      const percent = pair.dailyTarget > 0 ? (count / pair.dailyTarget) * 100 : 100;

      if (percent < 50) {
        const formName = formNameMap[pair.formId] || "a form";
        const remaining = pair.dailyTarget - count;

        // Only one notification per user (aggregate if multiple forms behind)
        if (!notifiedUsers.has(pair.userId)) {
          notifiedUsers.add(pair.userId);

          // Find all forms this user is behind on
          const behindForms = userFormPairs
            .filter((p: any) => p.userId === pair.userId)
            .filter((p: any) => {
              const k = `${p.userId}:${p.formId}`;
              const c = countMap[k] || 0;
              return p.dailyTarget > 0 && (c / p.dailyTarget) * 100 < 50;
            });

          const formDetails = behindForms
            .map((p: any) => {
              const c = countMap[`${p.userId}:${p.formId}`] || 0;
              return `"${formNameMap[p.formId] || "Unknown"}" (${c}/${p.dailyTarget})`;
            })
            .join(", ");

          notifications.push({
            user_id: pair.userId,
            title: "⏰ Midday Target Reminder",
            message: `You're below 50% on your daily targets: ${formDetails}. Keep going — you still have time to catch up!`,
            type: "warning",
            category: "target",
          });
        }
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      const { error: notifErr } = await supabase
        .from("notifications")
        .insert(notifications);
      if (notifErr) {
        console.error("Error inserting notifications:", notifErr);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Checked ${userFormPairs.length} targets, sent ${notifications.length} reminders`,
        reminders_sent: notifications.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Midday target check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
