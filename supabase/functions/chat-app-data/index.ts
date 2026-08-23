/**
 * chat-app-data — the Amehnities Data Assistant.
 *
 * Pulls a bounded, real-time slice of application activity straight from the
 * database, hands it to Lovable AI together with the live Transformer metrics
 * the browser reports, and streams the grounded answer back to the client.
 */
import { guardRequest } from "../_shared/authGuard.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the official Amehnities Data Assistant. Provide accurate, factual answers to user questions using ONLY the provided application activity context and live metrics. Do not invent data. If the answer cannot be determined from the application data, state that clearly.

Formatting: reply in clean Markdown. Use tables for comparisons and breakdowns, bullet points for lists, and bold for key figures. Always quote the exact counts you were given. Keep answers under 350 words unless the user asks for more detail.`;

/** Bounded pulls — never a heavy scan, even on very large projects. */
const SOURCES: { table: string; label: string; timeColumn: string; select: string; kind?: string }[] = [
  { table: "form_submissions", label: "Submissions", timeColumn: "created_at", select: "created_at,status", kind: "status" },
  { table: "audit_logs", label: "Audit trail", timeColumn: "created_at", select: "created_at,action", kind: "action" },
  { table: "app_usage_tracking", label: "App usage", timeColumn: "created_at", select: "created_at,action", kind: "action" },
  { table: "field_activity", label: "Field activity", timeColumn: "created_at", select: "created_at,within_geofence", kind: "within_geofence" },
  { table: "attendance_records", label: "Attendance", timeColumn: "created_at", select: "created_at,status", kind: "status" },
  { table: "forum_posts", label: "Forum", timeColumn: "created_at", select: "created_at,category", kind: "category" },
];

interface Bucket {
  label: string;
  total: number;
  kinds: Record<string, number>;
  last24h: number;
  last7d: number;
  newest: string | null;
  oldest: string | null;
  error?: string;
}

async function buildContext(token: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const now = Date.now();
  const day = 86_400_000;

  const buckets = await Promise.all(
    SOURCES.map(async (s): Promise<Bucket> => {
      const b: Bucket = { label: s.label, total: 0, kinds: {}, last24h: 0, last7d: 0, newest: null, oldest: null };
      try {
        const { data, error } = await supabase
          .from(s.table)
          .select(s.select)
          .order(s.timeColumn, { ascending: false })
          .limit(300);
        if (error) { b.error = error.message; return b; }
        for (const row of (data as Record<string, unknown>[]) ?? []) {
          const at = new Date(String(row[s.timeColumn])).getTime();
          if (!Number.isFinite(at)) continue;
          b.total++;
          if (now - at <= day) b.last24h++;
          if (now - at <= day * 7) b.last7d++;
          const k = s.kind ? String(row[s.kind] ?? "unspecified") : "event";
          b.kinds[k] = (b.kinds[k] || 0) + 1;
          const iso = new Date(at).toISOString();
          if (!b.newest || iso > b.newest) b.newest = iso;
          if (!b.oldest || iso < b.oldest) b.oldest = iso;
        }
      } catch (e) {
        b.error = e instanceof Error ? e.message : "unavailable";
      }
      return b;
    }),
  );

  return { generatedAt: new Date().toISOString(), windowNote: "Up to the 300 most recent rows per stream.", streams: buckets };
}

function contextBlock(ctx: Awaited<ReturnType<typeof buildContext>>, model: Record<string, unknown> | undefined) {
  const lines: string[] = [];
  lines.push(`Context generated at ${ctx.generatedAt}. ${ctx.windowNote}`);
  lines.push("");
  lines.push("APPLICATION ACTIVITY STREAMS");
  for (const s of ctx.streams) {
    if (s.error) { lines.push(`- ${s.label}: unavailable to this user (${s.error}).`); continue; }
    const kinds = Object.entries(s.kinds).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => `${k}=${v}`).join(", ") || "none";
    lines.push(`- ${s.label}: ${s.total} records sampled | last 24h: ${s.last24h} | last 7d: ${s.last7d} | newest: ${s.newest ?? "n/a"} | oldest: ${s.oldest ?? "n/a"} | breakdown: ${kinds}`);
  }
  const totalEvents = ctx.streams.reduce((a, s) => a + s.total, 0);
  lines.push("");
  lines.push(`TOTAL SAMPLED EVENTS: ${totalEvents}`);
  if (model && Object.keys(model).length) {
    lines.push("");
    lines.push("LIVE TRANSFORMER METRICS (browser-trained model)");
    for (const [k, v] of Object.entries(model)) lines.push(`- ${k}: ${typeof v === "number" ? v : String(v)}`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
  if (guard.response) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const modelStats = body?.modelStats && typeof body.modelStats === "object" ? body.modelStats : undefined;
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI is not configured on this workspace." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const ctx = await buildContext(token);

    const trimmed = messages.slice(-16).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 6000),
    }));

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `LIVE APPLICATION CONTEXT\n\n${contextBlock(ctx, modelStats)}` },
          ...trimmed,
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      let message = "The assistant is unavailable right now.";
      if (upstream.status === 429) message = "Too many requests to Amehnities AI — please wait a moment and try again.";
      else if (upstream.status === 402) message = "The workspace is out of AI credits. Add credits in Lovable to keep using the assistant.";
      else if (upstream.status === 403) message = "AI access is blocked by workspace policy.";
      return new Response(JSON.stringify({ error: message, detail: detail.slice(0, 500) }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
