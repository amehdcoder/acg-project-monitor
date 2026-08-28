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
import { retrieveWebKnowledge, shouldSearchWeb } from "../_shared/webKnowledge.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Domain expertise. The assistant is not a generic analytics bot: it reasons as
 * a public-health professional working on Nigerian NTD mass drug administration,
 * eye health and primary-health-care programmes, using WHO/NTD doctrine.
 */



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

/** Learned routing evidence — reward per (question class, model tier). */


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

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const lastQuestion = String(messages[messages.length - 1]?.content ?? "").slice(0, 2000);

    // Internet evidence the assistant has learned to consult: open literature
    // (Europe PMC) and reference sources. No third-party language model is
    // called anywhere in this endpoint.
    const webRequested = body?.useWeb === undefined ? null : Boolean(body.useWeb);
    const wantWeb = webRequested === null ? shouldSearchWeb(lastQuestion) : webRequested;

    const [ctx, policy, webSources] = await Promise.all([
      buildContext(token),
      retrievePolicy(lastQuestion),
      wantWeb ? retrieveWebKnowledge(lastQuestion).catch(() => []) : Promise.resolve([]),
    ]);

    // Evidence bundle. The answer itself is composed in the browser by the
    // Amehnities model from this evidence — the endpoint only retrieves.
    return new Response(JSON.stringify({
      generatedAt: ctx.generatedAt,
      windowNote: ctx.windowNote,
      streams: ctx.streams.map((s) => ({
        label: s.label,
        table: s.table,
        total: s.total,
        kinds: s.kinds,
        last24h: s.last24h,
        last7d: s.last7d,
        newest: s.newest,
        oldest: s.oldest,
        error: s.error ?? null,
        refs: s.citations.map((c) => c.ref),
      })),
      citations: [
        ...ctx.citations,
        ...webSources.map((w) => ({
          ref: w.ref,
          table: "web",
          kind: "web" as const,
          label: w.title,
          eventId: w.url,
          url: w.url,
          publisher: w.publisher,
          timestamp: w.year ? `${w.year}-01-01T00:00:00.000Z` : new Date().toISOString(),
          detail: w.snippet.slice(0, 400),
        })),
      ],
      web: webSources.map((w) => ({
        ref: w.ref, title: w.title, publisher: w.publisher, year: w.year ?? null,
        url: w.url, snippet: w.snippet.slice(0, 700),
      })),
      rules: policy.rules.map((r) => ({ topic: r.topic, content: r.content, avgReward: Number(r.avg_reward) })),
      exemplars: policy.exemplars.map((e) => ({ question: e.question, answer: e.answer })),
      policyIds: policy.ids,
      modelStats: modelStats ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
