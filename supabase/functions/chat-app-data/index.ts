/**
 * chat-app-data — the Amehnities Data Assistant.
 *
 * Pulls a bounded, real-time slice of application activity straight from the
 * database, hands it to Lovable AI together with the live Transformer metrics
 * the browser reports, and streams the grounded answer back to the client.
 *
 * Every sampled row is registered in a citation catalog ([E1], [E2] …) that
 * carries the real event id and timestamp, so the assistant can attribute each
 * factual claim to a clickable source. The catalog is emitted as the first SSE
 * frame before the model tokens start streaming.
 */
import { guardRequest } from "../_shared/authGuard.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the official Amehnities Data Assistant. Provide accurate, factual answers to user questions using ONLY the provided application activity context and live metrics. Do not invent data. If the answer cannot be determined from the application data, state that clearly.

CITATIONS (mandatory): every factual claim drawn from the activity context must end with one or more citation markers taken from the SOURCE EVENTS catalog, written exactly as [E12] or [E3][E7]. Never invent a marker that is not in the catalog. Claims about the live Transformer metrics use [MODEL] instead. Sentences that are purely interpretation may go uncited.

Formatting: reply in clean Markdown. Use tables for comparisons and breakdowns, bullet points for lists, and bold for key figures. Always quote the exact counts you were given. Keep answers under 350 words unless the user asks for more detail.

