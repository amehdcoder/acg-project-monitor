/**
 * chat-feedback — the reinforcement-learning loop of the Amehnities Data Assistant.
 *
 * Human feedback (thumbs up/down + written corrections) is turned into a scalar
 * reward, credited back to the policy entries that were actually used for the
 * answer (a contextual bandit update), and — when the signal is strong enough —
 * distilled by the model into a durable behaviour rule or a high-reward
 * exemplar that future answers are conditioned on. This is RLHF-style policy
 * improvement without touching model weights: the learned policy lives in the
 * database and is retrieved at inference time.
 */
import { guardRequest } from "../_shared/authGuard.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Reward shaping. Human rating dominates; grounding quality (citation coverage,
 * data-specific follow-ups, refusal to speculate) provides the dense signal that
 * makes learning stable when ratings are sparse.
 */
function shapeReward(input: {
  rating: number;
  correction?: string | null;
  citations: number;
  followups: number;
  answerLength: number;
  regenerated?: boolean;
}): { reward: number; signals: Record<string, number | boolean> } {
  const clampedRating = Math.max(-1, Math.min(1, Number(input.rating) || 0));
  let reward = clampedRating;

  const citationBonus = input.citations > 0 ? Math.min(0.3, 0.1 * input.citations) : -0.2;
  const followupBonus = input.followups >= 2 ? 0.1 : 0;
  const verbosityPenalty = input.answerLength > 4000 ? -0.15 : 0;
  const correctionPenalty = input.correction && input.correction.trim().length > 0 ? -0.25 : 0;
  const regeneratePenalty = input.regenerated ? -0.15 : 0;

  reward += citationBonus + followupBonus + verbosityPenalty + correctionPenalty + regeneratePenalty;
  reward = Math.max(-1.5, Math.min(1.5, Number(reward.toFixed(3))));

  return {
    reward,
    signals: {
      rating: clampedRating,
      citations: input.citations,
      followups: input.followups,
      citationBonus,
      followupBonus,
      verbosityPenalty,
      correctionPenalty,
      regeneratePenalty,
      hasCorrection: Boolean(correctionPenalty),
    },
  };
}

const DISTILL_PROMPT = `You improve an analytics assistant that answers questions strictly from a Nigerian public-health application's live activity data.

You are given one question, the answer that was produced, the user's rating and (optionally) their correction. Extract ONE durable, generalisable lesson that would make FUTURE answers better.

Return ONLY a JSON object, no prose, no code fences:
{"topic":"<2-4 word subject, lowercase>","rule":"<one imperative sentence, max 200 chars, generalisable — never about this one question's specific numbers>","worth_keeping":true|false}

Set worth_keeping to false when the feedback carries no transferable lesson (e.g. a bare thumbs-up on a trivial answer, or a complaint about something outside the assistant's control).`;

async function distilLesson(apiKey: string, payload: {
  question: string; answer: string; rating: number; correction?: string | null;
}): Promise<{ topic: string; rule: string; worth_keeping: boolean } | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: DISTILL_PROMPT },
        {
          role: "user",
          content: [
            `QUESTION: ${payload.question.slice(0, 1500)}`,
            `ANSWER: ${payload.answer.slice(0, 4000)}`,
            `RATING: ${payload.rating > 0 ? "positive" : payload.rating < 0 ? "negative" : "neutral"}`,
            payload.correction ? `USER CORRECTION: ${payload.correction.slice(0, 1500)}` : "",
          ].filter(Boolean).join("\n\n"),
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed?.rule !== "string" || !parsed.rule.trim()) return null;
    return {
      topic: String(parsed.topic ?? "general").slice(0, 60).toLowerCase(),
      rule: parsed.rule.trim().slice(0, 240),
      worth_keeping: parsed.worth_keeping !== false,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await guardRequest(req, corsHeaders, { requireAdmin: false });
  if (guard.response) return guard.response;
  if (!guard.userId) return json({ error: "Sign in to send feedback." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const rating = Number(body?.rating ?? 0);
    if (![-1, 0, 1].includes(rating)) return json({ error: "rating must be -1, 0 or 1" }, 400);

    const question = String(body?.question ?? "").slice(0, 4000);
    const answer = String(body?.answer ?? "").slice(0, 12000);
    const correction = body?.correction ? String(body.correction).slice(0, 4000) : null;
    const messageId = typeof body?.messageId === "string" && /^[0-9a-f-]{36}$/i.test(body.messageId)
      ? body.messageId : null;
    const conversationId = typeof body?.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(body.conversationId)
      ? body.conversationId : null;
    const policyIds: string[] = Array.isArray(body?.policyIds)
      ? body.policyIds.filter((p: unknown) => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)).slice(0, 12)
      : [];

    const { reward, signals } = shapeReward({
      rating,
      correction,
      citations: Number(body?.citations ?? 0),
      followups: Number(body?.followups ?? 0),
      answerLength: answer.length,
      regenerated: Boolean(body?.regenerated),
    });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { error: insertError } = await admin.from("ai_chat_feedback").insert({
      user_id: guard.userId,
      conversation_id: conversationId,
      message_id: messageId,
      question, answer, rating, correction, reward,
      signals: { ...signals, policyIds },
    });
    if (insertError) return json({ error: insertError.message }, 400);

    // Bandit credit assignment: every policy entry that shaped this answer
    // receives the reward, so weak rules decay and strong ones are reinforced.
    await Promise.all(policyIds.map((id) =>
      admin.rpc("ai_policy_reward", { _policy_id: id, _reward: reward })
    ));

    // Policy improvement — only from informative feedback.
    let learned: { topic: string; rule: string } | null = null;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const informative = rating !== 0 && (correction || rating < 0 || reward >= 1);
    if (apiKey && informative && answer.length > 40) {
      const lesson = await distilLesson(apiKey, { question, answer, rating, correction });
      if (lesson?.worth_keeping) {
        const { data: existing } = await admin
          .from("ai_chat_policy")
          .select("id,content")
          .eq("kind", "rule")
          .eq("topic", lesson.topic)
          .limit(20);
        const duplicate = (existing ?? []).find((r) =>
          r.content.trim().toLowerCase() === lesson.rule.toLowerCase());
        if (duplicate) {
          await admin.rpc("ai_policy_reward", { _policy_id: duplicate.id, _reward: Math.abs(reward) });
        } else {
          await admin.from("ai_chat_policy").insert({
            kind: "rule",
            topic: lesson.topic,
            content: lesson.rule,
            created_by: guard.userId,
            trials: 1,
            reward_sum: 0.2,
            avg_reward: 0.2,
          });
        }
        learned = { topic: lesson.topic, rule: lesson.rule };
      }
    }

    // A strongly-rewarded answer becomes a retrievable exemplar of good style.
    if (rating > 0 && reward >= 1 && question.length > 8 && answer.length > 120) {
      await admin.from("ai_chat_policy").insert({
        kind: "exemplar",
        topic: question.split(/\s+/).slice(0, 4).join(" ").toLowerCase().slice(0, 60),
        content: "High-rated answer pattern",
        question,
        answer: answer.slice(0, 2500),
        created_by: guard.userId,
        trials: 1,
        reward_sum: reward,
        avg_reward: reward,
      });
    }

    return json({ ok: true, reward, learned });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
