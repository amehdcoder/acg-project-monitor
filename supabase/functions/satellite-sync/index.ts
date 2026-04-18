// Satellite Sync Edge Function
// Receives compressed packets from devices on Direct-to-Cell (Starlink/AST) or low-bandwidth links.
// Decodes field-ID + delta encoded packets back into full submissions using the form schema.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SatPacket {
  v: number;
  s: string; // submission id (12 chars)
  f: string; // form id (12 chars)
  u: string; // user id (12 chars)
  t: number; // unix seconds
  l?: [number, number];
  g?: 1 | 0;
  d: Record<string, any>;
  m?: string[];
}

function decodeBatch(payload: string): SatPacket[] {
  const json = decodeURIComponent(escape(atob(payload)));
  return JSON.parse(json);
}

// Reverse map: q0,q1,q2... -> question.id
function reverseFieldMap(questions: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  questions.forEach((q, idx) => {
    map[`q${idx}`] = q.id;
  });
  return map;
}

// Resolve a short id (last 12 chars, no dashes) to full UUID via fuzzy match
async function resolveFullId(
  supabase: any,
  table: string,
  shortId: string,
  column = "id"
): Promise<string | null> {
  // Normalize short id - just compare on stripped form
  const { data } = await supabase.from(table).select(column);
  if (!data) return null;
  const match = data.find((row: any) => {
    const stripped = String(row[column]).replace(/-/g, "");
    return stripped.endsWith(shortId);
  });
  return match ? match[column] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const payload: string = body.payload;
    if (!payload || typeof payload !== "string") {
      return new Response(JSON.stringify({ error: "payload required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let packets: SatPacket[];
    try {
      packets = decodeBatch(payload);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid packet payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(packets) || packets.length === 0) {
      return new Response(JSON.stringify({ error: "No packets in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for inserts (bypasses RLS, but we already verified user)
    const admin = createClient(supabaseUrl, serviceKey);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const packet of packets) {
      try {
        // Resolve form id
        const fullFormId = await resolveFullId(admin, "forms", packet.f);
        if (!fullFormId) {
          results.push({ id: packet.s, status: "failed", error: "form not found" });
          continue;
        }

        // Get form questions for field mapping
        const { data: form, error: formErr } = await admin
          .from("forms")
          .select("id, questions")
          .eq("id", fullFormId)
          .maybeSingle();

        if (formErr || !form) {
          results.push({ id: packet.s, status: "failed", error: "form fetch failed" });
          continue;
        }

        const questions = (form.questions as any[]) || [];
        const reverseMap = reverseFieldMap(questions);

        // Decode data: q0 -> original question id
        const decodedData: Record<string, any> = {};
        for (const [shortKey, value] of Object.entries(packet.d || {})) {
          const fullKey = reverseMap[shortKey] || shortKey;
          decodedData[fullKey] = value;
        }

        // Add metadata flag indicating satellite origin
        decodedData.__sat_sync = true;
        if (packet.m) decodedData.__sat_media_pending = packet.m;

        // Build submission - use authenticated user as user_id (sat packets carry short id but we trust JWT)
        const submissionId = crypto.randomUUID();
        const location = packet.l ? { lat: packet.l[0], lng: packet.l[1] } : null;

        const { error: insertErr } = await admin.from("form_submissions").insert({
          id: submissionId,
          form_id: fullFormId,
          user_id: user.id,
          data: decodedData,
          location,
          within_geofence: packet.g === undefined ? null : packet.g === 1,
          status: "sent",
          submission_type: "satellite",
          submitted_at: new Date(packet.t * 1000).toISOString(),
          synced_at: new Date().toISOString(),
        });

        if (insertErr) {
          results.push({ id: packet.s, status: "failed", error: insertErr.message });
          continue;
        }

        results.push({ id: packet.s, status: "ok" });
      } catch (e: any) {
        results.push({ id: packet.s, status: "failed", error: e.message });
      }
    }

    const okCount = results.filter((r) => r.status === "ok").length;
    const failedCount = results.length - okCount;

    return new Response(
      JSON.stringify({
        success: true,
        synced: okCount,
        failed: failedCount,
        results,
        bytesReceived: new TextEncoder().encode(payload).length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("satellite-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
