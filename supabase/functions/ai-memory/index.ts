/**
 * ai-memory — long-term vector memory for Amehnities AI.
 *
 * Actions:
 *   index    → embed and store one or more memory entries (telemetry snapshots,
 *              uploaded document text, chat corrections, feedback rules).
 *   search   → semantic recall over the stored memory.
 *   feedback → route an Answer Review Queue correction into memory as a
 *              durable system-feedback rule.
 *   forget   → delete memory rows by source id (owner/admin only).
 *
 * Every call is authenticated; writes are attributed to the caller.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { chunkText, embedTexts, GatewayError, toVectorLiteral } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_ENTRIES = 40;

interface MemoryEntry {
  kind?: string;
  title?: string;
  content: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
  project_id?: string | null;
  is_shared?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Embeddings are computed locally — no external model or key is required.
    const apiKey = "";

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
    const action = String(body?.action ?? "search");

    // ---------------------------------------------------------------- index
    if (action === "index" || action === "feedback") {
      let entries: MemoryEntry[] = [];

      if (action === "feedback") {
        const question = String(body?.question ?? "").slice(0, 2000);
        const correction = String(body?.correction ?? "").slice(0, 6000);
        if (!correction.trim()) return json({ error: "correction is required" }, 400);
        entries = [{
          kind: "feedback_rule",
          title: question ? `Correction: ${question.slice(0, 120)}` : "Reviewer correction",
          content:
            `REVIEWED CORRECTION — treat as authoritative guidance for similar questions.\n` +
            (question ? `Question: ${question}\n` : "") +
            `Approved answer / rule: ${correction}`,
          source_id: body?.source_id ? String(body.source_id) : undefined,
          metadata: { reviewed_by: userId, ...(body?.metadata ?? {}) },
          is_shared: true,
        }];
      } else {
        const raw = Array.isArray(body?.entries) ? body.entries : [];
        entries = raw.slice(0, MAX_ENTRIES).filter((e: MemoryEntry) => typeof e?.content === "string" && e.content.trim());
        if (entries.length === 0) return json({ error: "No entries to index" }, 400);
      }

      // Expand long content into chunks, keeping provenance on each chunk.
      const expanded: { entry: MemoryEntry; text: string; part: number; parts: number }[] = [];
      for (const entry of entries) {
        const chunks = chunkText(entry.content);
        chunks.forEach((text, i) => expanded.push({ entry, text, part: i + 1, parts: chunks.length }));
      }
      const capped = expanded.slice(0, 120);

      const vectors = await embedTexts(capped.map((c) => c.text), apiKey);

      const rows = capped.map((c, i) => ({
        kind: c.entry.kind ?? "note",
        source_id: c.entry.source_id ?? null,
        title: c.entry.title ?? null,
        content: c.text,
        metadata: { ...(c.entry.metadata ?? {}), part: c.part, parts: c.parts },
        project_id: c.entry.project_id ?? null,
        created_by: userId,
        is_shared: c.entry.is_shared ?? true,
        embedding: toVectorLiteral(vectors[i] ?? []),
      }));

      // Replace prior chunks for the same source so re-indexing is idempotent.
      const sourceIds = [...new Set(rows.map((r) => r.source_id).filter(Boolean))] as string[];
      if (sourceIds.length) {
        await admin.from("ai_memory_embeddings").delete().in("source_id", sourceIds);
      }

      const { error } = await admin.from("ai_memory_embeddings").insert(rows);
      if (error) return json({ error: error.message }, 400);

      return json({ indexed: rows.length, sources: sourceIds.length });
    }

    // --------------------------------------------------------------- search
    if (action === "search") {
      const query = String(body?.query ?? "").trim();
      if (!query) return json({ matches: [] });
      const [vec] = await embedTexts([query], apiKey);
      const { data, error } = await admin.rpc("match_ai_memory", {
        _embedding: toVectorLiteral(vec),
        _match_count: Math.min(Number(body?.limit ?? 8) || 8, 25),
        _min_similarity: Number(body?.minSimilarity ?? 0.15),
        _kinds: Array.isArray(body?.kinds) && body.kinds.length ? body.kinds : null,
        // The service role bypasses RLS, so scope recall to the caller explicitly.
        _user_id: userId,
      });

      if (error) return json({ error: error.message }, 400);
      return json({ matches: data ?? [] });
    }

    // --------------------------------------------------------------- forget
    if (action === "forget") {
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        admin.rpc("is_admin", { _user_id: userId }),
        admin.rpc("is_owner", { _user_id: userId }),
      ]);
      if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);
      const sourceIds = Array.isArray(body?.source_ids) ? body.source_ids.map(String) : [];
      if (!sourceIds.length) return json({ error: "source_ids required" }, 400);
      const { error } = await admin.from("ai_memory_embeddings").delete().in("source_id", sourceIds);
      if (error) return json({ error: error.message }, 400);
      return json({ forgotten: sourceIds.length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    if (err instanceof GatewayError) {
      return json({ error: "AI gateway error", status: err.status, details: err.message }, err.status);
    }
    console.error("ai-memory error", (err as Error)?.message);
    return json({ error: (err as Error)?.message ?? "error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
