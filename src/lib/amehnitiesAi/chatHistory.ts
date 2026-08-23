/**
 * Persistence for the Amehnities Data Assistant.
 *
 * Conversations and their messages live in the backend (`ai_chat_conversations`
 * / `ai_chat_messages`), scoped by RLS to the signed-in user, so past chats —
 * with their source citations and suggested follow-ups — can be reopened later
 * from any device.
 */
import { supabase } from "@/integrations/supabase/client";

export interface Citation {
  ref: string;
  table: string;
  label: string;
  eventId: string;
  timestamp: string;
  detail: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  followups: string[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

const asCitations = (v: unknown): Citation[] =>
  Array.isArray(v) ? (v as Citation[]).filter((c) => c && typeof c.ref === "string") : [];

const asFollowups = (v: unknown): string[] =>
  Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === "string") : [];

/** Newest-first list of the current user's saved conversations. */
export async function listConversations(limit = 50): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("ai_chat_conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export async function createConversation(title = "New conversation"): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save chat history.");
  const { data, error } = await supabase
    .from("ai_chat_conversations")
    .insert({ user_id: user.id, title: title.slice(0, 120) })
    .select("id,title,updated_at")
    .single();
  if (error) throw error;
  return { id: data.id, title: data.title, updatedAt: data.updated_at };
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("ai_chat_conversations")
    .update({ title: title.slice(0, 120) })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("ai_chat_conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id,role,content,citations,followups,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content ?? "",
    citations: asCitations(r.citations),
    followups: asFollowups(r.followups),
    createdAt: r.created_at,
  }));
}

/** Appends one message. Returns the database row id (a real UUID). */
export async function saveMessage(
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; citations?: Citation[]; followups?: string[] },
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save chat history.");
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      citations: (msg.citations ?? []) as unknown as never,
      followups: (msg.followups ?? []) as unknown as never,
    })
    .select("id")
    .single();
  if (error) throw error;
  // Bump the conversation so it sorts to the top of the history list.
  await supabase
    .from("ai_chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  return data.id;
}

/** Derives a readable conversation title from the first question asked. */
export function titleFromQuestion(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  return (clean.length > 60 ? `${clean.slice(0, 57)}…` : clean) || "New conversation";
}

/**
 * Splits the model's raw reply into the visible answer and the suggested
 * follow-up questions it appended on the final `FOLLOWUPS:` line.
 */
export function splitFollowups(raw: string): { answer: string; followups: string[] } {
  const match = raw.match(/^\s*FOLLOWUPS:\s*(.+)$/im);
  if (!match) return { answer: raw.trim(), followups: [] };
  const followups = match[1]
    .split("|")
    .map((s) => s.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  return { answer: raw.slice(0, match.index).trim(), followups };
}

/** Citation markers actually referenced by an answer, in first-appearance order. */
export function usedCitations(answer: string, catalog: Citation[]): Citation[] {
  const seen: string[] = [];
  for (const m of answer.matchAll(/\[(E\d+)\]/g)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen
    .map((ref) => catalog.find((c) => c.ref === ref))
    .filter((c): c is Citation => Boolean(c));
}

/* ------------------------------------------------------------------ *
 * Reinforcement-learning loop
 *
 * Human feedback is sent to the `chat-feedback` edge function, which shapes it
 * into a scalar reward, credits the learned-policy entries that produced the
 * answer, and distils durable rules the assistant is conditioned on next time.
 * ------------------------------------------------------------------ */

export interface PolicyApplied { topic: string; content: string; avgReward: number }

export interface RouteInfo {
  tier: "fast" | "balanced" | "deep";
  model: string;
  label: string;
  questionClass: string;
  heuristicTier: string;
  learned: boolean;
  evidence?: { tier: string; avgReward: number; trials: number }[];
}

export interface FeedbackPayload {
  messageId?: string;
  conversationId?: string;
  question: string;
  answer: string;
  rating: -1 | 0 | 1;
  correction?: string;
  citations: number;
  followups: number;
  policyIds: string[];
  regenerated?: boolean;
  route?: RouteInfo;
  /** Set when the feedback comes from the admin review queue. */
  reviewQueueId?: string;
}

export async function sendFeedback(
  payload: FeedbackPayload,
): Promise<{
  reward: number;
  learned: { topic: string; rule: string } | null;
  queued?: { reason: string; severity: number } | null;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || `Feedback failed (${res.status})`);
  return {
    reward: Number(out?.reward ?? 0),
    learned: out?.learned ?? null,
    queued: out?.queued ?? null,
  };
}

/** How many behaviour rules the assistant has learned so far. */
export async function countLearnedRules(): Promise<number> {
  const { count, error } = await supabase
    .from("ai_chat_policy")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("kind", "rule");
  if (error) return 0;
  return count ?? 0;
}


/* ------------------------------------------------------------------ *
 * Admin review queue
 * ------------------------------------------------------------------ */

export interface ReviewItem {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  question: string;
  answer: string;
  reason: string;
  severity: number;
  downvotes: number;
  citations: number;
  reward: number;
  question_class: string;
  tier: "fast" | "balanced" | "deep";
  model: string;
  policy_ids: string[] | null;
  status: string;
  created_at: string;
}

export async function listReviewQueue(status = "pending"): Promise<ReviewItem[]> {
  const { data, error } = await supabase
    .from("ai_review_queue")
    .select("*")
    .eq("status", status)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as ReviewItem[];
}

export async function dismissReviewItem(id: string) {
  const { error } = await supabase
    .from("ai_review_queue")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Submit an admin correction — this is what re-trains the learned policy. */
export async function resolveReviewItem(item: ReviewItem, correction: string) {
  return sendFeedback({
    reviewQueueId: item.id,
    messageId: item.message_id ?? undefined,
    conversationId: item.conversation_id ?? undefined,
    question: item.question,
    answer: item.answer,
    rating: -1,
    correction,
    citations: item.citations,
    followups: 0,
    policyIds: Array.isArray(item.policy_ids) ? item.policy_ids : [],
  });
}

/** Learned routing evidence, for the admin panel. */
export async function listRouteStats() {
  const { data, error } = await supabase
    .from("ai_route_stats")
    .select("question_class,tier,model,avg_reward,trials")
    .order("question_class");
  if (error) return [];
  return data ?? [];
}
