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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse threshold from request body or default to 20%
    let threshold = 20;
    try {
      const body = await req.json();
      if (body?.threshold && typeof body.threshold === "number") {
        threshold = Math.max(0, Math.min(100, body.threshold));
      }
    } catch {
      // Use default threshold
    }

    // Get forms with geofences enabled
    const { data: forms, error: formsErr } = await supabase
      .from("forms")
      .select("id, name, geofence, project_id")
      .not("geofence", "is", null);

    if (formsErr) throw formsErr;
    if (!forms || forms.length === 0) {
      return new Response(
        JSON.stringify({ message: "No geofence-enabled forms found", alerts_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get submissions for geofenced forms (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const formIds = forms.map((f) => f.id);

    const { data: submissions, error: subErr } = await supabase
      .from("form_submissions")
      .select("form_id, within_geofence, user_id")
      .in("form_id", formIds)
      .eq("status", "sent")
      .gte("submitted_at", since);

    if (subErr) throw subErr;

    // Calculate per-form compliance
    const alerts: { formName: string; outsideRate: number; total: number; outside: number }[] = [];

    for (const form of forms) {
      const formSubs = (submissions || []).filter((s) => s.form_id === form.id);
      if (formSubs.length === 0) continue;

      const outside = formSubs.filter((s) => s.within_geofence === false).length;
      const checked = formSubs.filter((s) => s.within_geofence !== null).length;

      if (checked === 0) continue;

      const outsideRate = Math.round((outside / checked) * 100);

      if (outsideRate > threshold) {
        alerts.push({
          formName: form.name,
          outsideRate,
          total: formSubs.length,
          outside,
        });
      }
    }

    if (alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: "All forms within compliance threshold", threshold, alerts_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all admin/supervisor users to notify
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "systems_admin"]);

    const adminIds = (adminRoles || []).map((r) => r.user_id);

    if (adminIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No admins to notify", alerts_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create notifications for each admin for each flagged form
    const notifications = [];
    for (const alert of alerts) {
      for (const userId of adminIds) {
        notifications.push({
          user_id: userId,
          title: `⚠️ Geofence Alert: ${alert.formName}`,
          message: `${alert.outsideRate}% of submissions (${alert.outside}/${alert.total}) are outside the geofence boundary in the last 24h. Threshold: ${threshold}%.`,
          type: "warning",
          category: "geofence",
          related_id: alert.formName,
        });
      }
    }

    const { error: notifErr } = await supabase.from("notifications").insert(notifications);

    if (notifErr) throw notifErr;

    return new Response(
      JSON.stringify({
        message: `Sent ${notifications.length} geofence compliance alerts`,
        threshold,
        alerts_sent: notifications.length,
        flagged_forms: alerts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Geofence compliance check error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
