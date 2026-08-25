/**
 * ai-web-stream — continuous public-health / M&E knowledge feed.
 *
 * The Amehnities AI brain learns from two streams: the live application
 * activity, and the published literature on the internet. This function serves
 * the second one. It rotates through a curated set of public-health, NTD/MDA
 * and monitoring-and-evaluation topics, retrieves short passages from open,
 * key-free sources (Europe PMC, Wikipedia) and returns them so the browser can
 * tokenise them into the training stream and index them into long-term memory.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { guardRequest } from "../_shared/authGuard.ts";
import { retrieveWebKnowledge } from "../_shared/webKnowledge.ts";

const TOPICS = [
  "WHO mass drug administration coverage guidelines neglected tropical diseases",
  "monitoring and evaluation framework indicators logframe theory of change",
  "coverage evaluation survey methodology LQAS sample size",
  "trachoma onchocerciasis lymphatic filariasis elimination thresholds",
  "community drug distributor supervision quality field data collection",
  "supply chain accountability essential medicines last mile distribution",
  "epidemiological surveillance outbreak detection spatial cluster analysis",
  "household survey data quality assurance verification field monitoring",
  "schistosomiasis soil-transmitted helminths preventive chemotherapy",
  "health information systems routine data quality DHIS2 indicators",
  "geospatial microplanning settlement mapping population estimates",
  "vitamin A supplementation campaign coverage evaluation",
  "primary eye health inclusive service delivery cataract surgical rate",
  "immunisation campaign supervision checklist independent monitoring",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
  if (guard.response) return guard.response;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const cursor = Number(body?.cursor ?? 0) || 0;
    const count = Math.max(1, Math.min(3, Number(body?.count ?? 2)));
    const explicit = typeof body?.topic === "string" && body.topic.trim() ? String(body.topic).trim() : null;

    const topics = explicit
      ? [explicit]
      : Array.from({ length: count }, (_, i) => TOPICS[(cursor + i) % TOPICS.length]);

    const batches = await Promise.all(
      topics.map((t) => retrieveWebKnowledge(t, 4).catch(() => [])),
    );

    const seen = new Set<string>();
    const passages: unknown[] = [];
    batches.forEach((sources, i) => {
      for (const s of sources) {
        const key = (s.url || s.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        passages.push({
          topic: topics[i],
          title: s.title,
          url: s.url,
          publisher: s.publisher,
          year: s.year ?? null,
          snippet: (s.snippet || "").slice(0, 1200),
        });
      }
    });

    return new Response(
      JSON.stringify({ passages, cursor: (cursor + topics.length) % TOPICS.length, topics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ passages: [], error: String((err as Error)?.message ?? err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
