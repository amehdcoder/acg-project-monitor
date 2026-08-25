/**
 * frontierClient — browser wrapper around the enterprise Amehnities AI backend.
 *
 * Responsibilities:
 *   • stream `ai-frontier-chat` (SSE) with attachments + live telemetry context
 *   • call `ai-media-generate` for images / video jobs
 *   • push corrections and documents into `ai-memory` (vector store)
 *
 * Everything is authenticated with the signed-in user's session token.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ParsedAttachment } from "./fileParsers";

const FUNCTIONS = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
}

export interface FrontierRoute {
  tier: string;
  label: string;
  model: string;
  questionClass: string;
  learned: boolean;
}

export interface MemoryCitation {
  marker: string;
  title: string;
  kind: string;
  similarity: number;
}

export interface FileCitation { marker: string; name: string; type: string }

export interface FrontierMeta {
  route: FrontierRoute;
  memory: MemoryCitation[];
  files: FileCitation[];
}

export interface FrontierTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  question: string;
  history?: FrontierTurn[];
  attachments?: ParsedAttachment[];
  telemetry?: string;
  tier?: "fast" | "balanced" | "deep";
  signal?: AbortSignal;
  onMeta?: (meta: FrontierMeta) => void;
  onDelta?: (chunk: string, full: string) => void;
}

/** Trim a parsed attachment down to what the model actually needs. */
function toWirePayload(a: ParsedAttachment) {
  return {
    name: a.name,
    type: a.type,
    summary: a.summary,
    excerpt: a.excerpt?.slice(0, 8000) ?? "",
  };
}

/**
 * Streams an answer from `ai-frontier-chat`. Resolves with the full text and
 * the routing/citation metadata carried on the first SSE frame.
 */
export async function streamFrontierChat(
  opts: StreamOptions,
): Promise<{ answer: string; meta: FrontierMeta | null }> {
  const res = await fetch(`${FUNCTIONS}/ai-frontier-chat`, {
    method: "POST",
    headers: await authHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      question: opts.question,
      history: (opts.history ?? []).slice(-10),
      attachments: (opts.attachments ?? []).map(toWirePayload),
      telemetry: opts.telemetry ?? "",
      ...(opts.tier ? { tier: opts.tier } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(detail?.error || `Assistant request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let meta: FrontierMeta | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const frame = JSON.parse(payload);
        if (frame?.type === "meta") {
          meta = { route: frame.route, memory: frame.memory ?? [], files: frame.files ?? [] };
          opts.onMeta?.(meta);
          continue;
        }
        const delta: string = frame?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          answer += delta;
          opts.onDelta?.(delta, answer);
        }
      } catch {
        /* partial frame — ignore */
      }
    }
  }

  return { answer, meta };
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
