/**
 * frontierClient — browser wrapper around the Amehnities AI backend services.
 *
 * Chat answers are composed locally (see `selfReliantAnswer.ts`); no external
 * model endpoint is called from here. What remains:
 *   • `ai-media-generate` for image / video jobs
 *   • `ai-memory` (locally embedded vector store) for corrections & documents
 *
 * Everything is authenticated with the signed-in user's session token.
 */
import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
}


/* ------------------------------------------------------------------ *
 * Multimodal media
 * ------------------------------------------------------------------ */

export interface GeneratedMedia {
  id?: string;
  kind: "image" | "video";
  prompt: string;
  model?: string | null;
  status: "queued" | "completed" | "unavailable" | "failed";
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export async function generateMedia(params: {
  kind: "image" | "video";
  prompt: string;
  quality?: "fast" | "quality";
  conversationId?: string | null;
}): Promise<{ status: string; media: GeneratedMedia; message?: string }> {
  const res = await fetch(`${FUNCTIONS}/ai-media-generate`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      kind: params.kind,
      prompt: params.prompt,
      quality: params.quality ?? "quality",
      conversation_id: params.conversationId ?? null,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `Media generation failed (${res.status})`);
  return out;
}

/** Poll a queued video job until it completes, fails, or the caller aborts. */
export async function pollMedia(
  id: string,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ status: string; media: GeneratedMedia; message?: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let last: { status: string; media: GeneratedMedia; message?: string } | null = null;
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(`${FUNCTIONS}/ai-media-generate`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ action: "status", id }),
      signal: opts.signal,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `Media status failed (${res.status})`);
    last = out;
    if (out?.status !== "queued") return out;
    opts.onProgress?.(Number(out?.progress ?? 0));
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (last) return last;
  throw new Error("Video generation timed out.");
}


/** Durable media cards previously produced by this user. */
export async function listGeneratedMedia(limit = 24): Promise<GeneratedMedia[]> {
  const { data, error } = await supabase
    .from("ai_generated_media")
    .select("id,kind,prompt,model,status,url,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as GeneratedMedia[];
}

/* ------------------------------------------------------------------ *
 * Long-term vector memory
 * ------------------------------------------------------------------ */

export interface MemoryEntryInput {
  kind?: string;
  title?: string;
  content: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
}

async function callMemory(body: Record<string, unknown>) {
  const res = await fetch(`${FUNCTIONS}/ai-memory`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `Memory request failed (${res.status})`);
  return out;
}

export async function indexMemory(entries: MemoryEntryInput[]): Promise<{ indexed: number }> {
  if (!entries.length) return { indexed: 0 };
  return callMemory({ action: "index", entries }) as Promise<{ indexed: number }>;
}

/**
 * Store a reviewer correction as an authoritative system-feedback prompt in the
 * vector store, so future answers of the same class recall it.
 */
export async function indexFeedbackCorrection(params: {
  question: string;
  correction: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ indexed: number }> {
  return callMemory({
    action: "feedback",
    question: params.question,
    correction: params.correction,
    source_id: params.sourceId,
    metadata: params.metadata ?? {},
  }) as Promise<{ indexed: number }>;
}

export async function searchMemory(query: string, limit = 8) {
  const out = await callMemory({ action: "search", query, limit });
  return (out?.matches ?? []) as { title: string | null; kind: string; content: string; similarity: number }[];
}
