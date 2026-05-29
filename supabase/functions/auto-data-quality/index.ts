import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active forms with recent submissions (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentSubmissions, error: subErr } = await supabase
      .from("form_submissions")
      .select("id, form_id, user_id, data, submitted_at, location, within_geofence")
      .eq("status", "sent")
      .gte("submitted_at", twentyFourHoursAgo)
      .order("submitted_at", { ascending: false })
      .limit(500);

    if (subErr) throw subErr;
    if (!recentSubmissions?.length) {
      return new Response(JSON.stringify({ message: "No recent submissions to check", issues: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by form
    const byForm = new Map<string, any[]>();
    for (const s of recentSubmissions) {
      if (!byForm.has(s.form_id)) byForm.set(s.form_id, []);
      byForm.get(s.form_id)!.push(s);
    }

    let totalIssues = 0;

    for (const [formId, submissions] of byForm) {
      if (submissions.length < 3) continue; // Need minimum data

      // Get form info and project
      const { data: form } = await supabase.from("forms").select("name, project_id").eq("id", formId).single();
      if (!form) continue;

      // Quick automated checks (no AI needed)
      const issues: string[] = [];

      // 1. Check for exact duplicate data
      const dataStrings = submissions.map((s: any) => JSON.stringify(s.data));
      const duplicates = dataStrings.filter((d: string, i: number) => dataStrings.indexOf(d) !== i);
      if (duplicates.length > 0) {
        issues.push(`${duplicates.length} exact duplicate submission(s) detected`);
      }

      // 2. Check for rapid-fire submissions (same user, < 60 seconds apart)
      const byUser = new Map<string, any[]>();
      for (const s of submissions) {
        if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
        byUser.get(s.user_id)!.push(s);
      }
      for (const [userId, userSubs] of byUser) {
        const sorted = userSubs.sort((a: any, b: any) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
        for (let i = 1; i < sorted.length; i++) {
          const diff = new Date(sorted[i].submitted_at).getTime() - new Date(sorted[i - 1].submitted_at).getTime();
          if (diff < 60000) {
            issues.push(`Rapid-fire submissions detected (${Math.round(diff / 1000)}s apart) from a user`);
            break;
          }
        }
      }

      // 3. Check geofence violations
      const geofenceViolations = submissions.filter((s: any) => s.within_geofence === false);
      if (geofenceViolations.length > 0) {
        issues.push(`${geofenceViolations.length} submission(s) outside geofence boundary`);
      }

      // 4. Check for empty/minimal data
      const emptyData = submissions.filter((s: any) => {
        const keys = Object.keys(s.data || {}).filter(k => !k.startsWith("_"));
        return keys.length < 2;
      });
      if (emptyData.length > 0) {
        issues.push(`${emptyData.length} submission(s) with very little data (possible incomplete entries)`);
      }

      if (issues.length === 0) continue;

      totalIssues += issues.length;

      // Notify admins assigned to the project
      const { data: projectAdmins } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", form.project_id);

      const { data: allAdmins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "systems_admin"]);

      const adminIds = new Set<string>();
      // Add project-assigned admins
      if (projectAdmins) {
        for (const pa of projectAdmins) {
          // Check if they are admins
          const isAdmin = allAdmins?.some((a: any) => a.user_id === pa.user_id);
          if (isAdmin) adminIds.add(pa.user_id);
        }
      }
      // Always include super admins
      if (allAdmins) {
        for (const a of allAdmins) {
          const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", a.user_id).eq("role", "super_admin").single();
          if (role) adminIds.add(a.user_id);
        }
      }

      const issueList = issues.join("; ");
      for (const adminId of adminIds) {
        // Avoid duplicate notifications today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", adminId)
          .eq("category", "data_quality")
          .eq("related_id", formId)
          .gte("created_at", todayStart.toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("notifications").insert({
          user_id: adminId,
          type: "warning",
          title: `Data Quality Alert: ${form.name}`,
          message: `Automated quality check found ${issues.length} issue(s): ${issueList}`,
          category: "data_quality",
          related_id: formId,
        });
      }
    }

    return new Response(JSON.stringify({
      message: `Checked ${recentSubmissions.length} submissions across ${byForm.size} forms. Found ${totalIssues} issue(s).`,
      issues: totalIssues,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auto-data-quality error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