FOLLOW-UPS (mandatory): finish your reply with a final line, on its own, in exactly this form:
FOLLOWUPS: question one | question two | question three
Each follow-up must be a specific, answerable question about something you actually observed in the supplied data (name the stream, status, or figure). No generic questions. Nothing may come after that line.`;

/** Bounded pulls — never a heavy scan, even on very large projects. */
const SOURCES: {
  table: string;
  label: string;
  timeColumn: string;
  select: string;
  kind?: string;
  descriptors: string[];
}[] = [
  { table: "form_submissions", label: "Submissions", timeColumn: "created_at", select: "id,created_at,status", kind: "status", descriptors: ["status"] },
  { table: "audit_logs", label: "Audit trail", timeColumn: "created_at", select: "id,created_at,action", kind: "action", descriptors: ["action"] },
  { table: "app_usage_tracking", label: "App usage", timeColumn: "created_at", select: "id,created_at,action", kind: "action", descriptors: ["action"] },
  { table: "field_activity", label: "Field activity", timeColumn: "created_at", select: "id,created_at,within_geofence", kind: "within_geofence", descriptors: ["within_geofence"] },
  { table: "attendance_records", label: "Attendance", timeColumn: "created_at", select: "id,created_at,status", kind: "status", descriptors: ["status"] },
  { table: "forum_posts", label: "Forum", timeColumn: "created_at", select: "id,created_at,category", kind: "category", descriptors: ["category"] },
];

/** How many individual rows per stream get a citable [E#] reference. */
const CITED_PER_STREAM = 8;

interface Citation {
  ref: string;
  table: string;
  label: string;
  eventId: string;
  timestamp: string;
  detail: string;
}

interface Bucket {
  label: string;
  table: string;
  total: number;
  kinds: Record<string, number>;
  last24h: number;
  last7d: number;
  newest: string | null;
  oldest: string | null;
  error?: string;
  citations: Citation[];
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
      const b: Bucket = {
        label: s.label, table: s.table, total: 0, kinds: {},
        last24h: 0, last7d: 0, newest: null, oldest: null, citations: [],
      };
      try {
        const { data, error } = await supabase
          .from(s.table)
          .select(s.select)
          .order(s.timeColumn, { ascending: false })
          .limit(300);
        if (error) { b.error = error.message; return b; }
        const rows = (data as Record<string, unknown>[]) ?? [];
        for (const row of rows) {
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

          if (b.citations.length < CITED_PER_STREAM && row.id) {
            const detail = s.descriptors
              .map((d) => `${d}=${String(row[d] ?? "unspecified")}`)
              .join(", ");
            b.citations.push({
              ref: "", // assigned globally below
              table: s.table,
              label: s.label,
              eventId: String(row.id),
              timestamp: iso,
              detail,
            });
          }
        }
      } catch (e) {
        b.error = e instanceof Error ? e.message : "unavailable";
      }
      return b;
    }),
  );

  // Assign stable global refs E1..En across all streams.
  const citations: Citation[] = [];
  for (const b of buckets) {
    for (const c of b.citations) {
      c.ref = `E${citations.length + 1}`;
      citations.push(c);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    windowNote: "Up to the 300 most recent rows per stream; the most recent rows per stream are individually citable.",
    streams: buckets,
    citations,
  };
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
    const refs = s.citations.map((c) => `[${c.ref}]`).join("") || "—";
    lines.push(`- ${s.label}: ${s.total} records sampled | last 24h: ${s.last24h} | last 7d: ${s.last7d} | newest: ${s.newest ?? "n/a"} | oldest: ${s.oldest ?? "n/a"} | breakdown: ${kinds} | sample sources: ${refs}`);
  }
  const totalEvents = ctx.streams.reduce((a, s) => a + s.total, 0);
  lines.push("");
  lines.push(`TOTAL SAMPLED EVENTS: ${totalEvents}`);
  lines.push("");
  lines.push("SOURCE EVENTS CATALOG (cite these markers)");
  for (const c of ctx.citations) {
    lines.push(`[${c.ref}] ${c.label} · table=${c.table} · event_id=${c.eventId} · at=${c.timestamp} · ${c.detail}`);
  }
  if (model && Object.keys(model).length) {
    lines.push("");
    lines.push("LIVE TRANSFORMER METRICS (browser-trained model) — cite as [MODEL]");
    for (const [k, v] of Object.entries(model)) lines.push(`- ${k}: ${typeof v === "number" ? v : String(v)}`);
  }
  return lines.join("\n");
}

/**
 * Retrieval of the learned policy (RLHF-style, weights untouched).
 *
 * Rules distilled from past human feedback are ranked by their bandit score —
 * an upper-confidence bound on average reward — so well-performing rules are
 * exploited while fresh, untried rules still get explored. Exemplars are
 * additionally matched to the current question by keyword overlap, giving the
 * assistant retrieval-augmented few-shot conditioning on its own best answers.
 */
interface PolicyRow {
  id: string; kind: string; topic: string; content: string;
  question: string | null; answer: string | null;
  avg_reward: number; trials: number;
}

const STOPWORDS = new Set(["the", "and", "for", "what", "which", "with", "from", "that", "this", "how", "why", "are", "was", "does", "did", "our", "you", "show", "give", "list", "many", "much", "into", "over"]);

const keywords = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w)));

function overlap(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.max(1, Math.min(a.size, b.size));
}

async function retrievePolicy(question: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return { rules: [] as PolicyRow[], exemplars: [] as PolicyRow[], ids: [] as string[] };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("ai_chat_policy")
    .select("id,kind,topic,content,question,answer,avg_reward,trials")
    .eq("active", true)
    .order("avg_reward", { ascending: false })
    .limit(200);
  if (error || !data) return { rules: [], exemplars: [], ids: [] };

  const rows = data as PolicyRow[];
  const totalTrials = rows.reduce((a, r) => a + (r.trials || 0), 0) + 1;
  const ucb = (r: PolicyRow) =>
    Number(r.avg_reward || 0) + Math.sqrt((2 * Math.log(totalTrials)) / Math.max(1, r.trials || 1)) * 0.35;

  const qk = keywords(question);
  const rules = rows.filter((r) => r.kind === "rule")
    .map((r) => ({ r, score: ucb(r) + overlap(qk, keywords(`${r.topic} ${r.content}`)) * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.r);

  const exemplars = rows.filter((r) => r.kind === "exemplar" && r.question && r.answer)
    .map((r) => ({ r, score: overlap(qk, keywords(r.question ?? "")) + Number(r.avg_reward || 0) * 0.2 }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.r);

  return { rules, exemplars, ids: [...rules, ...exemplars].map((r) => r.id) };
}

function policyBlock(rules: PolicyRow[], exemplars: PolicyRow[]) {
  if (!rules.length && !exemplars.length) return "";
  const lines: string[] = [];
  if (rules.length) {
    lines.push("LEARNED OPERATING RULES (distilled from verified human feedback on your previous answers — follow them):");
    rules.forEach((r, i) => lines.push(`${i + 1}. [${r.topic}] ${r.content}`));
  }
  if (exemplars.length) {
    lines.push("");
    lines.push("HIGH-RATED PRECEDENTS (match this depth, structure and citation discipline — never reuse their figures):");
    exemplars.forEach((e, i) => {
      lines.push(`Precedent ${i + 1} — Q: ${String(e.question).slice(0, 300)}`);
      lines.push(`A (excerpt): ${String(e.answer).slice(0, 900)}`);
    });
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

    // Emit the citation catalog first, then relay the model stream untouched.
    const encoder = new TextEncoder();
    const catalogFrame = `data: ${JSON.stringify({
      amehnities: { citations: ctx.citations, generatedAt: ctx.generatedAt },
    })}\n\n`;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(catalogFrame));
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {
          /* client or upstream disconnected */
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
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
