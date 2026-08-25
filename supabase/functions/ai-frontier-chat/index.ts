/**
 * ai-frontier-chat — the hybrid reasoning endpoint for Amehnities AI.
 *
 * Routing engine:
 *   • Short factual look-ups  → fast tier
 *   • Analytical questions    → balanced tier
 *   • Expert / zero-shot deep reasoning, attachments, data analysis → frontier tier
 * The learned routing policy (`ai_route_stats`) can override the heuristic, and
 * the caller may pin a tier explicitly.
 *
 * Grounding sources, in priority order:
 *   1. Long-term vector memory (`ai_memory_embeddings`) recalled semantically
 *   2. Uploaded file extracts supplied by the client (CSV/XLSX/PDF/DOCX/JSON)
 *   3. Live app telemetry context supplied by the client
 *
 * The answer is streamed back as SSE. The first frame carries the routing
 * decision and the memory citations so the UI can render them immediately.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyLearnedRoute, classifyQuestion, TIER_LABEL, TIER_MODEL, tierDirective, type Tier } from "../_shared/modelRouter.ts";
import { embedTexts, toVectorLiteral } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Frontier tier — used for expert reasoning, attachments and code/data work. */
const FRONTIER_MODEL = "google/gemini-3.1-pro-preview";

const SYSTEM_PROMPT = `You are Amehnities AI — a senior public-health data scientist embedded in Nigerian NTD / MDA, inclusive eye health and primary-health-care programmes, with the analytical range of a frontier reasoning model.

GROUNDING: use, in order, (1) RECALLED MEMORY, (2) ATTACHED FILES, (3) LIVE APP TELEMETRY. Numbers about this deployment come only from those blocks — never invent them. Say plainly when the supplied context cannot answer.

CITATIONS: cite recalled memory as [M1], [M2]; attached files as [F1], [F2]; telemetry as [E1]. Never invent a marker.

EXPERTISE: programme (administrative) coverage = treated ÷ targeted; epidemiological coverage = treated ÷ total population — always say which. WHO effective coverage: ≥65% for onchocerciasis/LF, ≥75% for schistosomiasis/STH in school-age children; survey vs reported coverage should agree within ~10 percentage points. Medicine received, issued, administered, returned and wasted must reconcile at every custodial level. Name the denominator behind every rate, flag denominators under 30 as unstable, treat missing data as a finding.

DATA ANALYSIS: when the user attaches a dataset, plan the analysis explicitly (cleaning steps, variables, method), then give results with the assumptions and limitations. When Python would answer better than prose, emit a single fenced \`\`\`python block that reads the dataframe already bound as \`df\` (or \`dfs\` for multiple files), prints its findings, and — for charts — assigns a JSON spec to \`chart\` as {"type":"bar|line|pie|scatter","title":...,"data":[{"name":...,"value":...}]}. Never fabricate output you did not compute.

DOCUMENTS: when the user asks for a deck, report or Word document, produce the full structured content in Markdown with clear headings and tables — the app converts it into .pptx/.docx/.pdf. Never claim to have attached a file yourself.

Reply in clean Markdown: tables for comparisons, bold for key figures, and a closing programmatic action (who does what, at which level). Finish with a final line, on its own, exactly:
FOLLOWUPS: question one | question two | question three`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured (missing key)." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    if (!question) return json({ error: "question is required" }, 400);

    const history = (Array.isArray(body?.history) ? body.history : [])
      .slice(-10)
      .filter((m: { role?: string; content?: string }) => m?.role && typeof m.content === "string")
      .map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, 6000),
      }));

    const attachments = (Array.isArray(body?.attachments) ? body.attachments : []).slice(0, 12) as {
      name?: string; type?: string; summary?: string; excerpt?: string;
    }[];
    const telemetry = typeof body?.telemetry === "string" ? body.telemetry.slice(0, 20000) : "";

    // ---------------------------------------------------------- routing
    const { questionClass, heuristicTier } = classifyQuestion(question);
    let tier: Tier = heuristicTier;
    let learnedRoute = false;
    try {
      const { data: stats } = await admin
        .from("ai_route_stats")
        .select("question_class, tier, avg_reward, trials")
        .eq("question_class", questionClass);
      const routed = applyLearnedRoute(heuristicTier, questionClass, (stats ?? []) as never);
      tier = routed.tier;
      learnedRoute = routed.learned;
    } catch { /* heuristic stands */ }

    const pinned = String(body?.tier ?? "");
    if (pinned === "fast" || pinned === "balanced" || pinned === "deep") tier = pinned;

    // Attachments and analysis requests always deserve the frontier model.
    const needsFrontier =
      attachments.length > 0 ||
      /analy[sz]e|regression|forecast|model|deck|powerpoint|report|document|chart|python|statistic/i.test(question);
    const frontier = needsFrontier || tier === "deep";
    const model = frontier ? FRONTIER_MODEL : TIER_MODEL[tier];
    const routeLabel = frontier ? "Frontier reasoning" : TIER_LABEL[tier];

    // ------------------------------------------------- vector recall (RAG)
    let memoryBlock = "";
    const memoryCitations: { marker: string; title: string; kind: string; similarity: number }[] = [];
    try {
      const [vec] = await embedTexts([question], apiKey);
      const { data: matches } = await admin.rpc("match_ai_memory", {
        _embedding: toVectorLiteral(vec),
        _match_count: 8,
        _min_similarity: 0.18,
        _kinds: null,
      });
      const rows = (matches ?? []) as { title: string | null; kind: string; content: string; similarity: number }[];
      if (rows.length) {
        memoryBlock = "RECALLED MEMORY (long-term vector store):\n" + rows.map((r, i) => {
          const marker = `M${i + 1}`;
          memoryCitations.push({
            marker,
            title: r.title ?? r.kind,
            kind: r.kind,
            similarity: Math.round((r.similarity ?? 0) * 100) / 100,
          });
          return `[${marker}] (${r.kind}) ${r.title ?? ""}\n${r.content}`;
        }).join("\n\n");
      }
    } catch (e) {
      console.error("memory recall skipped:", (e as Error)?.message);
    }

    // --------------------------------------------------------- attachments
    const fileBlock = attachments.length
      ? "ATTACHED FILES:\n" + attachments.map((a, i) =>
          `[F${i + 1}] ${a.name ?? "file"} (${a.type ?? "unknown"})\n${a.summary ? `Summary: ${a.summary}\n` : ""}${(a.excerpt ?? "").slice(0, 6000)}`,
        ).join("\n\n")
      : "";

    const contextBlocks = [memoryBlock, fileBlock, telemetry ? `LIVE APP TELEMETRY:\n${telemetry}` : ""]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${tierDirective(frontier ? "deep" : tier)}` },
      ...(contextBlocks ? [{ role: "system", content: contextBlocks }] : []),
      ...history,
      { role: "user", content: question },
    ];

    const upstream = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const details = await upstream.text();
      console.error(`Frontier chat failed [${upstream.status}]: ${details}`);
      return json({ error: "AI request failed", status: upstream.status, details }, upstream.status);
    }

    // Prepend a metadata frame, then relay the model stream untouched.
    const meta = `data: ${JSON.stringify({
      type: "meta",
      route: { tier: frontier ? "frontier" : tier, label: routeLabel, model, questionClass, learned: learnedRoute },
      memory: memoryCitations,
      files: attachments.map((a, i) => ({ marker: `F${i + 1}`, name: a.name ?? "file", type: a.type ?? "" })),
    })}\n\n`;

    const encoder = new TextEncoder();
    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(meta));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error("stream relay error", (e as Error)?.message);
        } finally {
          controller.close();
        }
      },
      cancel() { void reader.cancel(); },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("ai-frontier-chat error", (err as Error)?.message);
    return json({ error: (err as Error)?.message ?? "error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
