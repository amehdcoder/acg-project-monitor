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

    const body = await req.json().catch(() => ({}));
    const formId = body?.form_id;
    const hoursBack = body?.hours_back || 24;
    const similarityThreshold = body?.threshold || 0.8;

    // Get recent submissions
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("form_submissions")
      .select("id, form_id, user_id, data, submitted_at, location")
      .eq("status", "sent")
      .gte("submitted_at", since)
      .order("submitted_at", { ascending: false })
      .limit(500);

    if (formId) query = query.eq("form_id", formId);

    const { data: submissions, error } = await query;
    if (error) throw error;
    if (!submissions || submissions.length < 2) {
      return new Response(
        JSON.stringify({ message: "Not enough submissions to compare", similar_pairs: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by form_id
    const byForm = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const arr = byForm.get(sub.form_id) || [];
      arr.push(sub);
      byForm.set(sub.form_id, arr);
    }

    const similarPairs: Array<{
      form_id: string;
      submission_a: string;
      submission_b: string;
      user_a: string;
      user_b: string;
      similarity: number;
      matching_fields: string[];
    }> = [];

    for (const [fId, subs] of byForm) {
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          const a = subs[i];
          const b = subs[j];
          const dataA = a.data as Record<string, unknown>;
          const dataB = b.data as Record<string, unknown>;

          // Compare field values
          const allKeys = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);
          const filteredKeys = Array.from(allKeys).filter(
            (k) => !k.startsWith("_") && !k.includes("gps") && !k.includes("timestamp")
          );

          if (filteredKeys.length === 0) continue;

          let matches = 0;
          const matchingFields: string[] = [];
          for (const key of filteredKeys) {
            if (
              dataA[key] !== undefined &&
              dataB[key] !== undefined &&
              JSON.stringify(dataA[key]) === JSON.stringify(dataB[key])
            ) {
              matches++;
              matchingFields.push(key);
            }
          }

          const similarity = matches / filteredKeys.length;
          if (similarity >= similarityThreshold) {
            similarPairs.push({
              form_id: fId,
              submission_a: a.id,
              submission_b: b.id,
              user_a: a.user_id,
              user_b: b.user_id,
              similarity: Math.round(similarity * 100),
              matching_fields: matchingFields,
            });
          }
        }
      }
    }

    // Notify admins about similar entries
    if (similarPairs.length > 0) {
      // Get user emails for context
      const userIds = [...new Set(similarPairs.flatMap((p) => [p.user_a, p.user_b]))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, first_name, last_name")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, `${p.first_name} ${p.last_name} (${p.email})`])
      );

      // Get admin users to notify
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "systems_admin"]);

      const adminIds = (adminRoles || []).map((r) => r.user_id);

      // Create notifications
      const notifications = adminIds.map((adminId) => ({
        user_id: adminId,
        title: `⚠️ Similar Entries Detected`,
        message: `${similarPairs.length} pairs of similar form entries found in the last ${hoursBack}h. Users involved: ${[...new Set(similarPairs.flatMap((p) => [profileMap.get(p.user_a) || p.user_a, profileMap.get(p.user_b) || p.user_b]))].join(", ")}`,
        type: "warning",
        category: "data_quality",
      }));

      await supabase.from("notifications").insert(notifications);

      // Log to surveillance
      for (const pair of similarPairs) {
        await supabase.from("admin_surveillance_log").insert({
          actor_id: pair.user_a,
          actor_email: profileMap.get(pair.user_a) || "",
          actor_role: "user",
          action_type: "similar_entry_detected",
          action_description: `${pair.similarity}% similar entry found between submissions ${pair.submission_a.slice(0, 8)} and ${pair.submission_b.slice(0, 8)}`,
          target_entity: "form_submission",
          target_id: pair.submission_a,
          metadata: {
            other_submission: pair.submission_b,
            other_user: pair.user_b,
            similarity: pair.similarity,
            matching_fields: pair.matching_fields,
            form_id: pair.form_id,
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Found ${similarPairs.length} similar entry pairs`,
        similar_pairs: similarPairs.length,
        pairs: similarPairs.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Similar entry detection error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
