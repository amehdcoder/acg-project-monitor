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

/**
 * Local lesson distillation — no external language model.
 *
 * The lesson is extracted deterministically from the reviewer's own words (a
 * correction is already an imperative statement of what the assistant should
 * have done) or, absent a correction, from the grounding signals of the answer
 * itself. This keeps the learning loop entirely self-reliant.
 */
const TOPIC_MAP: [RegExp, string][] = [
  [/coverage|treated|target population/i, "coverage reporting"],
  [/medicine|drug|stock|logistic|reconcil|accountab/i, "medicine accountability"],
  [/supervis|checklist|monitor/i, "supervision evidence"],
  [/gps|coordinate|registry|grid3|ward|lga|state/i, "geographic scoping"],
  [/quiz|pre.?test|post.?test|score/i, "assessment scoring"],
  [/citation|source|reference|evidence/i, "evidence citation"],
  [/denominator|sample|percent|rate|statistic/i, "statistical rigour"],
];

function topicFor(text: string): string {
  for (const [re, topic] of TOPIC_MAP) if (re.test(text)) return topic;
  const word = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 4).slice(0, 2).join(" ");
  return (word || "general").slice(0, 60);
}

/** Turn free text into one imperative, generalisable sentence. */
function toRule(correction: string): string {
  const first = correction.split(/(?<=[.!?])\s+/)[0]?.trim() || correction.trim();
  const stripped = first
    .replace(/^(you should|you must|please|it should|the answer should|next time,?)\s+/i, "")
    .replace(/\b(this|that) (answer|question|one)\b/gi, "such answers")
    .replace(/\b\d[\d,.]*%?\b/g, "the reported figure")
    .trim();
  const sentence = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return (sentence.endsWith(".") ? sentence : `${sentence}.`).slice(0, 240);
}

function distilLesson(payload: {
  question: string; answer: string; rating: number; correction?: string | null;
  citations: number; followups: number;
}): { topic: string; rule: string; worth_keeping: boolean } | null {
  const correction = (payload.correction ?? "").trim();
  if (correction.length >= 12) {
    return {
      topic: topicFor(`${correction} ${payload.question}`),
      rule: toRule(correction),
      worth_keeping: true,
    };
  }

  // No written correction: learn only from clear, diagnosable grounding failures.
  if (payload.rating < 0) {
    if (payload.citations === 0) {
      return {
        topic: topicFor(payload.question),
        rule: "Cite a specific application record [E#] or published source [W#] for every factual claim; never answer from unsourced generalities.",
        worth_keeping: true,
      };
    }
    if (payload.answer.length < 400) {
      return {
        topic: topicFor(payload.question),
        rule: "Answer with the full evidence reading: the numbers, their denominators, the detected signals and the programmatic action to take.",
        worth_keeping: true,
      };
    }
    if (payload.followups === 0) {
      return {
        topic: topicFor(payload.question),
        rule: "Close every answer with concrete follow-up questions grounded in the streams that were actually read.",
        worth_keeping: true,
      };
    }
  }
  return null;
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
    const route = body?.route && typeof body.route === "object" ? body.route : {};
    const questionClass = String(route?.questionClass ?? "general").slice(0, 40);
    const tier = ["fast", "balanced", "deep"].includes(String(route?.tier)) ? String(route.tier) : "balanced";
    const routeModel = String(route?.model ?? "").slice(0, 80);
    const reviewQueueId = typeof body?.reviewQueueId === "string" && /^[0-9a-f-]{36}$/i.test(body.reviewQueueId)
      ? body.reviewQueueId : null;
    const citationCount = Number(body?.citations ?? 0);
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

    // Routing policy learns which model tier actually earns reward per class.
    await admin.rpc("ai_route_reward", {
      _class: questionClass, _tier: tier, _model: routeModel, _reward: reward,
    });

    // Bandit credit assignment: every policy entry that shaped this answer
    // receives the reward, so weak rules decay and strong ones are reinforced.
    await Promise.all(policyIds.map((id) =>
      admin.rpc("ai_policy_reward", { _policy_id: id, _reward: reward })
    ));

    // ---- Admin review queue ------------------------------------------------
    // Batch answers that are either low-confidence (no citable evidence, or a
    // strongly negative reward) or that users keep downvoting, so an admin can
    // correct them in one pass and re-train the policy from those corrections.
    let queued: { reason: string; severity: number; downvotes: number } | null = null;
    if (!reviewQueueId && question.length > 5 && answer.length > 20) {
      const { count: priorDownvotes } = await admin
        .from("ai_chat_feedback")
        .select("id", { count: "exact", head: true })
        .lt("rating", 0)
        .ilike("question", `%${question.slice(0, 60).replace(/[%_]/g, " ")}%`);
      const downvotes = Number(priorDownvotes ?? 0);

      let reason: string | null = null;
      let severity = 1;
      if (downvotes >= 2) { reason = "repeat_downvotes"; severity = 3; }
      else if (rating < 0) { reason = correction ? "user_correction" : "downvoted"; severity = 2; }
      else if (citationCount === 0 && rating <= 0) { reason = "low_confidence"; severity = 1; }
      else if (reward <= -0.5) { reason = "low_confidence"; severity = 2; }

      if (reason) {
        const { data: dup } = await admin
          .from("ai_review_queue")
          .select("id,downvotes")
          .eq("status", "pending")
          .eq("question", question)
          .limit(1)
          .maybeSingle();
        if (dup) {
          await admin.from("ai_review_queue")
            .update({ downvotes: Number(dup.downvotes ?? 0) + (rating < 0 ? 1 : 0), severity })
            .eq("id", dup.id);
        } else {
          await admin.from("ai_review_queue").insert({
            conversation_id: conversationId,
            message_id: messageId,
            question, answer, reason, severity,
            downvotes: Math.max(downvotes, rating < 0 ? 1 : 0),
            citations: citationCount,
            reward,
            question_class: questionClass,
            tier,
            model: routeModel,
            policy_ids: policyIds,
            submitted_by: guard.userId,
          });
        }
        queued = { reason, severity, downvotes };
      }
    }

    // Policy improvement — only from informative feedback.
    let learned: { topic: string; rule: string } | null = null;
    const informative = Boolean(reviewQueueId && correction) ||
      (rating !== 0 && (correction || rating < 0 || reward >= 1));
    if (informative && answer.length > 40) {
      const lesson = distilLesson({
        question, answer, rating, correction,
        citations: citationCount,
        followups: followupCount,
      });
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

    // A reviewed item closes out once its correction has been distilled.
    if (reviewQueueId) {
      await admin.from("ai_review_queue").update({
        status: "resolved",
        reviewer_id: guard.userId,
        reviewer_correction: correction,
        resolved_at: new Date().toISOString(),
      }).eq("id", reviewQueueId);
    }

    return json({ ok: true, reward, learned, queued, route: { tier, questionClass } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
